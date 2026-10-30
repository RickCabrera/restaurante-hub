/**
 * E2E Impresión + KDS + POS contra la BD `restaurante_hub_c` (sembrada con el seed demo, POS activo).
 * Ejecutar: cd apps/api && npx jest --config test/jest-e2e.json --runInBand pos
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://postgres@localhost:5432/restaurante_hub_test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret-change-me-1234567890';
delete process.env.REDIS_URL;

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { AppModule } from '../src/app.module';
import { DB, Db } from '../src/db/db.module';
import * as s from '../src/db/schema';

jest.setTimeout(60_000);

describe('POS + impresión (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  let http: ReturnType<typeof request>;
  let port: number;
  let agentSocket: Socket | null = null;
  const received: { jobId: string; kind: string; printer: { id: string; host?: string | null }; document: { title: string } }[] = [];

  let bid: string;
  let cocinaId: string;
  let admin: string;
  let caja: string;
  let mesero: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = async (email: string) => {
    const r = await http.post('/api/auth/login').send({ login: email, password: 'demo1234' }).expect(200);
    return r.body.accessToken as string;
  };
  const waitFor = async <T>(fn: () => T | undefined | null | false, ms = 5000): Promise<T> => {
    const end = Date.now() + ms;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > end) throw new Error('timeout esperando condición');
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as { port: number }).port;
    http = request(app.getHttpServer());
    db = app.get<Db>(DB);

    const biz = await db.query.businesses.findFirst({ where: eq(s.businesses.slug, 'demo') });
    bid = biz!.id;
    cocinaId = (await db.query.areas.findFirst({ where: and(eq(s.areas.businessId, bid), eq(s.areas.name, 'Cocina')) }))!.id;

    // Estado limpio e idempotente
    await db.update(s.tickets).set({ status: 'CANCELADA', closedAt: new Date(), cancelReason: 'e2e reset' })
      .where(and(eq(s.tickets.businessId, bid), inArray(s.tickets.status, ['ABIERTA', 'POR_COBRAR'])));
    const areaIds = (await db.query.diningAreas.findMany({ where: eq(s.diningAreas.businessId, bid) })).map((a) => a.id);
    await db.update(s.diningTables).set({ status: 'LIBRE' }).where(inArray(s.diningTables.diningAreaId, areaIds));
    await db.update(s.cashSessions).set({ closedAt: new Date() }).where(and(eq(s.cashSessions.businessId, bid), isNull(s.cashSessions.closedAt)));
    await db.update(s.printAgents).set({ revokedAt: new Date() }).where(and(eq(s.printAgents.businessId, bid), isNull(s.printAgents.revokedAt)));
    await db.delete(s.printers).where(and(eq(s.printers.businessId, bid), eq(s.printers.name, 'Cocina E2E')));

    admin = await login('admin@demo.mx');
    caja = await login('caja@demo.mx');
    mesero = await login('mesero@demo.mx');
  });

  afterAll(async () => {
    agentSocket?.disconnect();
    await app?.close();
  });

  let agentToken: string;
  let printerId: string;
  let ticketId: string;
  let sessionId: string;
  let kdsToken: string;

  it('lista conexiones con su manejador (APP-03)', async () => {
    const r = await http.get('/api/printing/connections?platform=android').set(auth(admin)).expect(200);
    expect(r.body.find((c: { value: string }) => c.value === 'BLUETOOTH')).toMatchObject({ handler: 'MOBILE', available: true });
    expect(r.body.find((c: { value: string }) => c.value === 'NETWORK')).toMatchObject({ handler: 'AGENT', available: false });
  });

  it('crea agente (token una sola vez) e impresora de red para Cocina (auto-asignada)', async () => {
    const a = await http.post('/api/printing/agents').set(auth(admin)).send({ name: 'PC Cocina', kind: 'agent' }).expect(201);
    expect(a.body.token).toEqual(expect.any(String));
    expect(a.body.configString).toContain(a.body.token);
    agentToken = a.body.token;

    await http.post('/api/printing/printers').set(auth(admin)).send({ name: 'Cocina E2E', connection: 'NETWORK', areaId: cocinaId }).expect(400);
    const p = await http.post('/api/printing/printers').set(auth(admin))
      .send({ name: 'Cocina E2E', connection: 'NETWORK', host: '192.168.1.80', areaId: cocinaId, paperWidth: 80 }).expect(201);
    expect(p.body).toMatchObject({ connection: 'NETWORK', port: 9100, agentId: a.body.agent.id, areaName: 'Cocina' });
    printerId = p.body.id;

    const list = await http.get('/api/printing/agents').set(auth(admin)).expect(200);
    expect(list.body.find((x: { id: string }) => x.id === a.body.agent.id).printers).toHaveLength(1);
    // meseros no administran impresoras
    await http.get('/api/printing/agents').set(auth(mesero)).expect(403);
  });

  it('el agente se conecta, envía hello y recibe su configuración', async () => {
    agentSocket = io(`http://127.0.0.1:${port}/rt`, { auth: { token: `Agent ${agentToken}` }, transports: ['websocket'], reconnection: false });
    agentSocket.on('print.job', (job) => {
      received.push(job);
      agentSocket!.emit('print.ack', { jobId: job.jobId, status: 'PRINTED' });
    });
    await new Promise<void>((res, rej) => {
      agentSocket!.once('ready', () => res());
      agentSocket!.once('connect_error', rej);
    });
    const ack = await agentSocket.emitWithAck('agent.hello', { version: '1.0.0', hostname: 'pc-cocina', platform: 'linux', kind: 'agent', discovered: [{ name: 'EPSON', type: 'usb', path: '/dev/usb/lp0' }] });
    expect(ack.ok).toBe(true);
    expect(ack.data.printers.map((p: { id: string }) => p.id)).toEqual([printerId]);
    expect(ack.data.printers[0]).toMatchObject({ host: '192.168.1.80', port: 9100, paperWidth: 80 });

    const agents = await http.get('/api/printing/agents').set(auth(admin)).expect(200);
    expect(agents.body.find((x: { name: string }) => x.name === 'PC Cocina')).toMatchObject({ online: true, hostname: 'pc-cocina', version: '1.0.0' });

    const t = await http.post(`/api/printing/printers/${printerId}/test`).set(auth(admin)).expect(200);
    await waitFor(() => received.find((j) => j.jobId === t.body.id));
  });

  it('POS: sin caja abierta no se cobra; mesero abre cuenta y agrega productos', async () => {
    const floor = await http.get('/api/pos/floor').set(auth(mesero)).expect(200);
    const mesa1 = floor.body[0].tables.find((t: { name: string }) => t.name === '1');
    expect(mesa1.status).toBe('LIBRE');

    const t = await http.post('/api/pos/tickets').set(auth(mesero)).send({ tableId: mesa1.id, guests: 2 }).expect(201);
    ticketId = t.body.id;
    expect(t.body.folio).toMatch(/^C-\d{6}$/);
    await http.post('/api/pos/tickets').set(auth(mesero)).send({ tableId: mesa1.id, guests: 2 }).expect(409);

    const menu = await http.get('/api/pos/menu').set(auth(mesero)).expect(200);
    const prods = menu.body.flatMap((c: { products: unknown[] }) => c.products) as {
      id: string; name: string; priceCents: number; modifierGroups: { name: string; modifiers: { id: string; name: string; priceCents: number }[] }[];
    }[];
    const burger = prods.find((p) => p.name === 'Hamburguesa clásica')!;
    const medio = burger.modifierGroups.find((g) => g.name.startsWith('Término'))!.modifiers[0];
    const tocino = burger.modifierGroups.find((g) => g.name === 'Extras')!.modifiers.find((m) => m.name === 'Tocino')!;
    const refresco = prods.find((p) => p.name === 'Refresco')!;

    // falta el término (mínimo 1)
    await http.post(`/api/pos/tickets/${ticketId}/lines`).set(auth(mesero)).send({ lines: [{ productId: burger.id, quantity: 1 }] }).expect(400);

    const r = await http.post(`/api/pos/tickets/${ticketId}/lines`).set(auth(mesero)).send({
      lines: [
        { productId: burger.id, quantity: 2, modifiers: [{ modifierId: medio.id }, { modifierId: tocino.id }], note: 'sin cebolla' },
        { productId: refresco.id, quantity: 1 },
      ],
    }).expect(201);
    const expected = 2 * (burger.priceCents + tocino.priceCents) + refresco.priceCents;
    expect(r.body).toMatchObject({ subtotalCents: expected, totalCents: expected, unsentCount: 2, status: 'ABIERTA' });

    const fl = await http.get('/api/pos/floor').set(auth(mesero)).expect(200);
    expect(fl.body[0].tables.find((x: { id: string }) => x.id === mesa1.id)).toMatchObject({ status: 'OCUPADA', ticket: { id: ticketId, guests: 2 } });
  });

  it('enviar a cocina: el agente recibe la comanda y confirma PRINTED', async () => {
    const before = received.length;
    const r = await http.post(`/api/pos/tickets/${ticketId}/send`).set(auth(mesero)).expect(200);
    expect(r.body).toMatchObject({ sentCount: 2, isAddition: false, unsentCount: 0 });
    const job = await waitFor(() => received.slice(before).find((j) => j.kind === 'KITCHEN' && j.printer.id === printerId));
    expect(job.document.title).toContain('Cocina');
    // el ack es asíncrono: consulta hasta ver PRINTED
    let status = '';
    for (let i = 0; i < 40 && status !== 'PRINTED'; i++) {
      status = (await http.get(`/api/printing/jobs/${job.jobId}`).set(auth(admin)).expect(200)).body.status;
      if (status !== 'PRINTED') await new Promise((res) => setTimeout(res, 50));
    }
    expect(status).toBe('PRINTED');

    // nada más que enviar
    await http.post(`/api/pos/tickets/${ticketId}/send`).set(auth(mesero)).expect(409);
  });

  it('KDS: la pantalla de Cocina ve los renglones enviados y los marca listos', async () => {
    const code = await http.post('/api/auth/pairing-codes').set(auth(admin)).send({ purpose: 'KDS', areaId: cocinaId }).expect(201);
    const paired = await http.post('/api/auth/pair').send({ code: code.body.code, deviceName: 'KDS Cocina e2e' }).expect(200);
    kdsToken = paired.body.deviceToken;
    const kds = { Authorization: `Device ${kdsToken}` };

    const r = await http.get('/api/kds/items').set(kds).expect(200);
    const g = r.body.find((x: { source: string; id: string }) => x.source === 'TICKET' && x.id === ticketId);
    expect(g).toMatchObject({ label: 'Mesa 1', items: [{ name: 'Hamburguesa clásica', quantity: 2, note: 'sin cebolla' }] });
    expect(g.items).toHaveLength(1); // el refresco es de Barra
    expect(g.items[0].modifiers.map((m: { name: string }) => m.name)).toEqual(expect.arrayContaining(['Tocino']));

    // la pantalla no puede ver otra área
    await http.get('/api/kds/items?areaId=otra').set(kds).expect(403);

    await http.post(`/api/kds/groups/TICKET/${ticketId}/done`).set(kds).expect(200);
    const after = await http.get('/api/kds/items').set(kds).expect(200);
    expect(after.body.find((x: { id: string }) => x.id === ticketId)).toBeUndefined();
    await http.post('/api/kds/items/undo').set(kds).send({ source: 'TICKET', itemIds: [g.items[0].id] }).expect(200);
    const undone = await http.get('/api/kds/items').set(kds).expect(200);
    expect(undone.body.find((x: { id: string }) => x.id === ticketId)).toBeDefined();
  });

  it('caja: abrir sesión; meseros no cobran; pre-cuenta, cobro en efectivo con cambio', async () => {
    await http.post(`/api/pos/tickets/${ticketId}/pay`).set(auth(caja))
      .send({ payments: [{ method: 'EFECTIVO', amountCents: 1000 }] }).expect(409);

    const open = await http.post('/api/pos/cash-sessions/open').set(auth(caja)).send({ openingCents: 100000 }).expect(201);
    sessionId = open.body.id;
    expect(open.body.folio).toMatch(/^CAJA-/);
    await http.post('/api/pos/cash-sessions/open').set(auth(caja)).send({ openingCents: 0 }).expect(409);
    const cur = await http.get('/api/pos/cash-sessions/current').set(auth(caja)).expect(200);
    expect(cur.body.id).toBe(sessionId);

    await http.post(`/api/pos/cash-sessions/${sessionId}/movements`).set(auth(caja)).send({ type: 'SALIDA', amountCents: 5000, reason: 'Hielo' }).expect(201);

    const bill = await http.post(`/api/pos/tickets/${ticketId}/request-bill`).set(auth(mesero)).expect(200);
    expect(bill.body.status).toBe('POR_COBRAR');
    expect(bill.body.suggestedTips).toHaveLength(3);

    await http.post(`/api/pos/tickets/${ticketId}/pay`).set(auth(mesero))
      .send({ payments: [{ method: 'EFECTIVO', amountCents: 1000 }] }).expect(403);
    // descuento > 20 % requiere ADMIN
    await http.post(`/api/pos/tickets/${ticketId}/discount`).set(auth(caja)).send({ type: 'PERCENT', value: 30, reason: 'x' }).expect(403);
    const disc = await http.post(`/api/pos/tickets/${ticketId}/discount`).set(auth(caja)).send({ type: 'PERCENT', value: 10, reason: 'Cliente frecuente' }).expect(200);
    const total = disc.body.totalCents as number;
    expect(disc.body.discountCents).toBe(Math.round(disc.body.subtotalCents * 0.1));

    const paid = await http.post(`/api/pos/tickets/${ticketId}/pay`).set(auth(caja))
      .send({ payments: [{ method: 'EFECTIVO', amountCents: 100000, receivedCents: 100000 }] }).expect(200);
    expect(paid.body).toMatchObject({ status: 'PAGADA', isPaid: true, paidCents: total, changeCents: 100000 - total, cashSessionId: sessionId });
    expect(paid.body.payments).toHaveLength(1);
    await http.post(`/api/pos/tickets/${ticketId}/pay`).set(auth(caja)).send({ payments: [{ method: 'EFECTIVO', amountCents: 100 }] }).expect(409);

    const fl = await http.get('/api/pos/floor').set(auth(caja)).expect(200);
    expect(fl.body[0].tables.find((x: { name: string }) => x.name === '1')).toMatchObject({ status: 'LIBRE', ticket: null });

    const sum = await http.get(`/api/pos/cash-sessions/${sessionId}/summary`).set(auth(caja)).expect(200);
    expect(sum.body).toMatchObject({ ticketsCount: 1, expectedCashCents: 100000 + total - 5000, salidasCents: 5000 });
    expect(sum.body.salesByMethod.find((m: { method: string }) => m.method === 'EFECTIVO')).toMatchObject({ amountCents: total, count: 1 });
    (global as Record<string, unknown>).__expected = 100000 + total - 5000;
  });

  it('corte Z: cierra con diferencia y genera impresión', async () => {
    const expected = (global as Record<string, unknown>).__expected as number;
    const x = await http.post(`/api/pos/cash-sessions/${sessionId}/cut-x`).set(auth(caja)).expect(200);
    expect(x.body.printJobs).toBeGreaterThanOrEqual(1);
    const z = await http.post(`/api/pos/cash-sessions/${sessionId}/close`).set(auth(caja)).send({ countedCents: expected - 100, notes: 'faltó un peso' }).expect(200);
    expect(z.body.session).toMatchObject({ expectedCents: expected, countedCents: expected - 100, differenceCents: -100 });
    expect(z.body.session.closedAt).toBeTruthy();
    expect(z.body.printJobs).toBeGreaterThanOrEqual(1);
    await http.post(`/api/pos/cash-sessions/${sessionId}/close`).set(auth(caja)).send({ countedCents: 0 }).expect(409);

    const rep = await http.get('/api/pos/reports').set(auth(admin)).expect(200);
    expect(rep.body.totals.tickets).toBeGreaterThanOrEqual(1);
    expect(rep.body.cashCuts.find((c: { id: string }) => c.id === sessionId)).toBeDefined();
  });

  it('caja POS emparejada exige PIN para operar', async () => {
    const code = await http.post('/api/auth/pairing-codes').set(auth(admin)).send({ purpose: 'POS' }).expect(201);
    const paired = await http.post('/api/auth/pair').send({ code: code.body.code }).expect(200);
    const dev = { Authorization: `Device ${paired.body.deviceToken}` };
    await http.get('/api/pos/floor').set(dev).expect(200); // lectura sin PIN
    const r = await http.post('/api/pos/tickets').set(dev).send({ serviceType: 'PARA_LLEVAR' }).expect(403);
    expect(r.body.message).toBe('Identifícate con tu PIN');
    const users = await http.get('/api/auth/device/staff').set(dev).expect(200);
    const jorge = (users.body as { id: string; name: string }[]).find((u) => u.name.startsWith('Jorge'))!;
    const pin = await http.post('/api/auth/device/pin').set(dev).send({ userId: jorge.id, pin: '5555' }).expect(200);
    const staffToken = pin.body.staffToken ?? pin.body.token;
    const t = await http.post('/api/pos/tickets').set(dev).set('X-Staff-Token', staffToken).send({ serviceType: 'PARA_LLEVAR', label: 'Juan' }).expect(201);
    expect(t.body).toMatchObject({ serviceType: 'PARA_LLEVAR', tableLabel: 'Para llevar · Juan', waiterName: 'Jorge Mesero' });
    // mesero no puede cancelar cuentas
    await http.post(`/api/pos/tickets/${t.body.id}/cancel`).set(dev).set('X-Staff-Token', staffToken).send({ reason: 'x' }).expect(403);
    await http.post(`/api/pos/tickets/${t.body.id}/cancel`).set(auth(caja)).send({ reason: 'Cliente se fue' }).expect(200);
  });
});
