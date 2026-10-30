import net from 'node:net';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderEscPos } from '@rh/printing';
import { PrintEvents, PrintJobMessage, PrinterConfig } from '@rh/shared';
import { createPrintAgent, normalizeApiUrl, unwrapAck } from './agent';
import { sendTcp, networkTransport } from './transports';
import { KeyedSerialQueue, RecentIds } from './job-queue';
import { silentLogger } from './logger';

// ---------- servidor TCP falso (impresora en el puerto 9100) ----------
function fakePrinter(): Promise<{ port: number; received: Promise<Buffer>; close: () => void }> {
  return new Promise((resolve) => {
    let resolveData!: (b: Buffer) => void;
    const received = new Promise<Buffer>((r) => (resolveData = r));
    const server = net.createServer((sock) => {
      const chunks: Buffer[] = [];
      sock.on('data', (c) => chunks.push(c));
      sock.on('end', () => {
        resolveData(Buffer.concat(chunks));
        sock.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ port, received, close: () => server.close() });
    });
  });
}

const basePrinter = (over: Partial<PrinterConfig> = {}): PrinterConfig => ({
  id: 'p1', name: 'Cocina', connection: 'NETWORK', dialect: 'ESC_POS', host: '127.0.0.1', port: 9100,
  paperWidth: 80, copies: 1, cutPaper: true, openDrawer: false, ...over,
});

describe('transporte de red', () => {
  it('la impresora recibe exactamente los bytes', async () => {
    const fp = await fakePrinter();
    const doc = { title: 'x', paperWidth: 80 as const, blocks: [{ type: 'text' as const, text: 'Hola ñandú' }, { type: 'cut' as const }] };
    const bytes = renderEscPos(doc);
    await networkTransport.print(basePrinter({ port: fp.port }), bytes);
    const got = await fp.received;
    expect(Array.from(got)).toEqual(Array.from(bytes));
    fp.close();
  });

  it('error claro si la conexión es rechazada', async () => {
    const srv = net.createServer();
    const port = await new Promise<number>((r) => srv.listen(0, '127.0.0.1', () => r((srv.address() as net.AddressInfo).port)));
    await new Promise((r) => srv.close(r));
    await expect(sendTcp('127.0.0.1', port, new Uint8Array([1]), 2000)).rejects.toThrow(/rechazó la conexión/);
  });

  it('falla si no hay IP', async () => {
    await expect(networkTransport.print(basePrinter({ host: '' }), new Uint8Array([1]))).rejects.toThrow(/no tiene IP/);
  });
});

// ---------- socket falso ----------
class MockSocket extends EventEmitter {
  connected = false;
  emitted: { ev: string; payload: unknown }[] = [];
  handlers: Record<string, (payload: unknown) => unknown> = {};
  timeout() {
    return this;
  }
  async emitWithAck(ev: string, payload: unknown) {
    this.emitted.push({ ev, payload });
    return this.handlers[ev]?.(payload);
  }
  // emit del cliente hacia el servidor -> se registra; los eventos del servidor se simulan con serverEmit
  emit(ev: string, ...args: unknown[]): boolean {
    this.emitted.push({ ev, payload: args[0] });
    return true;
  }
  serverEmit(ev: string, ...args: unknown[]) {
    return super.emit(ev, ...args);
  }
  connect() {
    this.connected = true;
    super.emit('connect');
    return this;
  }
  disconnect() {
    this.connected = false;
    return this;
  }
  acks() {
    return this.emitted.filter((e) => e.ev === PrintEvents.ACK).map((e) => e.payload as { jobId: string; status: string; error?: string });
  }
}

const job = (jobId: string, printer = basePrinter(), text = jobId): PrintJobMessage => ({
  jobId, kind: 'KITCHEN', printer, createdAt: new Date().toISOString(),
  document: { title: text, paperWidth: 80, blocks: [{ type: 'text', text }] },
});

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 2000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout esperando condición');
    await tick(5);
  }
}

describe('agente: flujo de trabajos y acks', () => {
  let agent: ReturnType<typeof createPrintAgent> | null = null;
  afterEach(async () => {
    await agent?.stop();
    agent = null;
  });

  function setup(sendBytes: (p: PrinterConfig, b: Uint8Array) => Promise<void>, pending: PrintJobMessage[] = [], jobTimeoutMs = 15_000) {
    const sock = new MockSocket();
    // la API envuelve los acks: { ok: true, data }
    sock.handlers[PrintEvents.AGENT_HELLO] = () => ({ ok: true, data: { agentId: 'a1', businessId: 'b1', printers: [basePrinter()] } });
    sock.handlers[PrintEvents.PULL] = () => ({ ok: true, data: { jobs: pending } });
    let factoryArgs: { url: string; opts: Record<string, unknown> } | null = null;
    agent = createPrintAgent({
      apiUrl: 'https://api.example.com/api/', token: 'tok123', logger: silentLogger, skipDiscovery: true, jobTimeoutMs,
      socketFactory: (url, opts) => {
        factoryArgs = { url, opts };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return sock as any;
      },
      sendBytes: (p, b) => sendBytes(p, b),
    });
    return { sock, factory: () => factoryArgs };
  }

  it('se conecta a /rt con token de agente, saluda y procesa pendientes', async () => {
    const sent: string[] = [];
    const { sock, factory } = setup(async (_p, b) => { sent.push(Buffer.from(b).toString('latin1')); }, [job('j1'), job('j2')]);
    await agent!.start();
    expect(factory()!.url).toBe('https://api.example.com/rt');
    expect(factory()!.opts.auth).toEqual({ token: 'Agent tok123' });
    expect(factory()!.opts.transports).toEqual(['websocket', 'polling']);
    sock.connect();
    await until(() => sock.acks().length === 2);
    const hello = sock.emitted.find((e) => e.ev === PrintEvents.AGENT_HELLO)!.payload as { kind: string; platform: string };
    expect(hello.kind).toBe('agent');
    expect(hello.platform).toBe(process.platform);
    expect(sock.acks()).toEqual([{ jobId: 'j1', status: 'PRINTED' }, { jobId: 'j2', status: 'PRINTED' }]);
    expect(sent[0]).toContain('j1');
    expect(agent!.status().printers).toHaveLength(1);
    expect(agent!.status().agentId).toBe('a1');
    expect(agent!.status().connected).toBe(true);
  });

  it('serializa por impresora (no se traslapan)', async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const { sock } = setup(async (_p, b) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await tick(20);
      order.push(Buffer.from(b).toString('latin1').match(/j\d/)![0]);
      active--;
    });
    await agent!.start();
    sock.connect();
    await tick(5);
    sock.serverEmit(PrintEvents.JOB, job('j1'));
    sock.serverEmit(PrintEvents.JOB, job('j2'));
    sock.serverEmit(PrintEvents.JOB, job('j3'));
    await until(() => sock.acks().length === 3);
    expect(maxActive).toBe(1);
    expect(order).toEqual(['j1', 'j2', 'j3']);
  });

  it('reporta FAILED con el error y sigue con el siguiente', async () => {
    const { sock } = setup(async (_p, b) => {
      if (Buffer.from(b).toString('latin1').includes('malo')) throw new Error('Sin papel');
    });
    await agent!.start();
    sock.connect();
    await tick(5);
    sock.serverEmit(PrintEvents.JOB, job('j1', basePrinter(), 'malo'));
    sock.serverEmit(PrintEvents.JOB, job('j2', basePrinter(), 'bueno'));
    await until(() => sock.acks().length === 2);
    expect(sock.acks()[0]).toEqual({ jobId: 'j1', status: 'FAILED', error: 'Sin papel' });
    expect(sock.acks()[1]).toEqual({ jobId: 'j2', status: 'PRINTED' });
    expect(agent!.status().failed).toBe(1);
    expect(agent!.status().printerErrors).toEqual({});
  });

  it('no reimprime un jobId ya impreso (reenvío) pero vuelve a confirmar', async () => {
    const send = vi.fn(async () => {});
    const { sock } = setup(send);
    await agent!.start();
    sock.connect();
    await tick(5);
    sock.serverEmit(PrintEvents.JOB, job('dup'));
    await until(() => sock.acks().length === 1);
    sock.serverEmit(PrintEvents.JOB, job('dup'));
    await until(() => sock.acks().length === 2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sock.acks()[1]).toEqual({ jobId: 'dup', status: 'PRINTED' });
  });

  it('timeout por trabajo', async () => {
    const { sock } = setup(() => new Promise(() => {}), [], 1_100);
    await agent!.start();
    sock.connect();
    await tick(5);
    sock.serverEmit(PrintEvents.JOB, job('lento'));
    await until(() => sock.acks().length === 1, 3000);
    expect(sock.acks()[0].status).toBe('FAILED');
    expect(sock.acks()[0].error).toMatch(/excedió/);
  });

  it('rechaza conexiones que no son del agente', async () => {
    const send = vi.fn(async () => {});
    const { sock } = setup(send);
    await agent!.start();
    sock.connect();
    await tick(5);
    sock.serverEmit(PrintEvents.JOB, job('bt', basePrinter({ connection: 'BLUETOOTH' })));
    await until(() => sock.acks().length === 1);
    expect(sock.acks()[0].status).toBe('FAILED');
    expect(send).not.toHaveBeenCalled();
  });

  it('actualiza impresoras con PRINTERS_CHANGED', async () => {
    const { sock } = setup(async () => {});
    await agent!.start();
    sock.connect();
    await tick(5);
    sock.serverEmit(PrintEvents.PRINTERS_CHANGED, { printers: [basePrinter({ id: 'x' }), basePrinter({ id: 'y' })] });
    expect(agent!.status().printers.map((p) => p.id)).toEqual(['x', 'y']);
  });

  it('el ticket se renderiza con dialecto, copias y corte de la impresora', async () => {
    let got: Uint8Array | null = null;
    const { sock } = setup(async (_p, b) => { got = b; });
    await agent!.start();
    sock.connect();
    await tick(5);
    sock.serverEmit(PrintEvents.JOB, job('s1', basePrinter({ dialect: 'STAR', copies: 2 })));
    await until(() => sock.acks().length === 1);
    const arr = Array.from(got!);
    // dos inicializaciones (copias) con code page STAR y corte STAR al final
    expect(arr.filter((x, i) => x === 0x1b && arr[i + 1] === 0x40).length).toBe(2);
    expect(arr.slice(0, 6)).toEqual([0x1b, 0x40, 0x1b, 0x1d, 0x74, 4]);
    expect(arr.slice(-3)).toEqual([0x1b, 0x64, 2]);
  });
});

describe('utilidades', () => {
  it('unwrapAck acepta formato envuelto y directo', () => {
    expect(unwrapAck({ ok: true, data: { a: 1 } })).toEqual({ a: 1 });
    expect(unwrapAck({ jobs: [] })).toEqual({ jobs: [] });
    expect(() => unwrapAck({ ok: false, error: 'Solo agentes' })).toThrow('Solo agentes');
  });
  it('normalizeApiUrl', () => {
    expect(normalizeApiUrl('https://x.up.railway.app/api/')).toBe('https://x.up.railway.app');
    expect(normalizeApiUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });
  it('RecentIds expira', () => {
    let now = 0;
    const r = new RecentIds(1000, () => now);
    r.add('a');
    expect(r.has('a')).toBe(true);
    now = 2000;
    expect(r.has('a')).toBe(false);
  });
  it('KeyedSerialQueue corre en paralelo entre impresoras distintas', async () => {
    const q = new KeyedSerialQueue();
    let active = 0;
    let max = 0;
    const task = async () => { active++; max = Math.max(max, active); await tick(20); active--; };
    await Promise.all([q.run('a', task), q.run('b', task)]);
    expect(max).toBe(2);
    expect(q.size()).toBe(0);
  });
});
