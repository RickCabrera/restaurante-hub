/**
 * E2E Delivery + WhatsApp contra la BD `restaurante_hub_b` (sembrada con el seed demo).
 * Ejecutar: cd apps/api && npx jest --config test/jest-e2e.json --runInBand delivery
 * Geocodificación: MockGeo (sin internet).
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://postgres@localhost:5432/restaurante_hub_test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret-change-me-1234567890';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-e2e';
process.env.APP_URL = 'https://app.e2e';
delete process.env.REDIS_URL;
delete process.env.WHATSAPP_TOKEN;
delete process.env.WHATSAPP_APP_SECRET;

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { and, eq, isNull } from 'drizzle-orm';
import { AppModule } from '../src/app.module';
import { DB, Db } from '../src/db/db.module';
import * as s from '../src/db/schema';
import { GeoService, MockGeo } from '../src/modules/delivery/geo/geo.service';
import { SettingsService } from '../src/settings/settings.service';
import { ReportsService } from '../src/modules/delivery/reports/reports.service';

jest.setTimeout(60_000);

// Teléfonos únicos por corrida (la BD no se reinicia entre corridas)
const RUN = String(Date.now()).slice(-6);
const WEB_PHONE = `5591${RUN}`;
const WA_PHONE = `52155${RUN}22`;
const WA_NORM = `5255${RUN}22`;
const HOOK_PHONE = `52155${RUN}33`;
const HOOK_NORM = `5255${RUN}33`;
const IN_ZONE1 = { lat: 19.44, lng: -99.14 };

describe('Delivery + WhatsApp (e2e)', () => {
  let app: INestApplication;
  let db: Db;
  let http: ReturnType<typeof request>;
  let port: number;
  let bid: string;
  let branchId: string;
  let owner: string;
  let caja: string;
  let driver: string;
  let driverId: string;
  let burger: { id: string; categoryId: string; termId: string; medioId: string; tocinoId: string };
  const sockets: Socket[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = async (email: string) => (await http.post('/api/auth/login').send({ login: email, password: 'demo1234' }).expect(200)).body.accessToken as string;
  const waitFor = async <T>(fn: () => Promise<T | undefined | null | false> | T | undefined | null | false, ms = 5000): Promise<T> => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v as T;
      if (Date.now() > end) throw new Error('timeout esperando condición');
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const socket = (token?: string) =>
    new Promise<Socket>((resolve, reject) => {
      const sk = io(`http://127.0.0.1:${port}/rt`, { auth: token ? { token: `Bearer ${token}` } : {}, transports: ['websocket'], forceNew: true });
      sockets.push(sk);
      sk.on('ready', () => resolve(sk));
      sk.on('connect_error', reject);
    });
  const emitAck = <T>(sk: Socket, ev: string, payload: unknown) =>
    new Promise<{ ok: boolean; data: T; error?: string }>((resolve) => sk.emit(ev, payload, resolve));

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(GeoService).useValue(new MockGeo()).compile();
    app = mod.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as { port: number }).port;
    http = request(app.getHttpServer());
    db = app.get<Db>(DB);

    const biz = await db.query.businesses.findFirst({ where: eq(s.businesses.slug, 'demo') });
    bid = biz!.id;
    // Tienda abierta 24 h para que la prueba no dependa de la hora
    const allDay = { open: '00:00', close: '00:00' };
    const br = await db.query.branches.findFirst({ where: eq(s.branches.businessId, bid) });
    branchId = br!.id;
    await db.update(s.branches).set({ hours: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), [allDay]])), closedDates: [], pausedUntil: null, active: true, acceptsDelivery: true, acceptsPickup: true }).where(eq(s.branches.id, branchId));
    // Estado limpio
    await db.update(s.cashSessions).set({ closedAt: new Date() }).where(and(eq(s.cashSessions.businessId, bid), isNull(s.cashSessions.closedAt)));
    await db.update(s.products).set({ available: true }).where(eq(s.products.businessId, bid));
    await app.get(SettingsService).update(bid, { settings: { ...biz!.settings, privacyNoticeUrl: 'https://demo.mx/privacidad', loyalty: { enabled: true, everyOrders: 1, discountType: 'PERCENT', value: 15 } } });

    owner = await login('duena@demo.mx');
    caja = await login('caja@demo.mx');
    driver = await login('repartidor@demo.mx');
    driverId = (await db.query.users.findFirst({ where: and(eq(s.users.businessId, bid), eq(s.users.role, 'DRIVER')) }))!.id;
  });

  afterAll(async () => {
    sockets.forEach((x) => x.disconnect());
    const biz = await db?.query.businesses.findFirst({ where: eq(s.businesses.slug, 'demo') });
    if (biz) await app.get(SettingsService).update(bid, { settings: { ...biz.settings, privacyNoticeUrl: null, loyalty: { enabled: true, everyOrders: 5, discountType: 'PERCENT', value: 15 } } });
    await app?.close();
  });

  // =================================================================== Web
  let publicToken: string;
  let orderId: string;
  let orderTotal: number;

  it('menú público con marca, sucursales y modificadores', async () => {
    const r = await http.get('/api/public/demo/menu?channel=web').expect(200);
    expect(r.headers['cache-control']).toContain('max-age');
    expect(r.body.business).toMatchObject({ name: 'La Cocina de Doña Mary', slug: 'demo', privacyNoticeUrl: 'https://demo.mx/privacidad', paymentMethods: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'] });
    expect(r.body.branches[0]).toMatchObject({ id: branchId, isOpen: true, hoursText: 'Todos los días 24 horas' });
    const p = r.body.categories.flatMap((c: any) => c.products).find((x: any) => x.name === 'Hamburguesa clásica');
    const term = p.modifierGroups.find((g: any) => g.name.startsWith('Término'));
    const extras = p.modifierGroups.find((g: any) => g.name === 'Extras');
    burger = { id: p.id, categoryId: p.categoryId, termId: term.id, medioId: term.modifiers[0].id, tocinoId: extras.modifiers.find((m: any) => m.name === 'Tocino').id };
    expect(term).toMatchObject({ minSelect: 1, maxSelect: 1 });
  });

  it('cobertura pública y autocompletado (MockGeo)', async () => {
    const c1 = await http.get(`/api/public/demo/coverage?lat=${IN_ZONE1.lat}&lng=${IN_ZONE1.lng}`).expect(200);
    expect(c1.body).toMatchObject({ covered: true, feeCents: 2500, minOrderCents: 10000, etaMinutes: 35 });
    const c2 = await http.get('/api/public/demo/coverage?lat=19.6&lng=-99.0').expect(200);
    expect(c2.body.covered).toBe(false);
    const a = await http.get('/api/public/demo/geo/autocomplete?q=reforma 222').expect(200);
    expect(a.body.suggestions[0].description).toContain('Reforma');
  });

  it('cotiza en servidor (zona 1 por coordenadas, zona 2 por texto geocodificado, errores)', async () => {
    const lines = [{ productId: burger.id, quantity: 1, modifiers: [{ modifierId: burger.medioId }, { modifierId: burger.tocinoId }] }];
    const q1 = await http.post('/api/public/demo/orders/quote').send({ type: 'DOMICILIO', lines, address: { text: 'Madero 10', ...IN_ZONE1 } }).expect(200);
    expect(q1.body).toMatchObject({ subtotalCents: 17400, deliveryFeeCents: 2500, totalCents: 19900, canOrder: true, zone: { etaMinutes: 35 }, branchId });
    expect(q1.body.lines[0].modifiers.map((m: any) => m.name)).toEqual(['Término medio', 'Tocino']);
    const q2 = await http.post('/api/public/demo/orders/quote').send({ type: 'DOMICILIO', lines: [{ productId: burger.id, quantity: 1, modifiers: [{ modifierId: burger.medioId }] }], address: { text: 'Paseo de la Reforma 222' } }).expect(200);
    expect(q2.body.zone.name).toContain('Zona 2');
    expect(q2.body.errors[0].code).toBe('MIN_ORDER'); // mínimo $150 en zona 2
    const q3 = await http.post('/api/public/demo/orders/quote').send({ type: 'PASAR_A_RECOGER', lines: [{ productId: burger.id, quantity: 1 }] }).expect(200);
    expect(q3.body.errors[0].code).toBe('MODIFIER_MIN');
    const q4 = await http.post('/api/public/demo/orders/quote').send({ type: 'PASAR_A_RECOGER', lines, couponCode: 'NOEXISTE' }).expect(200);
    expect(q4.body.errors[0].code).toBe('COUPON_INVALID');
    await http.post('/api/public/demo/orders/quote').send({ type: 'X', lines: [] }).expect(400);
  });

  it('pedido web: exige aviso de privacidad a clientes nuevos y aplica cupón', async () => {
    const body = {
      type: 'DOMICILIO',
      lines: [{ productId: burger.id, quantity: 2, modifiers: [{ modifierId: burger.medioId }], note: 'Sin cebolla' }],
      address: { text: 'Calle Madero 10, Centro', references: 'Portón negro', ...IN_ZONE1 },
      customer: { phone: WEB_PHONE, name: 'Ana Web' },
      paymentMethod: 'EFECTIVO',
      cashGivenCents: 50000,
      couponCode: 'BIENVENIDO',
    };
    const r400 = await http.post('/api/public/demo/orders').send(body).expect(400);
    expect(r400.body.message).toContain('aviso de privacidad');
    const r = await http.post('/api/public/demo/orders').send({ ...body, acceptPrivacy: true }).expect(201);
    expect(r.body).toMatchObject({ status: 'NUEVO', type: 'DOMICILIO', channel: 'WEB', subtotalCents: 29800, discountCents: 2980, deliveryFeeCents: 2500, totalCents: 29320, paymentMethod: 'EFECTIVO' });
    expect(r.body.folio).toMatch(/^P-\d{6}$/);
    expect(r.body.timeline[0]).toMatchObject({ status: 'NUEVO', done: true, current: true });
    expect(r.body).not.toHaveProperty('customerPhone');
    expect(r.body).not.toHaveProperty('addressText');
    publicToken = r.body.publicToken;
    orderTotal = r.body.totalCents;
    const o = await db.query.orders.findFirst({ where: eq(s.orders.publicToken, publicToken) });
    orderId = o!.id;
    expect(o).toMatchObject({ customerPhone: `52${WEB_PHONE}`, couponCode: 'BIENVENIDO', addressRefs: 'Portón negro', zoneId: expect.any(String) });
    // el cupón BIENVENIDO es de un uso por cliente
    const again = await http.post('/api/public/demo/orders/quote').send({ type: 'PASAR_A_RECOGER', lines: body.lines, couponCode: 'BIENVENIDO', customerPhone: WEB_PHONE }).expect(200);
    expect(again.body.errors[0].message).toContain('Ya usaste');
    // dirección guardada al cliente
    const cust = await db.query.customers.findFirst({ where: eq(s.customers.id, o!.customerId), with: { addresses: true } });
    expect(cust!.acceptedPrivacyAt).not.toBeNull();
    expect(cust!.addresses[0]).toMatchObject({ text: 'Calle Madero 10, Centro', validated: true });
  });

  it('seguimiento público + tiempo real; dueña acepta, asigna, repartidor entrega y se hace el corte', async () => {
    const tr = await http.get(`/api/public/demo/orders/${publicToken}`).expect(200);
    expect(tr.body.business.phone).toBe('5512345678');
    await http.get('/api/public/demo/orders/no-existe-token').expect(404);

    const anon = await socket();
    const updates: any[] = [];
    anon.on('order.updated', (p) => updates.push(p));
    const ack = await emitAck<any>(anon, 'order.watch', { publicToken });
    expect(ack.ok).toBe(true);
    expect(ack.data.folio).toBe(tr.body.folio);

    const mgr = await socket(owner);
    const mgrEvents: any[] = [];
    mgr.on('order.updated', (p) => mgrEvents.push(p));

    // lista del monitor
    const list = await http.get('/api/orders?active=1').set(auth(owner)).expect(200);
    expect(list.body.items.some((x: any) => x.id === orderId)).toBe(true);

    const acc = await http.post(`/api/orders/${orderId}/accept`).set(auth(caja)).send({ estimatedMinutes: 30 }).expect(200);
    expect(acc.body).toMatchObject({ status: 'ACEPTADO', estimatedMinutes: 30, statusLabel: 'Aceptado', paymentLabel: 'Efectivo', changeCents: 50000 - orderTotal });
    expect(acc.body.acceptedAt).toBeTruthy();
    expect(acc.body.items[0]).toMatchObject({ productName: 'Hamburguesa clásica', quantity: 2, note: 'Sin cebolla' });
    await waitFor(() => updates.find((u) => u.status === 'ACEPTADO'));
    await waitFor(() => mgrEvents.find((u) => u.id === orderId && u.status === 'ACEPTADO'));
    expect(updates[0]).not.toHaveProperty('customerPhone');

    // transición inválida
    const bad = await http.post(`/api/orders/${orderId}/status`).set(auth(owner)).send({ status: 'RECOGIDO' }).expect(409);
    expect(bad.body.message).toContain('No se puede');

    // repartidores
    const ds = await http.get('/api/drivers').set(auth(owner)).expect(200);
    expect(ds.body[0]).toMatchObject({ id: driverId, activeOrders: expect.any(Number) });
    const drvSock = await socket(driver);
    const drvEvents: any[] = [];
    drvSock.on('order.updated', (p) => drvEvents.push(p));
    const asg = await http.post(`/api/orders/${orderId}/assign-driver`).set(auth(owner)).send({ driverId }).expect(200);
    expect(asg.body.driver).toMatchObject({ id: driverId, name: 'Carlos Repartidor' });
    await waitFor(() => drvEvents.find((e) => e.id === orderId));

    const mine = await http.get('/api/driver/orders').set(auth(driver)).expect(200);
    expect(mine.body.map((o: any) => o.id)).toContain(orderId);
    expect(mine.body[0].mapsUrl).toContain('google.com/maps');
    await http.get('/api/driver/orders').set(auth(caja)).expect(403);

    const dsp = await http.post(`/api/driver/orders/${orderId}/dispatch`).set(auth(driver)).expect(200);
    expect(dsp.body.status).toBe('EN_CAMINO');
    expect(dsp.body.readyAt).toBeTruthy();
    const del = await http.post(`/api/driver/orders/${orderId}/delivered`).set(auth(driver)).expect(200);
    expect(del.body).toMatchObject({ status: 'ENTREGADO', paid: true });
    await waitFor(() => updates.find((u) => u.status === 'ENTREGADO'));
    const final = updates.find((u) => u.status === 'ENTREGADO');
    expect(final.timeline.map((t: any) => t.status)).toEqual(['NUEVO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO', 'ENTREGADO']);
    expect(final.active).toBe(false);

    const sum = await http.get('/api/driver/summary').set(auth(driver)).expect(200);
    expect(sum.body.cashToSettleCents).toBeGreaterThanOrEqual(orderTotal);
    expect(sum.body.unsettledOrders.map((o: any) => o.id)).toContain(orderId);

    // caja abierta para registrar el corte
    const cajaUser = await db.query.users.findFirst({ where: and(eq(s.users.businessId, bid), eq(s.users.role, 'CASHIER')) });
    const [session] = await db.insert(s.cashSessions).values({ businessId: bid, branchId, folio: `E2E-${Date.now()}`, cashierId: cajaUser!.id, openingCents: 100000 }).returning();
    const st = await http.post(`/api/drivers/${driverId}/settle`).set(auth(caja)).expect(200);
    expect(st.body).toMatchObject({ driverId, cashSessionId: session.id, totalCents: sum.body.cashToSettleCents });
    expect(st.body.orders.map((o: any) => o.id)).toContain(orderId);
    const mv = await db.query.cashMovements.findFirst({ where: eq(s.cashMovements.id, st.body.cashMovementId) });
    expect(mv).toMatchObject({ type: 'ENTRADA', source: 'DRIVER_SETTLEMENT', refId: driverId, amountCents: st.body.totalCents });
    const again = await http.post(`/api/drivers/${driverId}/settle`).set(auth(caja)).expect(200);
    expect(again.body).toMatchObject({ ordersCount: 0, totalCents: 0, cashMovementId: null });
    await db.update(s.cashSessions).set({ closedAt: new Date() }).where(eq(s.cashSessions.id, session.id));
  });

  it('fidelización: genera cupón personal al entregar', async () => {
    const o = await db.query.orders.findFirst({ where: eq(s.orders.id, orderId) });
    const c = await waitFor(() => db.query.coupons.findFirst({ where: and(eq(s.coupons.businessId, bid), eq(s.coupons.customerId, o!.customerId)) }));
    expect(c.code).toMatch(/^FIEL-[A-Z0-9]{4}$/);
    expect(c).toMatchObject({ discountType: 'PERCENT', value: 15, maxUses: 1 });
    // el cupón se envía al cliente por WhatsApp (simulador)
    const conv = await waitFor(() => db.query.waConversations.findFirst({ where: and(eq(s.waConversations.businessId, bid), eq(s.waConversations.phone, `52${WEB_PHONE}`)) }));
    const msgs = await waitFor(async () => {
      const m = await db.query.waMessages.findMany({ where: eq(s.waMessages.conversationId, conv.id) });
      return m.find((x) => x.body?.includes(c.code)) ? m : null;
    });
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('captura manual (teléfono), rechazo y cancelación con permisos', async () => {
    const body = {
      channel: 'TELEFONO', type: 'PASAR_A_RECOGER',
      lines: [{ productId: burger.id, quantity: 1, modifiers: [{ modifierId: burger.medioId }] }],
      customer: { phone: `5592${RUN}`, name: 'Cliente Teléfono' }, paymentMethod: 'TARJETA',
    };
    await http.post('/api/orders').set(auth(driver)).send(body).expect(403);
    const r = await http.post('/api/orders').set(auth(caja)).send(body).expect(201);
    expect(r.body).toMatchObject({ channel: 'TELEFONO', channelLabel: 'Teléfono', typeLabel: 'Pasar a recoger', status: 'NUEVO', deliveryFeeCents: 0 });
    await http.post(`/api/orders/${r.body.id}/assign-driver`).set(auth(owner)).send({ driverId }).expect(400);
    const rej = await http.post(`/api/orders/${r.body.id}/reject`).set(auth(owner)).send({ reason: 'Sin gas' }).expect(200);
    expect(rej.body).toMatchObject({ status: 'RECHAZADO', rejectReason: 'Sin gas' });
    await http.post(`/api/orders/${r.body.id}/cancel`).set(auth(owner)).send({ reason: 'x' }).expect(409);

    const r2 = await http.post('/api/orders').set(auth(caja)).send(body).expect(201);
    await http.post(`/api/orders/${r2.body.id}/accept`).set(auth(owner)).send({}).expect(200);
    const listo = await http.post(`/api/orders/${r2.body.id}/status`).set(auth(owner)).send({ status: 'LISTO' }).expect(200);
    expect(listo.body.status).toBe('LISTO');
    const rec = await http.post(`/api/orders/${r2.body.id}/status`).set(auth(owner)).send({ status: 'RECOGIDO' }).expect(200);
    expect(rec.body).toMatchObject({ status: 'RECOGIDO', paid: true });
    const g = await http.get(`/api/orders?q=${r2.body.folio}`).set(auth(owner)).expect(200);
    expect(g.body.total).toBe(1);
  });

  it('menú: agotado rápido se refleja en el menú público y en la cotización', async () => {
    await http.patch(`/api/menu/products/${burger.id}/availability`).set(auth(caja)).send({ available: false }).expect(200);
    const m = await http.get('/api/public/demo/menu').expect(200);
    const p = m.body.categories.flatMap((c: any) => c.products).find((x: any) => x.id === burger.id);
    expect(p.available).toBe(false);
    const q = await http.post('/api/public/demo/orders/quote').send({ type: 'PASAR_A_RECOGER', lines: [{ productId: burger.id, quantity: 1, modifiers: [{ modifierId: burger.medioId }] }] }).expect(200);
    expect(q.body.errors[0].code).toBe('PRODUCT_UNAVAILABLE');
    await http.patch(`/api/menu/products/${burger.id}/availability`).set(auth(owner)).send({ available: true }).expect(200);
    // override de precio por sucursal
    await http.put(`/api/menu/products/${burger.id}/branches/${branchId}`).set(auth(owner)).send({ priceCents: 15900 }).expect(200);
    const m2 = await http.get(`/api/public/demo/menu?branchId=${branchId}`).expect(200);
    expect(m2.body.categories.flatMap((c: any) => c.products).find((x: any) => x.id === burger.id).priceCents).toBe(15900);
    await http.put(`/api/menu/products/${burger.id}/branches/${branchId}`).set(auth(owner)).send({}).expect(200);
  });

  it('sucursal: pausar cierra los pedidos y reanudar abre', async () => {
    const p = await http.post(`/api/branches/${branchId}/pause`).set(auth(caja)).send({ minutes: 20, reason: 'Mucha demanda' }).expect(200);
    expect(p.body.status).toMatchObject({ open: false, reason: 'PAUSED' });
    const q = await http.post('/api/public/demo/orders/quote').send({ type: 'PASAR_A_RECOGER', lines: [{ productId: burger.id, quantity: 1, modifiers: [{ modifierId: burger.medioId }] }] }).expect(200);
    expect(q.body.errors.find((e: any) => e.code === 'STORE_CLOSED').message).toContain('Mucha demanda');
    const r = await http.post(`/api/branches/${branchId}/resume`).set(auth(caja)).expect(200);
    expect(r.body.status.open).toBe(true);
  });

  it('reportes de ventas y CSV', async () => {
    const r = await http.get('/api/reports/sales').set(auth(owner)).expect(200);
    expect(r.body.totals.ordersCount).toBeGreaterThan(0);
    expect(r.body.byChannel.find((c: any) => c.channel === 'WEB')).toBeTruthy();
    expect(r.body.topProducts[0].name).toBeTruthy();
    expect(r.body.times.avgDeliveryMinutes).not.toBeNull();
    const csv = await http.get('/api/reports/sales.csv').set(auth(owner)).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Folio,Fecha');
    const sumry = await app.get(ReportsService).sendDailySummary(bid, new Date().toISOString().slice(0, 10), 'America/Mexico_City');
    expect(sumry.body).toContain('Requisiciones del día');
  });

  // =================================================================== WhatsApp
  const sim = (body: Record<string, unknown>) => http.post('/api/whatsapp/simulator/inbound').set(auth(owner)).send({ phone: WA_PHONE, name: 'Pedro WA', ...body }).expect(200);

  it('estado de WhatsApp y verificación del webhook', async () => {
    const st = await http.get('/api/whatsapp/status').set(auth(owner)).expect(200);
    expect(st.body).toMatchObject({ mode: 'simulador', webhookUrl: expect.stringContaining('/api/whatsapp/webhook') });
    const v = await http.get('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-e2e&hub.challenge=12345').expect(200);
    expect(v.text).toBe('12345');
    await http.get('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=mal&hub.challenge=1').expect(403);
  });

  it('conversación completa en el simulador termina en pedido a domicilio', async () => {
    const mgr = await socket(owner);
    const simOut: any[] = [];
    mgr.on('wa.sim.out', (m) => simOut.push(m));
    const j = await emitAck<any>(mgr, 'wasim.join', { phone: WA_PHONE });
    expect(j.ok).toBe(true);
    const anon = await socket();
    expect((await emitAck(anon, 'wasim.join', { phone: WA_PHONE })).ok).toBe(false);

    let r = await sim({ text: 'Hola' });
    expect(r.body.state).toBe('MAIN_MENU');
    expect(r.body.replies[0].body).toContain('La Cocina de Doña Mary');
    await waitFor(() => simOut.length > 0);
    r = await sim({ buttonId: 'm:order' });
    expect(r.body.state).toBe('ORDER_TYPE');
    r = await sim({ buttonId: 't:DOMICILIO' });
    expect(r.body.state).toBe('CATEGORY');
    r = await sim({ listId: `c:${burger.categoryId}` });
    expect(r.body.state).toBe('PRODUCT');
    r = await sim({ listId: `p:${burger.id}` });
    expect(r.body.state).toBe('MODIFIERS');
    r = await sim({ text: '1' }); // Término medio por número
    expect(r.body.state).toBe('MODIFIERS');
    r = await sim({ listId: `mod:${burger.tocinoId}` });
    r = await sim({ listId: 'mod:done' });
    expect(r.body.state).toBe('QUANTITY');
    r = await sim({ buttonId: 'q:2' });
    expect(r.body.state).toBe('CART');
    r = await sim({ buttonId: 'cart:done' });
    expect(r.body.state).toBe('ADDRESS');
    r = await sim({ location: { ...IN_ZONE1, address: 'Calle 5 de Mayo 20, Centro' } });
    expect(r.body.state).toBe('REFERENCES');
    expect(r.body.replies[0].body).toContain('Zona 1');
    r = await sim({ text: 'Casa azul, timbre 3' });
    expect(r.body.state).toBe('PAYMENT');
    r = await sim({ buttonId: 'pay:EFECTIVO' });
    expect(r.body.state).toBe('CASH_AMOUNT');
    r = await sim({ text: '$500' });
    expect(r.body.state).toBe('NAME');
    r = await sim({ text: 'Pedro Ramírez' });
    expect(r.body.state).toBe('CONFIRM');
    expect(r.body.replies[0].body).toContain('Total: $373.00');
    r = await sim({ buttonId: 'cf:yes' });
    expect(r.body.state).toBe('IDLE');
    expect(r.body.replies[0].body).toMatch(/Folio \*P-\d{6}\*/);
    expect(r.body.replies[0].body).toContain('https://app.e2e/pedido/');

    const o = await db.query.orders.findFirst({ where: and(eq(s.orders.businessId, bid), eq(s.orders.customerPhone, WA_NORM)), orderBy: (t, { desc }) => desc(t.createdAt), with: { items: true } });
    expect(o).toMatchObject({ channel: 'WHATSAPP', type: 'DOMICILIO', customerName: 'Pedro Ramírez', addressText: 'Calle 5 de Mayo 20, Centro', addressRefs: 'Casa azul, timbre 3', cashGivenCents: 50000, totalCents: 37300 });
    expect(o!.items[0].modifiers.map((m) => m.name)).toEqual(['Término medio', 'Tocino']);

    // Bandeja
    const convs = await http.get('/api/whatsapp/conversations').set(auth(owner)).expect(200);
    const conv = convs.body.find((c: any) => c.phone === WA_NORM);
    expect(conv).toMatchObject({ displayName: 'Pedro Ramírez', humanMode: false, windowOpen: true, unreadCount: expect.any(Number) });
    const msgs = await http.get(`/api/whatsapp/conversations/${conv.id}/messages`).set(auth(owner)).expect(200);
    expect(msgs.body[0]).toMatchObject({ direction: 'IN', body: 'Hola' });
    expect(msgs.body.some((m: any) => m.direction === 'OUT' && m.status === 'simulated')).toBe(true);

    // WAB-03: al aceptar, el bot avisa por chat
    await http.post(`/api/orders/${o!.id}/accept`).set(auth(owner)).send({ estimatedMinutes: 40 }).expect(200);
    await waitFor(async () => (await db.query.waMessages.findMany({ where: eq(s.waMessages.conversationId, conv.id) })).find((m) => m.direction === 'OUT' && m.body?.includes('aceptamos tu pedido')));
    await http.post(`/api/orders/${o!.id}/cancel`).set(auth(owner)).send({ reason: 'Prueba' }).expect(200);
    await waitFor(async () => (await db.query.waMessages.findMany({ where: eq(s.waMessages.conversationId, conv.id) })).find((m) => m.body?.includes('fue cancelado')));
  });

  it('repetir último pedido aparece en el menú principal', async () => {
    const r = await sim({ text: 'menu' });
    const rows = r.body.replies[0].sections?.[0]?.rows?.map((x: any) => x.id) ?? [];
    expect(rows).toContain('m:repeat');
    const rep = await sim({ listId: 'm:repeat' });
    expect(rep.body.state).toBe('REPEAT_CONFIRM');
    await sim({ text: 'cancelar' });
  });

  it('traspaso a humano, respuesta desde la bandeja y regreso al bot', async () => {
    const r = await sim({ text: 'quiero hablar con un asesor' });
    expect(r.body).toMatchObject({ state: 'HUMAN', humanMode: true });
    const notif = await waitFor(() => db.query.notifications.findFirst({ where: and(eq(s.notifications.businessId, bid), eq(s.notifications.type, 'HUMAN_HANDOFF')) }));
    expect(notif.link).toContain('/admin/whatsapp/');
    const silent = await sim({ text: '¿hola?' });
    expect(silent.body.replies).toEqual([]);
    const convs = await http.get('/api/whatsapp/conversations?humanMode=1').set(auth(caja)).expect(200);
    const conv = convs.body.find((c: any) => c.phone === WA_NORM);
    expect(conv.unreadCount).toBeGreaterThan(0);
    const rep = await http.post(`/api/whatsapp/conversations/${conv.id}/reply`).set(auth(caja)).send({ text: 'Hola Pedro, soy Sofía 🙋' }).expect(201);
    expect(rep.body).toMatchObject({ direction: 'OUT', body: 'Hola Pedro, soy Sofía 🙋', status: 'simulated', sentByUserId: expect.any(String) });
    const rd = await http.post(`/api/whatsapp/conversations/${conv.id}/read`).set(auth(caja)).expect(200);
    expect(rd.body.unreadCount).toBe(0);
    const off = await http.post(`/api/whatsapp/conversations/${conv.id}/human`).set(auth(owner)).send({ on: false }).expect(200);
    expect(off.body).toMatchObject({ humanMode: false, state: 'IDLE' });
    const back = await sim({ text: 'hola' });
    expect(back.body.state).toBe('MAIN_MENU');
  });

  it('pedido web iniciado desde el chat se confirma en el chat', async () => {
    const r = await sim({ buttonId: 'm:menu' });
    const cta = r.body.replies.find((m: any) => m.kind === 'cta_url');
    const url = new URL(cta.url);
    const token = url.searchParams.get('s')!;
    expect(url.searchParams.get('tel')).toBe(WA_NORM);
    await http.post('/api/public/demo/orders').send({
      type: 'PASAR_A_RECOGER', lines: [{ productId: burger.id, quantity: 1, modifiers: [{ modifierId: burger.medioId }] }],
      customer: { phone: WA_NORM, name: 'Pedro Ramírez' }, paymentMethod: 'TARJETA', sessionToken: token, acceptPrivacy: true,
    }).expect(201);
    const conv = await db.query.waConversations.findFirst({ where: and(eq(s.waConversations.businessId, bid), eq(s.waConversations.phone, WA_NORM)) });
    await waitFor(async () => (await db.query.waMessages.findMany({ where: eq(s.waMessages.conversationId, conv!.id) })).find((m) => m.body?.includes('Recibimos tu pedido web')));
  });

  it('webhook de Meta: procesa en cola, deduplica por waMessageId y actualiza estados', async () => {
    const payload = (id: string, text: string) => ({
      object: 'whatsapp_business_account',
      entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
        messaging_product: 'whatsapp', metadata: { phone_number_id: 'PNID' },
        contacts: [{ profile: { name: 'Lupita' }, wa_id: HOOK_PHONE }],
        messages: [{ from: HOOK_PHONE, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
      } }] }],
    });
    const id = `wamid.e2e.${Date.now()}`;
    const r1 = await http.post('/api/whatsapp/webhook').send(payload(id, 'Hola')).expect(200);
    expect(r1.body).toMatchObject({ ok: true, received: 1 });
    await http.post('/api/whatsapp/webhook').send(payload(id, 'Hola')).expect(200);
    const conv = await waitFor(() => db.query.waConversations.findFirst({ where: and(eq(s.waConversations.businessId, bid), eq(s.waConversations.phone, HOOK_NORM)) }));
    const msgs = await waitFor(async () => {
      const m = await db.query.waMessages.findMany({ where: eq(s.waMessages.conversationId, conv.id) });
      return m.some((x) => x.direction === 'OUT') ? m : null;
    });
    await new Promise((res) => setTimeout(res, 300));
    const all = await db.query.waMessages.findMany({ where: eq(s.waMessages.conversationId, conv.id) });
    expect(all.filter((m) => m.direction === 'IN')).toHaveLength(1);
    expect(conv.profileName).toBe('Lupita');
    expect(msgs.length).toBeGreaterThan(1);
    const out = all.find((m) => m.direction === 'OUT')!;
    await http.post('/api/whatsapp/webhook').send({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PNID' }, statuses: [{ id: out.waMessageId, status: 'read', timestamp: '1', recipient_id: HOOK_PHONE }] } }] }],
    }).expect(200);
    await waitFor(async () => (await db.query.waMessages.findFirst({ where: eq(s.waMessages.id, out.id) }))?.status === 'read');
  });
});
