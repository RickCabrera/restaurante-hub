import { REQUISITION_TRANSITIONS, RequisitionStatus } from '@rh/shared';
import {
  aggregateShoppingList, computeFulfill, computeReceive, computeReviewOutcome, decodeCursor, encodeCursor, etagOf,
  fillDailySeries, isLateForWindow, localMidnightUtc, normalizeIncomingItems, parseSupplyCsvRow, planMerge, ShoppingRow,
  transitionError, validateItemsAgainstCatalog, waLink, windowClosingInfo,
} from './requisitions.logic';

const ALL: RequisitionStatus[] = ['ENVIADA', 'VISTA', 'APROBADA', 'APROBADA_PARCIAL', 'RECHAZADA', 'EN_COMPRA', 'SURTIDA', 'RECIBIDA', 'CANCELADA'];

describe('transiciones por actor', () => {
  it('coincide con la tabla compartida para cada par y actor', () => {
    for (const from of ALL) for (const to of ALL) for (const side of ['AREA', 'MANAGER'] as const) {
      const allowed = REQUISITION_TRANSITIONS[from]?.[to]?.includes(side) ?? false;
      expect(transitionError(from, to, side) === null).toBe(allowed);
    }
  });

  it.each([
    ['ENVIADA', 'CANCELADA', 'AREA'],
    ['VISTA', 'CANCELADA', 'AREA'],
    ['SURTIDA', 'RECIBIDA', 'AREA'],
    ['SURTIDA', 'RECIBIDA', 'MANAGER'],
    ['ENVIADA', 'VISTA', 'MANAGER'],
    ['VISTA', 'APROBADA_PARCIAL', 'MANAGER'],
    ['APROBADA', 'EN_COMPRA', 'MANAGER'],
    ['EN_COMPRA', 'SURTIDA', 'MANAGER'],
  ] as const)('%s → %s permitido para %s', (from, to, side) => {
    expect(transitionError(from, to, side)).toBeNull();
  });

  it('el área no puede aprobar ni surtir; mensaje claro', () => {
    expect(transitionError('ENVIADA', 'APROBADA', 'AREA')).toMatch(/Solo la dueña/);
    expect(transitionError('APROBADA', 'SURTIDA', 'AREA')).toMatch(/Solo la dueña/);
    expect(transitionError('APROBADA', 'CANCELADA', 'AREA')).toMatch(/Solo la dueña/);
  });

  it('estados finales no cambian', () => {
    expect(transitionError('RECIBIDA', 'CANCELADA', 'MANAGER')).toMatch(/No se puede cambiar una requisición «Recibida»/);
    expect(transitionError('RECHAZADA', 'APROBADA', 'MANAGER')).not.toBeNull();
    expect(transitionError('ENVIADA', 'RECIBIDA', 'AREA')).not.toBeNull();
  });
});

describe('revisión (aprobación parcial)', () => {
  const items = [{ id: 'a', requestedQty: 5 }, { id: 'b', requestedQty: 2 }, { id: 'c', requestedQty: 1.5 }];

  it('APPROVE_ALL aprueba lo pedido', () => {
    const r = computeReviewOutcome(items, 'APPROVE_ALL');
    expect(r).toMatchObject({ ok: true, status: 'APROBADA' });
    if (r.ok) expect(r.items.map((i) => i.approvedQty)).toEqual([5, 2, 1.5]);
  });

  it('APPROVE con las mismas cantidades → APROBADA', () => {
    const r = computeReviewOutcome(items, 'APPROVE', [{ id: 'a', approvedQty: 5 }]);
    expect(r).toMatchObject({ ok: true, status: 'APROBADA' });
  });

  it('reducir un renglón → APROBADA_PARCIAL', () => {
    const r = computeReviewOutcome(items, 'APPROVE', [{ id: 'a', approvedQty: 3 }]);
    expect(r).toMatchObject({ ok: true, status: 'APROBADA_PARCIAL' });
    if (r.ok) expect(r.items.find((i) => i.id === 'a')).toMatchObject({ approvedQty: 3, rejected: false });
  });

  it('renglón en cero → rechazado y parcial', () => {
    const r = computeReviewOutcome(items, 'APPROVE', [{ id: 'b', approvedQty: 0, note: 'Hay en almacén' }]);
    expect(r).toMatchObject({ ok: true, status: 'APROBADA_PARCIAL' });
    if (r.ok) expect(r.items.find((i) => i.id === 'b')).toMatchObject({ approvedQty: 0, rejected: true, reviewNote: 'Hay en almacén' });
  });

  it('aprobar más de lo pedido no es parcial', () => {
    const r = computeReviewOutcome(items, 'APPROVE', [{ id: 'c', approvedQty: 3 }]);
    expect(r).toMatchObject({ ok: true, status: 'APROBADA' });
  });

  it('todo en cero → RECHAZADA', () => {
    const r = computeReviewOutcome(items, 'APPROVE', items.map((i) => ({ id: i.id, approvedQty: 0 })));
    expect(r).toMatchObject({ ok: true, status: 'RECHAZADA' });
  });

  it('REJECT rechaza todo', () => {
    const r = computeReviewOutcome(items, 'REJECT');
    expect(r).toMatchObject({ ok: true, status: 'RECHAZADA' });
    if (r.ok) expect(r.items.every((i) => i.rejected && i.approvedQty === 0)).toBe(true);
  });

  it('renglón ajeno → error', () => {
    expect(computeReviewOutcome(items, 'APPROVE', [{ id: 'zzz', approvedQty: 1 }])).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('surtido y recepción', () => {
  const its = [
    { id: 'a', approvedQty: 3, fulfilledQty: null, rejected: false },
    { id: 'b', approvedQty: 0, fulfilledQty: null, rejected: true },
  ];
  it('surtido por defecto = aprobado (rechazados = 0)', () => {
    expect(computeFulfill(its)).toEqual({ ok: true, items: [{ id: 'a', qty: 3 }, { id: 'b', qty: 0 }] });
    expect(computeFulfill(its, [{ id: 'a', fulfilledQty: 2.5 }])).toEqual({ ok: true, items: [{ id: 'a', qty: 2.5 }, { id: 'b', qty: 0 }] });
  });
  it('recepción por defecto = surtido, sin diferencias', () => {
    const r = computeReceive([{ id: 'a', approvedQty: 3, fulfilledQty: 3, rejected: false }]);
    expect(r).toMatchObject({ ok: true, hasDifferences: false, items: [{ id: 'a', qty: 3 }] });
  });
  it('recepción con diferencia', () => {
    const r = computeReceive([{ id: 'a', approvedQty: 3, fulfilledQty: 3, rejected: false }], [{ id: 'a', receivedQty: 2 }]);
    expect(r).toMatchObject({ ok: true, hasDifferences: true, differences: [{ id: 'a', fulfilledQty: 3, receivedQty: 2 }] });
  });
});

describe('agrupación / renglones', () => {
  it('normaliza duplicados sumando cantidades', () => {
    expect(normalizeIncomingItems([{ supplyId: 'x', quantity: 0.5 }, { supplyId: 'x', quantity: 0.5, note: 'maduro' }, { supplyId: 'y', quantity: 1 }])).toEqual([
      { supplyId: 'x', quantity: 1, note: 'maduro' },
      { supplyId: 'y', quantity: 1, note: null },
    ]);
  });

  it('planMerge suma al existente e inserta los nuevos', () => {
    const plan = planMerge(
      [{ id: 'i1', supplyId: 'tomate', requestedQty: 2, note: 'bola' }],
      [{ supplyId: 'tomate', quantity: 1.5, note: 'saladet' }, { supplyId: 'cebolla', quantity: 3 }],
    );
    expect(plan.updates).toEqual([{ id: 'i1', requestedQty: 3.5, note: 'bola · saladet' }]);
    expect(plan.inserts).toEqual([{ supplyId: 'cebolla', quantity: 3, note: null }]);
  });

  it('valida catálogo: área, activo y máximo por pedido', () => {
    const m = new Map([
      ['a', { id: 'a', name: 'Tomate', active: true, maxPerOrder: 10, inArea: true }],
      ['b', { id: 'b', name: 'Hielo', active: true, maxPerOrder: null, inArea: false }],
      ['c', { id: 'c', name: 'Gas', active: false, maxPerOrder: null, inArea: true }],
    ]);
    expect(validateItemsAgainstCatalog([{ supplyId: 'a', quantity: 10 }], m)).toBeNull();
    expect(validateItemsAgainstCatalog([{ supplyId: 'a', quantity: 11 }], m)).toMatch(/máximo 10/);
    expect(validateItemsAgainstCatalog([{ supplyId: 'b', quantity: 1 }], m)).toMatch(/no está asignado/);
    expect(validateItemsAgainstCatalog([{ supplyId: 'c', quantity: 1 }], m)).toMatch(/ya no está disponible/);
    expect(validateItemsAgainstCatalog([{ supplyId: 'z', quantity: 1 }], m)).toMatch(/no existe/);
  });
});

describe('lista de compras', () => {
  const base: Omit<ShoppingRow, 'itemId' | 'requisitionId' | 'folio' | 'areaId' | 'areaName' | 'approvedQty'> = {
    supplyId: 'tom', supplyName: 'Jitomate', unit: 'KG', supplierId: 's1', supplierName: 'Verdulería Don José', supplierPhone: '5511112222', supplierContact: null,
  };
  const rows: ShoppingRow[] = [
    { ...base, itemId: 'i1', requisitionId: 'r1', folio: 'REQ-000001', areaId: 'c', areaName: 'Cocina', approvedQty: 5 },
    { ...base, itemId: 'i2', requisitionId: 'r2', folio: 'REQ-000002', areaId: 'b', areaName: 'Barra', approvedQty: 2.5 },
    { ...base, itemId: 'i3', requisitionId: 'r2', folio: 'REQ-000002', areaId: 'b', areaName: 'Barra', supplyId: 'ceb', supplyName: 'Cebolla', approvedQty: 1 },
    { ...base, itemId: 'i4', requisitionId: 'r1', folio: 'REQ-000001', areaId: 'c', areaName: 'Cocina', supplyId: 'gas', supplyName: 'Gas', unit: 'TANQUE', supplierId: null, supplierName: null, supplierPhone: null, approvedQty: 1 },
    { ...base, itemId: 'i5', requisitionId: 'r3', folio: 'REQ-000003', areaId: 'c', areaName: 'Cocina', approvedQty: 0 },
  ];

  it('suma por insumo, agrupa por proveedor y deja "Sin proveedor" al final', () => {
    const g = aggregateShoppingList(rows, 'Doña Mary');
    expect(g.map((x) => x.supplierName)).toEqual(['Verdulería Don José', 'Sin proveedor']);
    const tom = g[0].items.find((i) => i.supplyId === 'tom')!;
    expect(tom.quantity).toBe(7.5);
    expect(tom.quantityText).toBe('7.5 kg');
    expect(tom.itemIds).toEqual(['i1', 'i2']);
    expect(tom.sources.map((s) => s.folio)).toEqual(['REQ-000001', 'REQ-000002']);
    expect(g[0].items.map((i) => i.supplyName)).toEqual(['Cebolla', 'Jitomate']);
    expect(g[1].waLink).toBeNull();
  });

  it('genera texto y link de WhatsApp', () => {
    const g = aggregateShoppingList(rows, 'Doña Mary');
    expect(g[0].whatsappText).toContain('7.5 kilos de Jitomate');
    expect(g[0].whatsappText).toContain('1 kilo de Cebolla');
    expect(g[0].waLink).toMatch(/^https:\/\/wa\.me\/525511112222\?text=/);
    expect(decodeURIComponent(g[0].waLink!.split('text=')[1])).toBe(g[0].whatsappText);
  });

  it('waLink respeta números con lada internacional', () => {
    expect(waLink('+52 1 55 1234 5678', 'hola')).toBe('https://wa.me/5215512345678?text=hola');
  });
});

describe('CSV de insumos', () => {
  const areas = new Map([['cocina', 'A1'], ['barra', 'A2'], ['almacen', 'A3']]);
  it('parsea una fila válida con áreas separadas por |', () => {
    const r = parseSupplyCsvRow({ nombre: 'Limón', categoria: 'Fruta', unidad: 'kg', incremento: '0,5', areas: 'Cocina|Barra|Almacén', proveedor: 'Don José', auto_aprobar: 'sí', icono: 'lemon' }, areas);
    expect(r).toEqual({ ok: true, value: { name: 'Limón', categoryName: 'Fruta', unit: 'KG', step: 0.5, areaIds: ['A1', 'A2', 'A3'], supplierName: 'Don José', autoApprove: true, icon: 'lemon' } });
  });
  it('acepta unidades por nombre y defaults', () => {
    const r = parseSupplyCsvRow({ nombre: 'Servilletas', categoria: 'Desechables', unidad: 'Paquetes' }, areas);
    expect(r).toMatchObject({ ok: true, value: { unit: 'PAQUETE', step: 1, areaIds: [], supplierName: null, autoApprove: false, icon: null } });
  });
  it.each([
    [{ categoria: 'X', unidad: 'kg' }, /nombre/],
    [{ nombre: 'A', unidad: 'kg' }, /categoría/],
    [{ nombre: 'A', categoria: 'X', unidad: 'costal' }, /Unidad inválida/],
    [{ nombre: 'A', categoria: 'X', unidad: 'kg', incremento: '-1' }, /Incremento inválido/],
    [{ nombre: 'A', categoria: 'X', unidad: 'kg', areas: 'Terraza' }, /Área desconocida/],
    [{ nombre: 'A', categoria: 'X', unidad: 'kg', icono: 'no-existe' }, /Ícono desconocido/],
  ])('rechaza filas inválidas %#', (row, msg) => {
    const r = parseSupplyCsvRow(row as Record<string, string>, areas);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
});

describe('horarios en zona del negocio', () => {
  const tz = 'America/Mexico_City'; // UTC-6 sin horario de verano
  const win = { '3': { until: '18:00' } }; // miércoles
  it('marca tarde después del cierre', () => {
    expect(isLateForWindow(win, new Date('2026-10-28T23:30:00Z'), tz)).toBe(false); // 17:30 local miércoles
    expect(isLateForWindow(win, new Date('2026-10-29T00:30:00Z'), tz)).toBe(true); // 18:30 local miércoles
    expect(isLateForWindow(win, new Date('2026-10-29T18:30:00Z'), tz)).toBe(false); // jueves sin ventana
  });
  it('avisa 30 min antes del cierre', () => {
    expect(windowClosingInfo(win, new Date('2026-10-28T23:40:00Z'), tz)).toEqual({ until: '18:00', minutesLeft: 20, date: '2026-10-28' });
    expect(windowClosingInfo(win, new Date('2026-10-28T23:00:00Z'), tz)).toBeNull();
    expect(windowClosingInfo(win, new Date('2026-10-29T00:10:00Z'), tz)).toBeNull();
  });
  it('medianoche local en UTC', () => {
    expect(localMidnightUtc('2026-10-30', tz).toISOString()).toBe('2026-10-30T06:00:00.000Z');
  });
});

describe('utilidades', () => {
  it('cursor ida y vuelta', () => {
    const d = new Date('2026-10-30T12:34:56.789Z');
    expect(decodeCursor(encodeCursor(d, 'abc'))).toEqual({ createdAt: d, id: 'abc' });
    expect(decodeCursor('basura')).toBeNull();
  });
  it('etag estable', () => {
    expect(etagOf({ a: 1 })).toBe(etagOf({ a: 1 }));
    expect(etagOf({ a: 1 })).not.toBe(etagOf({ a: 2 }));
  });
  it('serie diaria con huecos', () => {
    expect(fillDailySeries('2026-10-28', '2026-10-30', [{ date: '2026-10-29', count: 3 }])).toEqual([
      { date: '2026-10-28', count: 0 }, { date: '2026-10-29', count: 3 }, { date: '2026-10-30', count: 0 },
    ]);
  });
});
