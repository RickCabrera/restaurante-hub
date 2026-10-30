import {
  LineForTotals, computeCashSummary, partitionForSplit, computeLine, computeTicketTotals, discountNeedsAdmin, planPayments,
  resolveModifiers, splitEqual, startOfDayInTz, suggestedTips, tableStatusFor,
} from './pos.logic';

const L = (o: Partial<LineForTotals>): LineForTotals => ({
  unitPriceCents: 10000, quantity: 1, modifiers: [], isCourtesy: false, discountType: null, discountValue: null, cancelledAt: null, ...o,
});
const T = (lines: LineForTotals[], o: Partial<Parameters<typeof computeTicketTotals>[0]> = {}) =>
  computeTicketTotals({ lines, discountType: null, discountValue: null, tipPercent: null, tipFixedCents: null, paymentTipsCents: 0, paidAmountCents: 0, ...o });

describe('totales de cuenta', () => {
  it('suma renglones con modificadores', () => {
    const r = T([L({ quantity: 2, modifiers: [{ priceCents: 2500, quantity: 1 }] }), L({ unitPriceCents: 4500 })]);
    expect(r.subtotalCents).toBe(2 * 12500 + 4500);
    expect(r.totalCents).toBe(29500);
  });

  it('descuento por renglón (% y monto) y cortesía = 0', () => {
    expect(computeLine(L({ discountType: 'PERCENT', discountValue: 10 }))).toEqual({ grossCents: 10000, discountCents: 1000, totalCents: 9000 });
    expect(computeLine(L({ discountType: 'AMOUNT', discountValue: 20000 })).totalCents).toBe(0);
    expect(computeLine(L({ isCourtesy: true, discountType: 'PERCENT', discountValue: 5 }))).toEqual({ grossCents: 10000, discountCents: 10000, totalCents: 0 });
  });

  it('renglones cancelados no cuentan', () => {
    expect(T([L({}), L({ cancelledAt: new Date() })]).subtotalCents).toBe(10000);
  });

  it('descuento de cuenta y propina % sobre el neto', () => {
    const r = T([L({}), L({ isCourtesy: true })], { discountType: 'PERCENT', discountValue: 10, tipPercent: 15 });
    expect(r.subtotalCents).toBe(10000);
    expect(r.discountCents).toBe(1000);
    expect(r.ruleTipCents).toBe(1350);
    expect(r.totalCents).toBe(9000 + 1350);
  });

  it('propina fija + propinas de pago; saldo y pagado', () => {
    const r = T([L({})], { tipFixedCents: 500, paymentTipsCents: 300, paidAmountCents: 4000 });
    expect(r.tipCents).toBe(800);
    expect(r.totalCents).toBe(10800);
    expect(r.paidCents).toBe(4300);
    expect(r.remainingCents).toBe(6500);
  });

  it('descuento en monto no excede el subtotal', () => {
    expect(T([L({})], { discountType: 'AMOUNT', discountValue: 99999 }).totalCents).toBe(0);
  });

  it('propinas sugeridas', () => {
    expect(suggestedTips(20000, [10, 15, 20])).toEqual([
      { percent: 10, amountCents: 2000 }, { percent: 15, amountCents: 3000 }, { percent: 20, amountCents: 4000 },
    ]);
  });

  it('permisos de descuento: > 20 % requiere ADMIN', () => {
    expect(discountNeedsAdmin('PERCENT', 20, 0)).toBe(false);
    expect(discountNeedsAdmin('PERCENT', 25, 0)).toBe(true);
    expect(discountNeedsAdmin('AMOUNT', 2000, 10000)).toBe(false);
    expect(discountNeedsAdmin('AMOUNT', 2001, 10000)).toBe(true);
  });
});

describe('pagos', () => {
  it('efectivo calcula cambio y ajusta al saldo', () => {
    const r = planPayments(25350, [{ method: 'EFECTIVO', amountCents: 30000, receivedCents: 30000, tipCents: 0 }]);
    expect(r.ok && r).toMatchObject({ appliedCents: 25350, changeCents: 4650 });
  });

  it('efectivo insuficiente', () => {
    const r = planPayments(10000, [{ method: 'EFECTIVO', amountCents: 10000, receivedCents: 5000, tipCents: 0 }]);
    expect(r.ok).toBe(false);
  });

  it('pagos mixtos y propina en tarjeta', () => {
    const r = planPayments(10000, [
      { method: 'TARJETA', amountCents: 6000, tipCents: 1000, reference: '1234' },
      { method: 'EFECTIVO', amountCents: 4000, receivedCents: 5000, tipCents: 0 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payments[0]).toMatchObject({ amountCents: 6000, tipCents: 1000, reference: '1234', changeCents: null });
      expect(r.payments[1]).toMatchObject({ amountCents: 4000, changeCents: 1000 });
      expect(r.appliedCents).toBe(10000);
    }
  });

  it('tarjeta no puede exceder el saldo; cuenta pagada rechaza', () => {
    expect(planPayments(5000, [{ method: 'TARJETA', amountCents: 6000, tipCents: 0 }]).ok).toBe(false);
    expect(planPayments(0, [{ method: 'EFECTIVO', amountCents: 1, tipCents: 0 }]).ok).toBe(false);
  });

  it('transición a PAGADA: pagado ≥ total', () => {
    const before = T([L({ unitPriceCents: 25350 })]);
    const plan = planPayments(before.remainingCents, [{ method: 'EFECTIVO', amountCents: 30000, receivedCents: 30000, tipCents: 0 }]);
    expect(plan.ok).toBe(true);
    const after = T([L({ unitPriceCents: 25350 })], { paidAmountCents: plan.ok ? plan.appliedCents : 0 });
    expect(after.paidCents).toBeGreaterThanOrEqual(after.totalCents);
    expect(after.remainingCents).toBe(0);
  });

  it('partes iguales reparte centavos', () => {
    expect(splitEqual(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitEqual(10000, 3).reduce((a, b) => a + b, 0)).toBe(10000);
  });
});

describe('caja', () => {
  it('efectivo esperado = fondo + ventas efectivo (+propina) + entradas − salidas', () => {
    const s = computeCashSummary({
      openingCents: 100000,
      payments: [
        { method: 'EFECTIVO', amountCents: 25350, tipCents: 0 },
        { method: 'EFECTIVO', amountCents: 10000, tipCents: 1500 },
        { method: 'TARJETA', amountCents: 50000, tipCents: 5000 },
      ],
      movements: [
        { type: 'ENTRADA', amountCents: 30000, reason: 'Corte repartidor', source: 'DRIVER_SETTLEMENT' },
        { type: 'SALIDA', amountCents: 20000, reason: 'Compra de hielo', source: 'MANUAL' },
      ],
    });
    expect(s.expectedCashCents).toBe(100000 + 35350 + 1500 + 30000 - 20000);
    expect(s.salesByMethod.find((m) => m.method === 'TARJETA')).toMatchObject({ amountCents: 50000, tipsCents: 5000, count: 1 });
    expect(s.salesCents).toBe(85350);
    expect(s.paymentTipsCents).toBe(6500);
  });
});

describe('modificadores', () => {
  const groups = [
    { id: 'g1', name: 'Término', minSelect: 1, maxSelect: 1, modifiers: [{ id: 'm1', name: 'Medio', priceCents: 0, available: true }, { id: 'm2', name: 'Bien', priceCents: 0, available: true }] },
    { id: 'g2', name: 'Extras', minSelect: 0, maxSelect: 2, modifiers: [{ id: 'x1', name: 'Tocino', priceCents: 2500, available: true }, { id: 'x2', name: 'Queso', priceCents: 1500, available: false }] },
  ];
  it('valida mínimos, máximos, disponibilidad y pertenencia', () => {
    expect(resolveModifiers('Hamburguesa', groups, []).ok).toBe(false);
    expect(resolveModifiers('Hamburguesa', groups, [{ modifierId: 'm1', quantity: 1 }, { modifierId: 'm2', quantity: 1 }]).ok).toBe(false);
    expect(resolveModifiers('Hamburguesa', groups, [{ modifierId: 'm1', quantity: 1 }, { modifierId: 'x2', quantity: 1 }]).ok).toBe(false);
    expect(resolveModifiers('Hamburguesa', groups, [{ modifierId: 'm1', quantity: 1 }, { modifierId: 'zz', quantity: 1 }]).ok).toBe(false);
    expect(resolveModifiers('Hamburguesa', groups, [{ modifierId: 'm1', quantity: 1 }, { modifierId: 'x1', quantity: 3 }]).ok).toBe(false);
    const ok = resolveModifiers('Hamburguesa', groups, [{ modifierId: 'm1', quantity: 1 }, { modifierId: 'x1', quantity: 2 }]);
    expect(ok.ok && ok.modifiers[1]).toEqual({ modifierId: 'x1', name: 'Tocino', groupName: 'Extras', priceCents: 2500, quantity: 2 });
  });
});

describe('mesas y fechas', () => {
  it('estado de mesa según cuentas', () => {
    expect(tableStatusFor([])).toBe('LIBRE');
    expect(tableStatusFor(['PAGADA'])).toBe('LIBRE');
    expect(tableStatusFor(['ABIERTA'])).toBe('OCUPADA');
    expect(tableStatusFor(['POR_COBRAR'])).toBe('POR_COBRAR');
    expect(tableStatusFor(['POR_COBRAR', 'ABIERTA'])).toBe('OCUPADA');
  });
  it('inicio del día en zona horaria', () => {
    const d = startOfDayInTz('America/Mexico_City', new Date('2026-10-30T03:00:00Z')); // 29-oct 21:00 local
    expect(d.toISOString()).toBe('2026-10-29T06:00:00.000Z');
  });
});

describe('dividir por renglones', () => {
  const items = [
    { id: 'a', cancelledAt: null, unitPriceCents: 10000 },
    { id: 'b', cancelledAt: null, unitPriceCents: 5000 },
    { id: 'c', cancelledAt: new Date(), unitPriceCents: 7000 },
  ];
  it('mueve los renglones elegidos y conserva el resto', () => {
    const r = partitionForSplit(items, ['b']);
    expect(r.ok && r.moving.map((i) => i.id)).toEqual(['b']);
    expect(r.ok && r.staying.map((i) => i.id)).toEqual(['a']);
    const totals = r.ok ? [r.staying, r.moving].map((g) => T(g.map((i) => L({ unitPriceCents: i.unitPriceCents }))).totalCents) : [];
    expect(totals).toEqual([10000, 5000]);
  });
  it('rechaza renglones cancelados, ajenos o mover todo', () => {
    expect(partitionForSplit(items, ['c']).ok).toBe(false);
    expect(partitionForSplit(items, ['zz']).ok).toBe(false);
    expect(partitionForSplit(items, ['a', 'b']).ok).toBe(false);
  });
});
