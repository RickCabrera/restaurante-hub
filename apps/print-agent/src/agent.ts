// Agente de impresión: se conecta a la API por Socket.IO (/rt), recibe trabajos y los imprime.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioClient, Socket } from 'socket.io-client';
import { PrintDocument, buildTestTicket, renderEscPos } from '@rh/printing';
import {
  AgentHello, AgentHelloAck, DiscoveredPrinter, PrintAck, PrintEvents, PrintJobMessage, PrinterConfig,
  PrinterConnectionLabel,
} from '@rh/shared';
import { Logger, createConsoleLogger } from './logger';
import { KeyedSerialQueue, RecentIds, withTimeout } from './job-queue';
import { AGENT_CONNECTIONS, sendToPrinter } from './transports';
import { discoverPrinters } from './discover';

export type AgentState = 'stopped' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface AgentStatus {
  state: AgentState;
  connected: boolean;
  apiUrl: string;
  name: string;
  kind: 'agent' | 'desktop';
  version: string;
  agentId?: string;
  businessId?: string;
  printers: PrinterConfig[];
  discovered: DiscoveredPrinter[];
  /** Trabajos en cola o imprimiéndose. */
  queued: number;
  printed: number;
  failed: number;
  lastJobAt?: string;
  lastError?: string;
  /** Último error por impresora (id → mensaje), se limpia al imprimir bien. */
  printerErrors: Record<string, string>;
}

export interface PrintAgentConfig {
  apiUrl: string;
  token: string;
  name?: string;
  kind?: 'agent' | 'desktop';
  logger?: Logger;
  onStatus?: (s: AgentStatus) => void;
  /** Tiempo máximo por trabajo (ms). Default 15 000. */
  jobTimeoutMs?: number;
  /** Ventana de deduplicación de jobIds (ms). Default 10 min. */
  dedupeMs?: number;
  /** Versión reportada (default: package.json del agente). */
  version?: string;
  /** @internal pruebas: fábrica de socket y envío a impresora. */
  socketFactory?: (url: string, opts: Record<string, unknown>) => Socket;
  /** @internal pruebas */
  sendBytes?: (printer: PrinterConfig, bytes: Uint8Array, opts: { timeoutMs: number }) => Promise<void>;
  /** @internal pruebas: desactiva la detección automática al conectar. */
  skipDiscovery?: boolean;
}

export interface PrintAgent {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): AgentStatus;
  discover(): Promise<DiscoveredPrinter[]>;
  printTest(printer: PrinterConfig): Promise<void>;
}

export function agentVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** `https://api.x.com/api/` → `https://api.x.com` (el namespace /rt vive en la raíz). */
export function normalizeApiUrl(url: string): string {
  let u = String(url || '').trim().replace(/\/+$/, '');
  if (/\/api$/i.test(u)) u = u.slice(0, -4);
  return u;
}

/**
 * La API envuelve los acks como `{ ok: true, data }` / `{ ok: false, error }`.
 * Se aceptan ambos formatos (envuelto o directo).
 */
export function unwrapAck<T>(res: unknown): T {
  if (res && typeof res === 'object' && 'ok' in res && typeof (res as { ok: unknown }).ok === 'boolean') {
    const r = res as { ok: boolean; data?: T; error?: string };
    if (!r.ok) throw new Error(r.error || 'La API rechazó la solicitud');
    return r.data as T;
  }
  return res as T;
}

export function createPrintAgent(config: PrintAgentConfig): PrintAgent {
  const log = config.logger ?? createConsoleLogger(config.kind === 'desktop' ? 'desktop-agent' : 'print-agent');
  const jobTimeoutMs = config.jobTimeoutMs ?? 15_000;
  const apiUrl = normalizeApiUrl(config.apiUrl);
  const queue = new KeyedSerialQueue();
  const printed = new RecentIds(config.dedupeMs ?? 10 * 60_000);
  const inFlight = new Set<string>();
  const send = config.sendBytes ?? ((p, b, o) => sendToPrinter(p, b, o));
  let socket: Socket | null = null;
  let stopped = true;

  const st: AgentStatus = {
    state: 'stopped',
    connected: false,
    apiUrl,
    name: config.name || os.hostname(),
    kind: config.kind ?? 'agent',
    version: config.version ?? agentVersion(),
    printers: [],
    discovered: [],
    queued: 0,
    printed: 0,
    failed: 0,
    printerErrors: {},
  };

  const emitStatus = () => {
    st.queued = queue.size();
    try {
      config.onStatus?.(snapshot());
    } catch (e) {
      log.warn(`onStatus lanzó un error: ${(e as Error).message}`);
    }
  };
  const snapshot = (): AgentStatus => ({
    ...st,
    queued: queue.size(),
    printers: [...st.printers],
    discovered: [...st.discovered],
    printerErrors: { ...st.printerErrors },
  });
  const setState = (s: AgentState, err?: string) => {
    st.state = s;
    st.connected = s === 'connected';
    if (err !== undefined) st.lastError = err;
    emitStatus();
  };

  const ack = (payload: PrintAck) => {
    if (!socket) return;
    // Socket.IO guarda el mensaje en búfer si estamos desconectados y lo envía al reconectar.
    socket.emit(PrintEvents.ACK, payload);
  };

  async function processJob(job: PrintJobMessage): Promise<void> {
    if (!job || !job.jobId || !job.printer) {
      log.warn('Trabajo inválido recibido (sin jobId o impresora)');
      return;
    }
    const { jobId, printer } = job;
    if (printed.has(jobId)) {
      log.info(`Trabajo ${jobId} ya impreso; se confirma sin reimprimir`);
      ack({ jobId, status: 'PRINTED' });
      return;
    }
    if (inFlight.has(jobId)) {
      log.debug?.(`Trabajo ${jobId} ya está en cola; se ignora el duplicado`);
      return;
    }
    if (!AGENT_CONNECTIONS.includes(printer.connection)) {
      ack({ jobId, status: 'FAILED', error: `Este agente no atiende impresoras de tipo ${printer.connection}` });
      return;
    }
    inFlight.add(jobId);
    emitStatus();
    try {
      await queue.run(printer.id, async () => {
        const doc = job.document as PrintDocument;
        if (!doc || !Array.isArray(doc.blocks)) throw new Error('Documento de impresión inválido');
        const bytes = renderEscPos(
          { ...doc, paperWidth: printer.paperWidth ?? doc.paperWidth },
          { dialect: printer.dialect, copies: printer.copies || 1, cut: printer.cutPaper, openDrawer: printer.openDrawer },
        );
        log.info(`Imprimiendo ${jobId} "${doc.title ?? job.kind}" en ${printer.name} (${printer.connection}, ${bytes.length} bytes)`);
        await withTimeout(send(printer, bytes, { timeoutMs: jobTimeoutMs - 1_000 }), jobTimeoutMs);
      });
      printed.add(jobId);
      st.printed++;
      st.lastJobAt = new Date().toISOString();
      delete st.printerErrors[printer.id];
      log.info(`✓ ${jobId} impreso en ${printer.name}`);
      ack({ jobId, status: 'PRINTED' });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      st.failed++;
      st.lastJobAt = new Date().toISOString();
      st.printerErrors[printer.id] = msg;
      log.error(`✗ ${jobId} falló en ${printer.name}: ${msg}`);
      ack({ jobId, status: 'FAILED', error: msg });
    } finally {
      inFlight.delete(jobId);
      emitStatus();
    }
  }

  async function hello(): Promise<void> {
    if (!socket) return;
    const payload: AgentHello = {
      version: st.version,
      hostname: st.name,
      platform: process.platform,
      kind: st.kind,
      discovered: st.discovered,
    };
    try {
      const res = unwrapAck<AgentHelloAck | null>(await socket.timeout(15_000).emitWithAck(PrintEvents.AGENT_HELLO, payload));
      if (res) {
        st.agentId = res.agentId;
        st.businessId = res.businessId;
        st.printers = Array.isArray(res.printers) ? res.printers : [];
        log.info(`Registrado como agente ${res.agentId ?? '?'} · ${st.printers.length} impresora(s): ${st.printers.map((p) => p.name).join(', ') || '—'}`);
      }
      emitStatus();
    } catch (e) {
      log.warn(`La API no confirmó el saludo: ${(e as Error).message}`);
    }
  }

  async function pull(): Promise<void> {
    if (!socket) return;
    try {
      const res = unwrapAck<{ jobs?: PrintJobMessage[] } | null>(await socket.timeout(20_000).emitWithAck(PrintEvents.PULL, {}));
      const jobs = res?.jobs ?? [];
      if (jobs.length) log.info(`${jobs.length} trabajo(s) pendiente(s) recibidos al reconectar`);
      // se encolan sin esperar: la cola serializa por impresora
      for (const j of jobs) void processJob(j);
    } catch (e) {
      log.warn(`No se pudieron pedir los trabajos pendientes: ${(e as Error).message}`);
    }
  }

  async function runDiscovery(): Promise<DiscoveredPrinter[]> {
    try {
      st.discovered = await withTimeout(discoverPrinters(), 20_000);
    } catch (e) {
      log.warn(`Detección de impresoras falló: ${(e as Error).message}`);
    }
    emitStatus();
    return st.discovered;
  }

  async function onConnect() {
    log.info(`Conectado a ${apiUrl}`);
    setState('connected', '');
    await hello();
    await pull();
  }

  const api: PrintAgent = {
    async start() {
      if (!stopped) return;
      if (!apiUrl) throw new Error('Falta la URL de la API');
      if (!config.token) throw new Error('Falta el token del agente');
      stopped = false;
      setState('connecting');
      if (!config.skipDiscovery) await runDiscovery();
      if (stopped) return;
      const opts = {
        auth: { token: `Agent ${config.token}` },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 30_000,
        randomizationFactor: 0.5,
        timeout: 20_000,
      };
      const url = `${apiUrl}/rt`;
      socket = config.socketFactory ? config.socketFactory(url, opts) : ioClient(url, opts);
      socket.on('connect', () => void onConnect());
      socket.on('disconnect', (reason) => {
        log.warn(`Desconectado (${reason}); reintentando…`);
        setState(stopped ? 'stopped' : 'disconnected');
        // si el servidor nos desconectó explícitamente, socket.io no reintenta solo
        if (reason === 'io server disconnect' && !stopped) setTimeout(() => socket?.connect(), 5_000);
      });
      socket.on('connect_error', (err: Error) => {
        const msg = /unauthor|forbidden|token|401|403/i.test(err.message)
          ? `Token de agente inválido o revocado (${err.message})`
          : `No se pudo conectar a ${apiUrl}: ${err.message}`;
        if (st.lastError !== msg) log.error(msg);
        setState('error', msg);
      });
      socket.on(PrintEvents.JOB, (job: PrintJobMessage, cb?: (r: unknown) => void) => {
        if (typeof cb === 'function') cb({ received: true });
        void processJob(job);
      });
      socket.on(PrintEvents.PRINTERS_CHANGED, (payload?: { printers?: PrinterConfig[] }) => {
        if (payload && Array.isArray(payload.printers)) {
          st.printers = payload.printers;
          log.info(`Configuración de impresoras actualizada (${st.printers.length})`);
          emitStatus();
        } else void hello();
      });
    },

    async stop() {
      stopped = true;
      const s = socket;
      socket = null;
      if (s) {
        s.removeAllListeners();
        s.disconnect();
      }
      await withTimeout(queue.drain(), jobTimeoutMs).catch(() => undefined);
      setState('stopped');
    },

    status: () => snapshot(),

    async discover() {
      const list = await runDiscovery();
      if (socket?.connected) socket.emit(PrintEvents.DISCOVERED, { printers: list });
      return list;
    },

    async printTest(printer: PrinterConfig) {
      const doc = buildTestTicket({
        printerName: printer.name,
        connectionLabel: PrinterConnectionLabel[printer.connection] ?? printer.connection,
        paperWidth: printer.paperWidth ?? 80,
        createdAt: new Date().toISOString(),
      });
      const bytes = renderEscPos(doc, { dialect: printer.dialect, cut: printer.cutPaper !== false, openDrawer: printer.openDrawer });
      await queue.run(printer.id || 'test', () => withTimeout(send(printer, bytes, { timeoutMs: jobTimeoutMs - 1_000 }), jobTimeoutMs));
    },
  };
  return api;
}
