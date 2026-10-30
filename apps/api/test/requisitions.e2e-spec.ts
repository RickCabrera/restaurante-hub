/**
 * E2E Módulo A (requisiciones) contra la BD `restaurante_hub_a` (sembrada con el seed demo).
 * Ejecutar: cd apps/api && npx jest --config test/jest-e2e.json --runInBand requisitions
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgres://postgres@localhost:5432/restaurante_hub_a';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret-change-me-1234567890';
delete process.env.REDIS_URL;

import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

jest.setTimeout(60_000);

interface ReqItem { id: string; supplyId: string; supplyName: string; requestedQty: number; approvedQty: number | null; fulfilledQty: number | null; receivedQty: number | null; rejected: boolean; purchased: boolean }
interface Req { id: string; folio: string; status: string; areaId: string; items: ReqItem[]; hasDifferences: boolean; area: { name: string } }

describe('Requisiciones (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let owner: string;
  let device: string;
  let cocinaId: string;
  let supplies: { id: string; name: string; step: number; maxPerOrder: number | null }[];
  let req: Req;
  const crid = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const O = () => ({ Authorization: `Bearer ${owner}` });
  const D = () => ({ Authorization: `Device ${device}` });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    http = request(app.getHttpServer());

    const login = await http.post('/api/auth/login').send({ login: 'duena@demo.mx', password: 'demo1234' }).expect(200);
    owner = login.body.accessToken;
    const areas = await http.get('/api/areas').set(O()).expect(200);
    cocinaId = areas.body.find((a: { name: string }) => a.name === 'Cocina').id;

    const pc = await http.post('/api/auth/pairing-codes').set(O()).send({ areaId: cocinaId }).expect(201);
    const paired = await http.post('/api/auth/pair').send({ code: pc.body.code, deviceName: 'Tablet E2E', platform: 'android' }).expect(200);
    device = paired.body.deviceToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('la tablet recibe solo el catálogo de su área con ETag', async () => {
    const r = await http.get('/api/tablet/catalog').set(D()).expect(200);
    expect(r.body.area.id).toBe(cocinaId);
    expect(r.body.supplies.length).toBeGreaterThan(3);
    expect(r.headers.etag).toBeTruthy();
    supplies = r.body.supplies.filter((s: { autoApprove: boolean }) => !s.autoApprove);
    await http.get('/api/tablet/catalog').set(D()).set('If-None-Match', r.headers.etag).expect(304);
  });

  it('crea la requisición desde la tablet y es idempotente', async () => {
    const body = {
      clientRequestId: crid,
      priority: 'NORMAL',
      note: 'E2E',
      items: supplies.slice(0, 3).map((s, i) => ({ supplyId: s.id, quantity: s.step * (i + 2) })),
    };
    const r1 = await http.post('/api/requisitions').set(D()).send(body).expect(201);
    req = r1.body;
    expect(req.folio).toMatch(/^REQ-\d{6}$/);
    expect(req.status).toBe('ENVIADA');
    expect(req.areaId).toBe(cocinaId);
    expect(req.items).toHaveLength(3);

    const r2 = await http.post('/api/requisitions').set(D()).send(body).expect(200);
    expect(r2.body.id).toBe(req.id);
    expect(r2.body.folio).toBe(req.folio);

    const list = await http.get('/api/requisitions').query({ q: req.folio }).set(D()).expect(200);
    expect(list.body.items.map((x: Req) => x.id)).toEqual([req.id]);
  });

  it('valida insumos fuera del área y transiciones no permitidas para la tablet', async () => {
    await http
      .post('/api/requisitions')
      .set(D())
      .send({ clientRequestId: `${crid}-bad`, items: [{ supplyId: 'no-existe', quantity: 1 }] })
      .expect(400);
    await http.post(`/api/requisitions/${req.id}/review`).set(D()).send({ action: 'APPROVE_ALL' }).expect(403);
    await http.post(`/api/requisitions/${req.id}/receive`).set(D()).send({}).expect(409);
  });

  it('la dueña la ve y aprueba parcialmente', async () => {
    const seen = await http.post(`/api/requisitions/${req.id}/seen`).set(O()).expect(200);
    expect(seen.body.status).toBe('VISTA');
    await http.post(`/api/requisitions/${req.id}/seen`).set(O()).expect(200); // idempotente

    const [a, b] = req.items;
    const r = await http
      .post(`/api/requisitions/${req.id}/review`)
      .set(O())
      .send({ action: 'APPROVE', items: [{ id: a.id, approvedQty: a.requestedQty / 2 }, { id: b.id, approvedQty: 0, note: 'Hay en almacén' }] })
      .expect(200);
    req = r.body;
    expect(req.status).toBe('APROBADA_PARCIAL');
    const ia = req.items.find((i) => i.id === a.id)!;
    const ib = req.items.find((i) => i.id === b.id)!;
    expect(ia.approvedQty).toBe(a.requestedQty / 2);
    expect(ib.rejected).toBe(true);

    // segunda revisión ya no es válida
    await http.post(`/api/requisitions/${req.id}/review`).set(O()).send({ action: 'APPROVE_ALL' }).expect(409);
  });

  it('aparece en la lista de compras consolidada', async () => {
    const r = await http.get('/api/requisitions/shopping-list').set(O()).expect(200);
    const lines = r.body.groups.flatMap((g: { items: { supplyId: string; quantity: number; sources: { folio: string }[] }[] }) => g.items);
    const mine = lines.filter((l: { sources: { folio: string }[] }) => l.sources.some((s) => s.folio === req.folio));
    const approved = req.items.filter((i) => !i.rejected);
    expect(mine).toHaveLength(approved.length);
    for (const g of r.body.groups) expect(typeof g.whatsappText).toBe('string');

    const pd = await http.get('/api/requisitions/shopping-list/print-data').set(O()).expect(200);
    expect(pd.body.groups.length).toBe(r.body.groups.length);

    const pdf = await http.get('/api/requisitions/shopping-list.pdf').set(O()).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });

  it('la dueña surte y la tablet confirma recepción con diferencias', async () => {
    const f = await http.post(`/api/requisitions/${req.id}/fulfill`).set(O()).send({}).expect(200);
    expect(f.body.status).toBe('SURTIDA');
    const first = (f.body as Req).items.find((i) => !i.rejected)!;
    expect(first.fulfilledQty).toBe(first.approvedQty);

    const rc = await http
      .post(`/api/requisitions/${req.id}/receive`)
      .set(D())
      .send({ items: [{ id: first.id, receivedQty: 0 }], note: 'No llegó' })
      .expect(200);
    expect(rc.body.status).toBe('RECIBIDA');
    expect(rc.body.hasDifferences).toBe(true);

    const after = await http.get('/api/requisitions/shopping-list').set(O()).expect(200);
    const still = after.body.groups.flatMap((g: { items: { sources: { folio: string }[] }[] }) => g.items).filter((l: { sources: { folio: string }[] }) => l.sources.some((s) => s.folio === req.folio));
    expect(still).toHaveLength(0);
  });

  it('hilo de chat por requisición', async () => {
    const m = await http.post(`/api/requisitions/${req.id}/messages`).set(D()).send({ body: '¿Saladet o bola?' }).expect(201);
    expect(m.body.authorSide).toBe('AREA');
    const convs = await http.get('/api/chat/conversations').set(O()).expect(200);
    const c = convs.body.find((x: { requisitionId: string | null }) => x.requisitionId === req.id);
    expect(c.unread).toBe(1);
    await http.post(`/api/chat/conversations/${c.id}/read`).set(O()).expect(200);
  });
});
