import { buyXGetYDiscount, CatalogProduct, computeQuote, CouponRule, menuChannelOf, PromotionRule, promotionApplies, QuoteContext } from './pricing';
import { normalizePhone } from '../../../whatsapp/client/whatsapp.client';

const NOW = new Date('2026-10-27T18:00:00Z'); // martes 12:00 en CDMX
const TUESDAY_NOON = { weekday: 2, minutes: 12 * 60 };

const burger: CatalogProduct = {
  id: 'burger', name: 'Hamburguesa', categoryId: 'cat-burger', priceCents: 15000, available: true, visible: true, productionAreaId: 'cocina',
  groups: [
    { id: 'g-term', name: 'Término', minSelect: 1, maxSelect: 1, modifiers: [
      { id: 'm-medio', name: 'Medio', priceCents: 0, available: true },
      { id: 'm-bien', name: 'Bien cocida', priceCents: 0, available: true },
    ] },
    { id: 'g-extra', name: 'Extras', minSelect: 0, maxSelect: 2, modifiers: [
      { id: 'm-tocino', name: 'Tocino', priceCents: 2500, available: true },
      { id: 'm-queso', name: 'Queso', priceCents: 1500, available: true },
      { id: 'm-agua', name: 'Aguacate', priceCents: 2000, available: false },
    ] },
  ],
};
const taco: CatalogProduct = { id: 'taco', name: 'Tacos', categoryId: 'cat-tacos', priceCents: 7500, available: true, visible: true, productionAreaId: 'cocina', groups: [] };
const soda: CatalogProduct = { id: 'soda', name: 'Refresco', categoryId: 'cat-drinks', priceCents: 3500, available: true, visible: true, productionAreaId: 'barra', groups: [] };
const agotado: CatalogProduct = { ...soda, id: 'agotado', name: 'Limonada', available: false };
const hidden: CatalogProduct = { ...soda, id: 'hidden', name: 'Oculto', visible: false };

const catalog = new Map([burger, taco, soda, agotado, hidden].map((p) => [p.id, p]));
const coverage = { zone: { id: 'z1', name: 'Zona 1' }, feeCents: 2500, minOrderCents: 10000, freeFromCents: 50000, etaMinutes: 35 };
const branch = { id: 'b1', acceptsDelivery: true, acceptsPickup: true, prepMinutes: 25 };

const promo = (o: Partial<PromotionRule>): PromotionRule => ({
  id: 'p', name: 'Promo', kind: 'PERCENT_OFF', value: 10, buyQty: null, getQty: null, minOrderCents: 0, productIds: [], categoryIds: [],
  weekdays: [], timeFrom: null, timeTo: null, channels: [], startsAt: null, endsAt: null, active: true, ...o,
});
const coupon = (o: Partial<CouponRule>): CouponRule => ({
  id: 'c', code: 'DESC10', discountType: 'PERCENT', value: 10, maxDiscountCents: null, minOrderCents: 0, freeDelivery: false, startsAt: null,
  endsAt: null, maxUses: null, maxUsesPerCustomer: 1, usesCount: 0, channels: [], customerId: null, active: true, ...o,
});

const ctx = (o: Partial<QuoteContext> = {}): QuoteContext => ({
  channel: 'WEB', type: 'DOMICILIO',
  lines: [{ productId: 'burger', quantity: 1, modifiers: [{ modifierId: 'm-medio', quantity: 1 }] }],
  catalog, promotions: [], branch, hasLocation: true, coverage, store: { open: true, message: '' }, now: NOW, local: TUESDAY_NOON, ...o,
});

describe('computeQuote — renglones', () => {
  it('calcula precios con modificadores y envío', () => {
    const q = computeQuote(ctx({
      lines: [
        { productId: 'burger', quantity: 2, modifiers: [{ modifierId: 'm-medio', quantity: 1 }, { modifierId: 'm-tocino', quantity: 1 }], note: ' sin cebolla ' },
        { productId: 'soda', quantity: 1, modifiers: [] },
      ],
    }));
    expect(q.errors).toEqual([]);
    expect(q.lines[0]).toMatchObject({ unitPriceCents: 15000, totalCents: 35000, note: 'sin cebolla' });
    expect(q.lines[0].modifiers).toEqual([
      { modifierId: 'm-medio', name: 'Medio', groupName: 'Término', priceCents: 0, quantity: 1 },
      { modifierId: 'm-tocino', name: 'Tocino', groupName: 'Extras', priceCents: 2500, quantity: 1 },
    ]);
    expect(q).toMatchObject({ subtotalCents: 38500, discountCents: 0, deliveryFeeCents: 2500, totalCents: 41000, canOrder: true, estimatedMinutes: 35, zone: { id: 'z1', etaMinutes: 35 } });
    expect(q.warnings[0]).toContain('envío es gratis');
  });

  it('mínimo de selección en grupo obligatorio', () => {
    const q = computeQuote(ctx({ lines: [{ productId: 'burger', quantity: 1, modifiers: [] }] }));
    expect(q.canOrder).toBe(false);
    expect(q.errors[0]).toMatchObject({ code: 'MODIFIER_MIN', lineIndex: 0 });
    expect(q.errors[0].message).toContain('término');
  });

  it('máximo de selección', () => {
    const q = computeQuote(ctx({ lines: [{ productId: 'burger', quantity: 1, modifiers: [
      { modifierId: 'm-medio', quantity: 1 }, { modifierId: 'm-tocino', quantity: 1 }, { modifierId: 'm-queso', quantity: 2 },
    ] }] }));
    expect(q.errors.map((e) => e.code)).toContain('MODIFIER_MAX');
    const q2 = computeQuote(ctx({ lines: [{ productId: 'burger', quantity: 1, modifiers: [{ modifierId: 'm-medio', quantity: 1 }, { modifierId: 'm-bien', quantity: 1 }] }] }));
    expect(q2.errors[0].code).toBe('MODIFIER_MAX');
  });

  it('modificador agotado o de otro producto', () => {
    expect(computeQuote(ctx({ lines: [{ productId: 'burger', quantity: 1, modifiers: [{ modifierId: 'm-medio', quantity: 1 }, { modifierId: 'm-agua', quantity: 1 }] }] })).errors[0].code).toBe('MODIFIER_UNAVAILABLE');
    expect(computeQuote(ctx({ lines: [{ productId: 'taco', quantity: 1, modifiers: [{ modifierId: 'm-medio', quantity: 1 }] }] })).errors[0].code).toBe('MODIFIER_INVALID');
  });

  it('producto agotado, inexistente u oculto en el canal', () => {
    expect(computeQuote(ctx({ lines: [{ productId: 'agotado', quantity: 1, modifiers: [] }] })).errors[0]).toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
    expect(computeQuote(ctx({ lines: [{ productId: 'nope', quantity: 1, modifiers: [] }] })).errors[0].code).toBe('PRODUCT_NOT_FOUND');
    expect(computeQuote(ctx({ lines: [{ productId: 'hidden', quantity: 1, modifiers: [] }] })).errors[0].code).toBe('PRODUCT_NOT_FOUND');
  });

  it('carrito vacío', () => {
    expect(computeQuote(ctx({ lines: [] })).errors.map((e) => e.code)).toContain('EMPTY_CART');
  });
});

describe('computeQuote — envío, zona y tienda', () => {
  it('fuera de zona / sin dirección', () => {
    expect(computeQuote(ctx({ coverage: null })).errors.map((e) => e.code)).toContain('OUT_OF_ZONE');
    expect(computeQuote(ctx({ hasLocation: false, coverage: null })).errors.map((e) => e.code)).toContain('ADDRESS_REQUIRED');
  });

  it('pedido mínimo de la zona', () => {
    const q = computeQuote(ctx({ lines: [{ productId: 'soda', quantity: 1, modifiers: [] }] }));
    expect(q.errors[0]).toMatchObject({ code: 'MIN_ORDER' });
    expect(q.errors[0].message).toContain('100.00');
  });

  it('envío gratis al alcanzar freeFromCents', () => {
    const q = computeQuote(ctx({ lines: [{ productId: 'burger', quantity: 4, modifiers: [{ modifierId: 'm-medio', quantity: 1 }] }] }));
    expect(q).toMatchObject({ subtotalCents: 60000, deliveryFeeCents: 0, totalCents: 60000 });
  });

  it('pasar a recoger no cobra envío ni pide zona', () => {
    const q = computeQuote(ctx({ type: 'PASAR_A_RECOGER', hasLocation: false, coverage: null }));
    expect(q).toMatchObject({ canOrder: true, deliveryFeeCents: 0, zone: null, estimatedMinutes: 25 });
  });

  it('tienda cerrada', () => {
    const q = computeQuote(ctx({ store: { open: false, message: 'Estamos cerrados. Abrimos mañana a las 09:00.' } }));
    expect(q.errors[0]).toEqual({ code: 'STORE_CLOSED', message: 'Estamos cerrados. Abrimos mañana a las 09:00.' });
    expect(q.canOrder).toBe(false);
  });

  it('servicio desactivado en la sucursal', () => {
    expect(computeQuote(ctx({ branch: { ...branch, acceptsDelivery: false } })).errors.map((e) => e.code)).toContain('DELIVERY_DISABLED');
    expect(computeQuote(ctx({ type: 'PASAR_A_RECOGER', branch: { ...branch, acceptsPickup: false } })).errors.map((e) => e.code)).toContain('PICKUP_DISABLED');
  });
});

describe('promociones automáticas', () => {
  it('2x1 en martes (BUY_X_GET_Y) por producto', () => {
    const p = promo({ id: 'p2x1', name: 'Martes 2x1', kind: 'BUY_X_GET_Y', buyQty: 2, getQty: 1, productIds: ['taco'], weekdays: [2] });
    const q = computeQuote(ctx({ type: 'PASAR_A_RECOGER', promotions: [p], lines: [{ productId: 'taco', quantity: 5, modifiers: [] }] }));
    expect(q.appliedPromotions).toEqual([{ id: 'p2x1', name: 'Martes 2x1', discountCents: 15000 }]);
    expect(q).toMatchObject({ subtotalCents: 37500, discountCents: 15000, totalCents: 22500 });
    // miércoles no aplica
    const q2 = computeQuote(ctx({ type: 'PASAR_A_RECOGER', promotions: [p], local: { weekday: 3, minutes: 720 }, lines: [{ productId: 'taco', quantity: 2, modifiers: [] }] }));
    expect(q2.discountCents).toBe(0);
  });

  it('BUY_X_GET_Y regala los más baratos', () => {
    const lines = [
      { productId: 'a', name: 'A', quantity: 1, unitPriceCents: 10000, totalCents: 10000, modifiers: [], note: null, productionAreaId: null },
      { productId: 'b', name: 'B', quantity: 2, unitPriceCents: 5000, totalCents: 10000, modifiers: [], note: null, productionAreaId: null },
    ];
    expect(buyXGetYDiscount(lines, 3, 1)).toBe(5000);
    expect(buyXGetYDiscount(lines, 2, 1)).toBe(5000);
    expect(buyXGetYDiscount(lines, 2, 2)).toBe(0);
  });

  it('porcentaje por categoría con ventana horaria y canal', () => {
    const p = promo({ id: 'hh', name: 'Happy hour bebidas', value: 50, categoryIds: ['cat-drinks'], timeFrom: '11:00', timeTo: '13:00', channels: ['WEB'] });
    const lines = [{ productId: 'burger', quantity: 1, modifiers: [{ modifierId: 'm-medio', quantity: 1 }] }, { productId: 'soda', quantity: 2, modifiers: [] }];
    expect(computeQuote(ctx({ promotions: [p], lines })).discountCents).toBe(3500);
    expect(computeQuote(ctx({ promotions: [p], lines, local: { weekday: 2, minutes: 14 * 60 } })).discountCents).toBe(0);
    expect(computeQuote(ctx({ promotions: [p], lines, channel: 'WHATSAPP' })).discountCents).toBe(0);
  });

  it('ventana horaria nocturna', () => {
    const p = promo({ timeFrom: '22:00', timeTo: '02:00' });
    expect(promotionApplies(p, 'WEB', NOW, { weekday: 2, minutes: 23 * 60 })).toBe(true);
    expect(promotionApplies(p, 'WEB', NOW, { weekday: 2, minutes: 60 })).toBe(true);
    expect(promotionApplies(p, 'WEB', NOW, { weekday: 2, minutes: 12 * 60 })).toBe(false);
  });

  it('vigencia, inactiva y mínimo de compra', () => {
    expect(promotionApplies(promo({ endsAt: new Date('2026-10-01') }), 'WEB', NOW, TUESDAY_NOON)).toBe(false);
    expect(promotionApplies(promo({ startsAt: new Date('2026-11-01') }), 'WEB', NOW, TUESDAY_NOON)).toBe(false);
    expect(promotionApplies(promo({ active: false }), 'WEB', NOW, TUESDAY_NOON)).toBe(false);
    expect(computeQuote(ctx({ promotions: [promo({ minOrderCents: 20000 })] })).discountCents).toBe(0);
  });

  it('monto fijo no excede el subtotal elegible', () => {
    const q = computeQuote(ctx({ type: 'PASAR_A_RECOGER', promotions: [promo({ kind: 'AMOUNT_OFF', value: 99999, productIds: ['soda'] })], lines: [{ productId: 'soda', quantity: 1, modifiers: [] }] }));
    expect(q.discountCents).toBe(3500);
    expect(q.totalCents).toBe(0);
  });

  it('envío gratis por promoción', () => {
    const q = computeQuote(ctx({ promotions: [promo({ id: 'fd', name: 'Envío gratis', kind: 'FREE_DELIVERY' })] }));
    expect(q.deliveryFeeCents).toBe(0);
    expect(q.appliedPromotions).toEqual([{ id: 'fd', name: 'Envío gratis', discountCents: 0 }]);
  });
});

describe('cupones', () => {
  const base = { type: 'PASAR_A_RECOGER' as const, lines: [{ productId: 'burger', quantity: 2, modifiers: [{ modifierId: 'm-medio', quantity: 1 }] }] };

  it('aplica porcentaje con tope', () => {
    const q = computeQuote(ctx({ ...base, couponCode: 'desc10', coupon: coupon({ value: 50, maxDiscountCents: 5000 }), hasCustomerPhone: true }));
    expect(q.coupon).toEqual({ id: 'c', code: 'DESC10', discountCents: 5000, freeDelivery: false });
    expect(q.totalCents).toBe(25000);
  });

  it('se aplica después de promociones, sobre el remanente', () => {
    const q = computeQuote(ctx({ ...base, promotions: [promo({ value: 10 })], couponCode: 'X', coupon: coupon({ value: 10 }) }));
    // 30000 - 3000 (promo) = 27000; cupón 10% = 2700
    expect(q).toMatchObject({ discountCents: 5700, totalCents: 24300 });
  });

  it('cupón inexistente, vencido, agotado, de otro canal', () => {
    expect(computeQuote(ctx({ ...base, couponCode: 'NOPE', coupon: null })).errors[0].code).toBe('COUPON_INVALID');
    expect(computeQuote(ctx({ ...base, couponCode: 'X', coupon: coupon({ endsAt: new Date('2026-01-01') }) })).errors[0].message).toContain('venció');
    expect(computeQuote(ctx({ ...base, couponCode: 'X', coupon: coupon({ startsAt: new Date('2027-01-01') }) })).errors[0].message).toContain('aún no');
    expect(computeQuote(ctx({ ...base, couponCode: 'X', coupon: coupon({ maxUses: 5, usesCount: 5 }) })).errors[0].message).toContain('agotó');
    expect(computeQuote(ctx({ ...base, couponCode: 'X', coupon: coupon({ channels: ['WHATSAPP'] }) })).errors[0].message).toContain('canal');
    expect(computeQuote(ctx({ ...base, couponCode: 'X', coupon: coupon({ active: false }) })).errors[0].code).toBe('COUPON_INVALID');
  });

  it('usos por cliente y mínimo de compra', () => {
    expect(computeQuote(ctx({ ...base, couponCode: 'X', coupon: coupon({ maxUsesPerCustomer: 1 }), couponCustomerUses: 1 })).errors[0].message).toContain('Ya usaste');
    expect(computeQuote(ctx({ ...base, couponCode: 'X', coupon: coupon({ minOrderCents: 99999 }) })).errors[0].message).toContain('999.99');
  });

  it('cupón personal (lealtad) solo para su cliente', () => {
    const c = coupon({ code: 'FIEL-AB12', customerId: 'cust1' });
    expect(computeQuote(ctx({ ...base, couponCode: 'FIEL-AB12', coupon: c, hasCustomerPhone: false })).errors[0].message).toContain('teléfono');
    expect(computeQuote(ctx({ ...base, couponCode: 'FIEL-AB12', coupon: c, hasCustomerPhone: true, customerId: 'otro' })).errors[0].message).toContain('personal');
    expect(computeQuote(ctx({ ...base, couponCode: 'FIEL-AB12', coupon: c, hasCustomerPhone: true, customerId: 'cust1' })).canOrder).toBe(true);
  });

  it('cupón de envío gratis', () => {
    const q = computeQuote(ctx({ couponCode: 'ENVIOGRATIS', coupon: coupon({ code: 'ENVIOGRATIS', discountType: 'AMOUNT', value: 0, freeDelivery: true }) }));
    expect(q).toMatchObject({ deliveryFeeCents: 0, discountCents: 0, coupon: { code: 'ENVIOGRATIS', freeDelivery: true } });
    const pickup = computeQuote(ctx({ ...base, couponCode: 'ENVIOGRATIS', coupon: coupon({ code: 'ENVIOGRATIS', discountType: 'AMOUNT', value: 0, freeDelivery: true }) }));
    expect(pickup.warnings[0]).toContain('envío gratis');
  });
});

describe('utilidades', () => {
  it('canal → visibilidad del menú', () => {
    expect(menuChannelOf('WEB')).toBe('web');
    expect(menuChannelOf('WHATSAPP')).toBe('whatsapp');
    expect(menuChannelOf('TELEFONO')).toBe('pos');
    expect(menuChannelOf('MESA')).toBe('qr');
  });

  it('normalización de teléfono (core) para clientes', () => {
    expect(normalizePhone('55 1234 5678')).toBe('525512345678');
    expect(normalizePhone('+52 1 55 1234 5678')).toBe('525512345678');
    expect(normalizePhone('5215512345678')).toBe('525512345678');
    expect(normalizePhone('525512345678')).toBe('525512345678');
  });
});
