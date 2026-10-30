import { describe, it, expect } from 'vitest';
import { canTransitionRequisition, canTransitionOrder, computeTotals, applyDiscount } from './index';

describe('requisition state machine', () => {
  it('manager approves sent requisition', () => {
    expect(canTransitionRequisition('ENVIADA', 'APROBADA', 'MANAGER')).toBe(true);
  });
  it('area cannot approve', () => {
    expect(canTransitionRequisition('ENVIADA', 'APROBADA', 'AREA')).toBe(false);
  });
  it('area confirms reception only after fulfilled', () => {
    expect(canTransitionRequisition('SURTIDA', 'RECIBIDA', 'AREA')).toBe(true);
    expect(canTransitionRequisition('APROBADA', 'RECIBIDA', 'AREA')).toBe(false);
  });
  it('terminal states are final', () => {
    expect(canTransitionRequisition('RECIBIDA', 'CANCELADA', 'MANAGER')).toBe(false);
  });
});

describe('order state machine', () => {
  it('pickup cannot go en camino', () => {
    expect(canTransitionOrder('LISTO', 'EN_CAMINO', 'PASAR_A_RECOGER')).toBe(false);
    expect(canTransitionOrder('LISTO', 'RECOGIDO', 'PASAR_A_RECOGER')).toBe(true);
  });
  it('delivery cannot be recogido', () => {
    expect(canTransitionOrder('LISTO', 'RECOGIDO', 'DOMICILIO')).toBe(false);
  });
});

describe('money', () => {
  it('computes totals with modifiers, discount and fee', () => {
    const t = computeTotals({
      lines: [{ unitPriceCents: 10000, quantity: 2, modifiers: [{ priceCents: 1500 }] }],
      deliveryFeeCents: 3000,
      discountCents: 2000,
    });
    expect(t.subtotalCents).toBe(23000);
    expect(t.totalCents).toBe(24000);
  });
  it('caps discounts', () => {
    expect(applyDiscount(10000, { type: 'PERCENT', value: 50, maxCents: 3000 })).toBe(3000);
    expect(applyDiscount(1000, { type: 'AMOUNT', value: 5000 })).toBe(1000);
  });
});
