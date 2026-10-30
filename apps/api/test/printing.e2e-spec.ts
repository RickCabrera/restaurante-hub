/**
 * E2E: printOrder (OrderPrinter) + KDS de pedidos de delivery + dividir/juntar/mover cuentas.
 * BD: restaurante_hub_c. Ejecutar: npx jest --config test/jest-e2e.json --runInBand printing
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://postgres@localhost:5432/restaurante_hub_test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret-change-me-1234567890';
delete process.env.REDIS_URL;

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { AppModule } from '../src/app.module';
import { DB, Db } from '../src/db/db.module';
import * as s from '../src/db/schema';
import { OrderPrinter } from '../src/modules/printing/order-printer.port';

jest.setTimeout(60_000);

describe('Impresión de pedidos + KDS + dividir/juntar (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  let http: ReturnType<typeof request>;
  let bid: string;
  let cocinaId: string;
  let barraId: string;
  let admin: string;
  let caja: string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    http = request(app.getHttpServer());
    db = app.get<Db>(DB);
    bid = (await db.query.businesses.findFirst({ where: eq(s.businesses.slug, 'demo') }))!.id;
    cocinaId = (await db.query.areas.findFirst({ where: and(eq(s.areas.businessId, bid), eq(s.areas.name, 'Cocina')) }))!.id;
    barraId = (await db.query.areas.findFirst({ where: and(eq(s.areas.businessId, bid), eq(s.areas.name, 'Barra')) }))!.id;
    await db.update(s.tickets).set({ status: 'CANCELADA', closedAt: new Date(), cancelReason: 'e2e reset' })
      .where(and(eq(s.tickets.businessId, bid), inArray(s.tickets.status, ['ABIERTA', 'POR_COBRAR'])));
    const areaIds = (await db.query.diningAreas.findMany({ where: eq(s.diningAreas.businessId, bid) })).map((a) => a.id);
    await db.update(s.diningTables).set({ status: 'LIBRE' }).where(inArray(s.diningTables.diningAreaId, areaIds));
    const login = async (e: string) => (await http.post('/api/auth/login').send({ login: e, password: 'demo1234' }).expect(200)).body.accessToken as string;
    admin = await login('admin@demo.mx');
    caja = await login('caja@demo.mx');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('printOrder: comanda por área (sin KDS) + ticket de cliente con mapa; KDS → LISTO', async () => {
    const branch = (await db.query.branches.findFirst({ where: eq(s.branches.businessId, bid) }))!;
    const prods = await db.query.products.findMany({ where: eq(s.products.businessId, bid) });
    const burger = prods.find((p) => p.name === 'Hamburguesa clásica')!;
    const limonada = prods.find((p) => p.name === 'Limonada natural')!;
    const phone = '5550001111';
    const [cust] = await db.insert(s.customers).values({ businessId: bid, phone, name: 'Juan' })
      .onConflictDoUpdate({ target: [s.customers.businessId, s.customers.phone], set: { name: 'Juan' } }).returning();
    const folio = `E2E-${Date.now()}`;
    const [order] = await db.insert(s.orders).values({
      businessId: bid, branchId: branch.id, folio, publicToken: folio, channel: 'WHATSAPP', type: 'DOMICILIO', status: 'ACEPTADO',
      customerId: cust.id, customerName: 'Juan', customerPhone: phone, addressText: 'Calle 1', lat: 19.4, lng: -99.1,
      subtotalCents: 19400, totalCents: 19400, paymentMethod: 'EFECTIVO', cashGivenCents: 50000, acceptedAt: new Date(),
    }).returning();
    await db.insert(s.orderItems).values([
      { orderId: order.id, productId: burger.id, productName: burger.name, productionAreaId: cocinaId, unitPriceCents: 14900, quantity: 1, totalCents: 14900 },
      { orderId: order.id, productId: limonada.id, productName: limonada.name, productionAreaId: barraId, unitPriceCents: 4500, quantity: 1, totalCents: 4500 },
    ]);

    await app.get(OrderPrinter).printOrder(order.id);
    const jobs = await db.query.printJobs.findMany({ where: eq(s.printJobs.orderId, order.id), with: { printer: true } });
    // seed: "Cocina (navegador)" BROWSER (Cocina, printsCustomerTicket) + "Barra (pantalla)" KDS (+ "Cocina E2E" si corrió pos.e2e)
    expect(jobs.every((j) => j.printer.connection !== 'KDS')).toBe(true);
    const kitchen = jobs.filter((j) => j.kind === 'KITCHEN');
    expect(kitchen.length).toBeGreaterThanOrEqual(1);
    expect(kitchen.every((j) => j.printer.areaId === cocinaId)).toBe(true);
    const customer = jobs.filter((j) => j.kind === 'CUSTOMER');
    expect(customer.length).toBe(1);
    const blocks = customer[0].document.blocks as { type: string; data?: string; left?: string; right?: string }[];
    expect(blocks.find((b) => b.type === 'qr')?.data).toBe('https://maps.google.com/?q=19.4,-99.1');
    expect(blocks.find((b) => b.left === 'Cambio')?.right).toContain('306');
    const titles = kitchen.map((j) => j.document.title);
    expect(titles.some((t) => t.includes(folio))).toBe(true);

    // KDS por gerente: Cocina y Barra
    const coc = await http.get(`/api/kds/items?areaId=${cocinaId}`).set(auth(admin)).expect(200);
    const g = coc.body.find((x: { id: string }) => x.id === order.id);
    expect(g).toMatchObject({ source: 'ORDER', label: 'Domicilio · Juan', folio });
    await http.post(`/api/kds/groups/ORDER/${order.id}/done?areaId=${cocinaId}`).set(auth(admin)).expect(200);
    expect((await db.query.orders.findFirst({ where: eq(s.orders.id, order.id) }))!.status).toBe('ACEPTADO');
    const bar = await http.get(`/api/kds/items?areaId=${barraId}`).set(auth(admin)).expect(200);
    const gb = bar.body.find((x: { id: string }) => x.id === order.id);
    await http.post(`/api/kds/items/done?areaId=${barraId}`).set(auth(admin)).send({ source: 'ORDER', itemIds: gb.items.map((i: { id: string }) => i.id) }).expect(200);
    const o2 = (await db.query.orders.findFirst({ where: eq(s.orders.id, order.id) }))!;
    expect(o2.status).toBe('LISTO');
    expect(o2.readyAt).toBeTruthy();
  });

  it('dividir por renglones, partes iguales, juntar y mover; cancelar renglón enviado', async () => {
    const floor = await http.get('/api/pos/floor').set(auth(caja)).expect(200);
    const tables = floor.body[0].tables as { id: string; name: string }[];
    const [m2, m3, m4] = ['2', '3', '4'].map((n) => tables.find((t) => t.name === n)!);
    const menu = await http.get('/api/pos/menu').set(auth(caja)).expect(200);
    const prods = menu.body.flatMap((c: { products: unknown[] }) => c.products) as { id: string; name: string; priceCents: number }[];
    const refresco = prods.find((p) => p.name === 'Refresco')!;
    const pastel = prods.find((p) => p.name === 'Pastel de chocolate')!;

    const a = (await http.post('/api/pos/tickets').set(auth(caja)).send({ tableId: m2.id, guests: 3 }).expect(201)).body;
    const withLines = (await http.post(`/api/pos/tickets/${a.id}/lines`).set(auth(caja))
      .send({ lines: [{ productId: refresco.id, quantity: 2 }, { productId: pastel.id, quantity: 1 }] }).expect(201)).body;
    const pastelLine = withLines.items.find((i: { productName: string }) => i.productName === pastel.name);

    // cortesía + propina 10 %
    const c = (await http.post(`/api/pos/tickets/${a.id}/lines/${pastelLine.id}/discount`).set(auth(caja)).send({ isCourtesy: true, reason: 'Cumpleaños' }).expect(200)).body;
    expect(c.subtotalCents).toBe(2 * refresco.priceCents);
    const tip = (await http.post(`/api/pos/tickets/${a.id}/tip`).set(auth(caja)).send({ percent: 10 }).expect(200)).body;
    expect(tip.tipCents).toBe(Math.round(2 * refresco.priceCents * 0.1));

    // partes iguales: solo montos
    const eq3 = (await http.post(`/api/pos/tickets/${a.id}/split`).set(auth(caja)).send({ mode: 'equal', parts: 3 }).expect(200)).body;
    expect(eq3.parts.reduce((x: number, y: number) => x + y, 0)).toBe(tip.totalCents);

    // dividir por renglones: el pastel a una cuenta nueva en la misma mesa
    const sp = (await http.post(`/api/pos/tickets/${a.id}/split`).set(auth(caja)).send({ mode: 'lines', lineIds: [pastelLine.id] }).expect(200)).body;
    expect(sp.newTicket.items).toHaveLength(1);
    expect(sp.newTicket.tableId).toBe(m2.id);
    expect(sp.newTicket.parentId).toBe(a.id);
    expect(sp.ticket.items).toHaveLength(1);

    // mover la nueva cuenta a la mesa 3 y juntarla de regreso
    const mv = (await http.post(`/api/pos/tickets/${sp.newTicket.id}/move`).set(auth(caja)).send({ tableId: m3.id }).expect(200)).body;
    expect(mv.tableId).toBe(m3.id);
    let fl = (await http.get('/api/pos/floor').set(auth(caja)).expect(200)).body[0].tables;
    expect(fl.find((t: { id: string }) => t.id === m3.id).status).toBe('OCUPADA');
    await http.post(`/api/pos/tickets/${a.id}/move`).set(auth(caja)).send({ tableId: m3.id }).expect(409);

    const merged = (await http.post(`/api/pos/tickets/${a.id}/merge`).set(auth(caja)).send({ sourceTicketId: sp.newTicket.id }).expect(200)).body;
    expect(merged.items).toHaveLength(2);
    fl = (await http.get('/api/pos/floor').set(auth(caja)).expect(200)).body[0].tables;
    expect(fl.find((t: { id: string }) => t.id === m3.id).status).toBe('LIBRE');
    const src = (await http.get(`/api/pos/tickets/${sp.newTicket.id}`).set(auth(caja)).expect(200)).body;
    expect(src).toMatchObject({ status: 'CANCELADA', mergedIntoId: a.id });

    await http.post(`/api/pos/tickets/${a.id}/move`).set(auth(caja)).send({ tableId: m4.id }).expect(200);

    // cancelar renglón enviado: requiere motivo; queda registrado
    await http.post(`/api/pos/tickets/${a.id}/send`).set(auth(caja)).expect(200);
    const refLine = merged.items.find((i: { productName: string }) => i.productName === refresco.name);
    await http.post(`/api/pos/tickets/${a.id}/lines/${refLine.id}/cancel`).set(auth(caja)).send({}).expect(400);
    const cl = (await http.post(`/api/pos/tickets/${a.id}/lines/${refLine.id}/cancel`).set(auth(caja)).send({ reason: 'Se equivocó' }).expect(200)).body;
    expect(cl.items.find((i: { id: string }) => i.id === refLine.id)).toMatchObject({ cancelReason: 'Se equivocó', totalCents: 0 });
    expect(cl.subtotalCents).toBe(0); // queda solo la cortesía
    await http.post(`/api/pos/tickets/${a.id}/cancel`).set(auth(caja)).send({ reason: 'Prueba' }).expect(200);

    const audit = await db.query.auditLogs.findMany({ where: and(eq(s.auditLogs.businessId, bid), eq(s.auditLogs.entityId, a.id)) });
    expect(audit.map((x) => x.action)).toEqual(expect.arrayContaining(['pos.line.courtesy', 'pos.line.cancel', 'pos.ticket.cancel', 'pos.ticket.merge', 'pos.ticket.split']));
  });

  it('módulo POS apagado → 404', async () => {
    const b = (await db.query.businesses.findFirst({ where: eq(s.businesses.id, bid) }))!;
    await db.update(s.businesses).set({ settings: { ...b.settings, modules: { ...b.settings.modules, pos: false } } }).where(eq(s.businesses.id, bid));
    try {
      const { SettingsService } = await import('../src/settings/settings.service');
      app.get(SettingsService).invalidate(bid);
      await http.get('/api/pos/floor').set(auth(caja)).expect(404);
    } finally {
      await db.update(s.businesses).set({ settings: b.settings }).where(eq(s.businesses.id, bid));
      const { SettingsService } = await import('../src/settings/settings.service');
      app.get(SettingsService).invalidate(bid);
    }
  });

  it('cola: trabajos pendientes sin cliente quedan PENDING y se pueden cancelar/reintentar', async () => {
    const pend = await db.query.printJobs.findFirst({ where: and(eq(s.printJobs.businessId, bid), eq(s.printJobs.status, 'PENDING'), isNull(s.printJobs.ticketId)) });
    expect(pend).toBeDefined();
    const list = await http.get('/api/printing/jobs?status=PENDING&limit=5').set(auth(admin)).expect(200);
    expect(list.body.length).toBeGreaterThan(0);
    await http.post(`/api/printing/jobs/${pend!.id}/cancel`).set(auth(admin)).expect(200);
    const r = await http.post(`/api/printing/jobs/${pend!.id}/retry`).set(auth(admin)).expect(200);
    expect(r.body.status).toBe('PENDING');
  });
});
