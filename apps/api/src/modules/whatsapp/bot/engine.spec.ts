import type { OutgoingWa } from '../../../whatsapp/client/whatsapp.client';
import type { MenuCategory } from '../../delivery/menu/menu.service';
import type { QuoteResult } from '../../delivery/promotions/pricing';
import { choice, norm, parseAmount, runBot } from './engine';
import { BotContext, BotCreateInput, BotDeps, BotQuoteInput, BotState, CoverageInfo, Inbound, LastOrderSummary, SavedAddress } from './types';

// ------------------------------------------------------------------ fakes
const MENU: MenuCategory[] = [
  {
    id: 'cat-burger', name: 'Hamburguesas', description: null, imageUrl: null, sortOrder: 1,
    products: [
      {
        id: 'burger', categoryId: 'cat-burger', name: 'Hamburguesa clásica', description: null, imageUrl: null, priceCents: 14900, available: true, productionAreaId: null, sortOrder: 1,
        modifierGroups: [
          { id: 'g-term', name: 'Término', minSelect: 1, maxSelect: 1, sortOrder: 1, modifiers: [
            { id: 'm-medio', name: 'Término medio', priceCents: 0, available: true, sortOrder: 1 },
            { id: 'm-34', name: 'Tres cuartos', priceCents: 0, available: true, sortOrder: 2 },
            { id: 'm-bien', name: 'Bien cocida', priceCents: 0, available: true, sortOrder: 3 },
          ] },
          { id: 'g-extra', name: 'Extras', minSelect: 0, maxSelect: 2, sortOrder: 2, modifiers: [
            { id: 'm-tocino', name: 'Tocino', priceCents: 2500, available: true, sortOrder: 1 },
            { id: 'm-queso', name: 'Queso extra', priceCents: 1500, available: true, sortOrder: 2 },
            { id: 'm-agua', name: 'Aguacate', priceCents: 2000, available: true, sortOrder: 3 },
            { id: 'm-jala', name: 'Jalapeños', priceCents: 1000, available: true, sortOrder: 4 },
          ] },
        ],
      },
    ],
  },
  {
    id: 'cat-drinks', name: 'Bebidas', description: null, imageUrl: null, sortOrder: 2,
    products: Array.from({ length: 11 }, (_, i) => ({
      id: `drink${i + 1}`, categoryId: 'cat-drinks', name: `Bebida ${i + 1}`, description: null, imageUrl: null, priceCents: 3500, available: true,
      productionAreaId: null, sortOrder: i, modifierGroups: [],
    })),
  },
];

const IN_ZONE = { lat: 19.44, lng: -99.14 };

interface FakeOpts {
  open?: boolean;
  customer?: { id: string | null; name: string | null; addresses: SavedAddress[] };
  lastOrder?: LastOrderSummary | null;
  coverage?: (lat: number, lng: number) => CoverageInfo | null;
}

function fakeDeps(o: FakeOpts = {}) {
  const created: BotCreateInput[] = [];
  const quotes: BotQuoteInput[] = [];
  const deps: BotDeps = {
    now: new Date('2026-10-30T18:00:00Z'),
    appUrl: 'https://app.test',
    phone: '525512345678',
    business: { name: 'La Cocina' },
    texts: { greeting: '¡Hola! Bienvenido a *{negocio}*', closedMessage: 'Cerrados. Horario: {horario}', handoffMessage: 'Te atiende una persona', goodbye: '¡Gracias!' },
    transferInfo: 'CLABE 0123',
    privacyNoticeUrl: null,
    store: async () => ({ open: o.open ?? true, message: o.open === false ? 'Estamos cerrados' : 'Abierto', hoursText: 'Todos los días 09:00–23:00', nextOpeningText: o.open === false ? 'mañana a las 09:00' : null }),
    menu: async () => MENU,
    customer: async () => o.customer ?? { id: null, name: null, addresses: [] },
    lastOrder: async () => o.lastOrder ?? null,
    geocode: async (text) => (text.includes('nada') ? null : text.includes('lejos') ? { lat: 19.6, lng: -99.0, formatted: 'Ecatepec' } : { lat: 19.435, lng: -99.14, formatted: `${text}, Centro, CDMX` }),
    reverse: async (lat, lng) => ({ formatted: `Calle ${lat.toFixed(3)},${lng.toFixed(3)}` }),
    coverage: async (lat, lng) =>
      (o.coverage ?? ((la: number) => (la < 19.5 ? { zoneName: 'Zona 1', feeCents: 2500, minOrderCents: 10000, freeFromCents: null, etaMinutes: 35 } : null)))(lat, lng),
    quote: async (input) => {
      quotes.push(input);
      return fakeQuote(input);
    },
    createOrder: async (input) => {
      created.push(input);
      const q = fakeQuote(input);
      return { id: 'o1', folio: 'P-000001', publicToken: 'tok123', estimatedMinutes: q.estimatedMinutes, totalCents: q.totalCents };
    },
    newSessionToken: () => 'sess-' + Math.random().toString(36).slice(2, 8),
  };
  return { deps, created, quotes };
}

function fakeQuote(input: BotQuoteInput): QuoteResult {
  const prices: Record<string, number> = { burger: 14900, 'm-tocino': 2500, 'm-queso': 1500, 'm-agua': 2000, 'm-jala': 1000 };
  const lines = input.lines.map((l) => {
    const unit = prices[l.productId] ?? 3500;
    const mods = l.modifiers.map((m) => ({ modifierId: m.modifierId, name: m.modifierId, groupName: '', priceCents: prices[m.modifierId] ?? 0, quantity: 1 }));
    return { productId: l.productId, name: l.productId, quantity: l.quantity, unitPriceCents: unit, modifiers: mods, totalCents: (unit + mods.reduce((s, m) => s + m.priceCents, 0)) * l.quantity, note: null, productionAreaId: null };
  });
  const subtotal = lines.reduce((s, l) => s + l.totalCents, 0);
  const fee = input.type === 'DOMICILIO' ? 2500 : 0;
  return {
    lines, subtotalCents: subtotal, discountCents: 0, deliveryFeeCents: fee, totalCents: subtotal + fee, appliedPromotions: [], coupon: null,
    zone: input.type === 'DOMICILIO' ? { id: 'z1', name: 'Zona 1', etaMinutes: 35 } : null, branchId: 'b1', estimatedMinutes: input.type === 'DOMICILIO' ? 35 : 25,
    warnings: [], errors: [], canOrder: true,
  };
}

/** Conversación de prueba que encadena estado y contexto. */
class Chat {
  state: BotState = BotState.IDLE;
  ctx: BotContext = {};
  last: OutgoingWa[] = [];
  effects: Record<string, unknown> = {};
  constructor(readonly deps: BotDeps) {}
  async send(i: Inbound | string) {
    const inbound: Inbound = typeof i === 'string' ? { kind: 'text', text: i } : i;
    const r = await runBot(this.state, this.ctx, inbound, this.deps);
    this.state = r.state;
    this.ctx = r.context;
    this.last = r.replies;
    this.effects = r.effects as Record<string, unknown>;
    return r;
  }
  btn(id: string) {
    return this.send({ kind: 'button', id });
  }
  list(id: string) {
    return this.send({ kind: 'list', id });
  }
  /** ids de las opciones del último mensaje interactivo */
  ids(): string[] {
    const out: string[] = [];
    for (const m of this.last) {
      if (m.kind === 'buttons') out.push(...m.buttons.map((b) => b.id));
      if (m.kind === 'list') out.push(...m.sections.flatMap((s) => s.rows.map((r) => r.id)));
    }
    return out;
  }
  text(): string {
    return this.last.map((m) => ('body' in m ? m.body : '')).join('\n');
  }
}

async function orderBurger(c: Chat, mods: string[] = ['m-medio']) {
  await c.list('c:cat-burger');
  expect(c.state).toBe(BotState.PRODUCT);
  await c.list('p:burger');
  expect(c.state).toBe(BotState.MODIFIERS);
  for (const m of mods) await c.send({ kind: c.ids().length <= 3 ? 'button' : 'list', id: `mod:${m}` } as Inbound);
}

// ------------------------------------------------------------------ pruebas
describe('bot — utilidades', () => {
  it('normaliza texto y montos', () => {
    expect(norm('  ¡Hólá!  ')).toBe('hola');
    expect(parseAmount('$500')).toBe(50000);
    expect(parseAmount('1,000 pesos')).toBe(100000);
    expect(parseAmount('350.50')).toBe(35050);
    expect(parseAmount('quinientos')).toBeNull();
  });

  it('elige opción por número o título', () => {
    const ctx: BotContext = { lastOptions: [{ id: 'a', title: '🛵 Domicilio' }, { id: 'b', title: '🏃 Pasar a recoger' }] };
    expect(choice({ kind: 'text', text: '2' }, ctx)).toBe('b');
    expect(choice({ kind: 'text', text: 'domicilio' }, ctx)).toBe('a');
    expect(choice({ kind: 'text', text: 'xyz' }, ctx)).toBeNull();
  });
});

describe('bot — flujo feliz a domicilio con ubicación', () => {
  it('saludo → pedido → modificadores → ubicación → efectivo → confirmar', async () => {
    const { deps, created } = fakeDeps();
    const c = new Chat(deps);
    await c.send('hola');
    expect(c.state).toBe(BotState.MAIN_MENU);
    expect(c.text()).toContain('La Cocina');
    expect(c.ids()).toEqual(['m:order', 'm:menu', 'm:human']);
    expect(c.ctx.sessionToken).toBeTruthy();

    await c.btn('m:order');
    expect(c.state).toBe(BotState.ORDER_TYPE);
    await c.btn('t:DOMICILIO');
    expect(c.state).toBe(BotState.CATEGORY);
    expect(c.ids()).toEqual(['c:cat-burger', 'c:cat-drinks']);

    await c.list('c:cat-burger');
    await c.list('p:burger');
    // término: 3 opciones → botones, min 1 → sin "skip"
    expect(c.last[0].kind).toBe('buttons');
    expect(c.ids()).toEqual(['mod:m-medio', 'mod:m-34', 'mod:m-bien']);
    await c.btn('mod:m-medio');
    // extras: 4 opciones + Listo → lista, multi-selección (máx 2)
    expect(c.last[0].kind).toBe('list');
    await c.list('mod:m-tocino');
    expect(c.state).toBe(BotState.MODIFIERS);
    expect(c.text()).toContain('Llevas: Tocino');
    await c.list('mod:m-queso'); // alcanza el máximo → avanza a cantidad
    expect(c.state).toBe(BotState.QUANTITY);
    await c.send('2');
    expect(c.state).toBe(BotState.CART);
    expect(c.ctx.cart).toEqual([
      { productId: 'burger', name: 'Hamburguesa clásica', unitPriceCents: 14900, quantity: 2, modifiers: [
        { modifierId: 'm-medio', name: 'Término medio', priceCents: 0 },
        { modifierId: 'm-tocino', name: 'Tocino', priceCents: 2500 },
        { modifierId: 'm-queso', name: 'Queso extra', priceCents: 1500 },
      ] },
    ]);
    expect(c.text()).toContain('$378.00');

    await c.btn('cart:done');
    expect(c.state).toBe(BotState.ADDRESS);
    expect(c.last[0].kind).toBe('location_request');

    await c.send({ kind: 'location', ...IN_ZONE, address: 'Calle Madero 10' });
    expect(c.state).toBe(BotState.REFERENCES);
    expect(c.text()).toContain('Zona 1');
    await c.send('Portón negro');
    expect(c.state).toBe(BotState.PAYMENT);
    expect(c.ctx.address).toMatchObject({ text: 'Calle Madero 10', lat: 19.44, lng: -99.14, references: 'Portón negro' });

    await c.btn('pay:EFECTIVO');
    expect(c.state).toBe(BotState.CASH_AMOUNT);
    expect(c.text()).toContain('$403.00');
    await c.send('100');
    expect(c.state).toBe(BotState.CASH_AMOUNT); // insuficiente
    await c.send('$500');
    expect(c.state).toBe(BotState.NAME); // cliente sin nombre
    await c.send('Ana López');
    expect(c.state).toBe(BotState.CONFIRM);
    expect(c.text()).toContain('Total: $403.00');
    expect(c.text()).toContain('cambio $97.00');

    await c.btn('cf:yes');
    expect(c.state).toBe(BotState.IDLE);
    expect(c.text()).toContain('P-000001');
    expect(c.text()).toContain('https://app.test/pedido/tok123');
    expect(created[0]).toMatchObject({
      type: 'DOMICILIO', name: 'Ana López', paymentMethod: 'EFECTIVO', cashGivenCents: 50000,
      address: { text: 'Calle Madero 10', lat: 19.44, lng: -99.14, references: 'Portón negro' },
      lines: [{ productId: 'burger', quantity: 2, modifiers: [{ modifierId: 'm-medio', quantity: 1 }, { modifierId: 'm-tocino', quantity: 1 }, { modifierId: 'm-queso', quantity: 1 }] }],
    });
    expect(c.effects.orderCreated).toBeTruthy();
    expect(c.ctx.cart).toBeUndefined();
  });

  it('ubicación sin dirección usa geocodificación inversa', async () => {
    const { deps } = fakeDeps();
    const c = new Chat(deps);
    await c.send('hola');
    await c.btn('m:order');
    await c.btn('t:DOMICILIO');
    await orderBurger(c);
    await c.list('mod:done');
    await c.btn('q:1');
    await c.btn('cart:done');
    await c.send({ kind: 'location', ...IN_ZONE });
    expect(c.ctx.address?.text).toBe('Calle 19.440,-99.140');
  });
});

describe('bot — pasar a recoger con transferencia', () => {
  it('omite dirección y muestra datos de transferencia', async () => {
    const { deps, created } = fakeDeps({ customer: { id: 'cu1', name: 'Luis', addresses: [] } });
    const c = new Chat(deps);
    await c.send('hola');
    await c.send('1'); // "Hacer pedido" por número
    expect(c.state).toBe(BotState.ORDER_TYPE);
    await c.send('Pasar a recoger');
    expect(c.ctx.orderType).toBe('PASAR_A_RECOGER');
    await c.list('c:cat-drinks');
    // 11 bebidas → 8 por página + "Ver más…" + volver
    expect(c.ids()).toHaveLength(10);
    expect(c.ids()).toContain('p:more');
    await c.list('p:more');
    expect(c.ids()).toEqual(['p:drink9', 'p:drink10', 'p:drink11', 'p:back']);
    await c.list('p:drink10');
    expect(c.state).toBe(BotState.QUANTITY); // sin modificadores
    await c.btn('q:3');
    await c.btn('cart:done');
    expect(c.state).toBe(BotState.PAYMENT);
    await c.btn('pay:TRANSFERENCIA');
    expect(c.text()).toContain('CLABE 0123');
    expect(c.state).toBe(BotState.CONFIRM); // ya tiene nombre
    expect(c.text()).toContain('Pasas a recoger');
    await c.send('si');
    expect(created[0]).toMatchObject({ type: 'PASAR_A_RECOGER', paymentMethod: 'TRANSFERENCIA', name: 'Luis', address: undefined });
  });
});

describe('bot — modificadores', () => {
  it('no deja terminar sin el mínimo y respeta el máximo', async () => {
    const { deps } = fakeDeps();
    const c = new Chat(deps);
    c.state = BotState.CATEGORY;
    c.ctx = { orderType: 'PASAR_A_RECOGER', cart: [], lastOptions: [] };
    await c.list('c:cat-burger');
    await c.list('p:burger');
    await c.btn('mod:done'); // grupo obligatorio
    expect(c.state).toBe(BotState.MODIFIERS);
    expect(c.text()).toContain('al menos 1');
    await c.send('Bien cocida'); // por título
    expect(c.ctx.pending?.modifiers.map((m) => m.modifierId)).toEqual(['m-bien']);
    // extras opcional: "Listo" sin elegir es válido
    await c.list('mod:done');
    expect(c.state).toBe(BotState.QUANTITY);
    await c.send('Otra cantidad: 4');
    expect(c.ctx.cart?.[0]).toMatchObject({ quantity: 4, modifiers: [{ modifierId: 'm-bien' }] });
  });

  it('agrupa productos iguales en el carrito y permite vaciar', async () => {
    const { deps } = fakeDeps();
    const c = new Chat(deps);
    c.state = BotState.CATEGORY;
    c.ctx = { orderType: 'PASAR_A_RECOGER', cart: [] };
    await c.list('c:cat-drinks');
    await c.list('p:drink1');
    await c.btn('q:1');
    await c.btn('cart:add');
    await c.list('c:cat-drinks');
    await c.list('p:drink1');
    await c.btn('q:2');
    expect(c.ctx.cart).toHaveLength(1);
    expect(c.ctx.cart?.[0].quantity).toBe(3);
    await c.btn('cart:clear');
    expect(c.ctx.cart).toEqual([]);
    expect(c.state).toBe(BotState.CATEGORY);
  });
});

describe('bot — fuera de zona y dirección escrita', () => {
  it('ofrece pasar a recoger si la ubicación no tiene cobertura', async () => {
    const { deps, created } = fakeDeps({ customer: { id: 'cu1', name: 'Eva', addresses: [] } });
    const c = new Chat(deps);
    await c.send('hola');
    await c.btn('m:order');
    await c.btn('t:DOMICILIO');
    await orderBurger(c);
    await c.list('mod:done');
    await c.btn('q:1');
    await c.btn('cart:done');
    await c.send({ kind: 'location', lat: 19.6, lng: -99.0, address: 'Ecatepec' });
    expect(c.state).toBe(BotState.ADDRESS);
    expect(c.text()).toContain('fuera de nuestra zona');
    expect(c.ids()).toEqual(['oz:pickup', 'oz:retry', 'm:human']);
    await c.btn('oz:pickup');
    expect(c.ctx.orderType).toBe('PASAR_A_RECOGER');
    expect(c.state).toBe(BotState.PAYMENT);
    await c.btn('pay:TARJETA');
    await c.btn('cf:yes');
    expect(created[0].type).toBe('PASAR_A_RECOGER');
  });

  it('geocodifica texto y pide confirmación', async () => {
    const { deps } = fakeDeps({ customer: { id: 'cu1', name: 'Eva', addresses: [{ id: 'a1', label: 'Casa', text: 'Madero 1', references: 'Azul', lat: 19.434, lng: -99.138 }] } });
    const c = new Chat(deps);
    c.state = BotState.CART;
    c.ctx = { orderType: 'DOMICILIO', cart: [{ productId: 'burger', name: 'Hamburguesa clásica', unitPriceCents: 14900, quantity: 1, modifiers: [] }] };
    await c.btn('cart:done');
    expect(c.ids()).toEqual(['a:a1', 'a:loc', 'a:text']);
    await c.btn('a:text');
    expect(c.state).toBe(BotState.ADDRESS_TEXT);
    await c.send('nada que ver 123');
    expect(c.state).toBe(BotState.ADDRESS_TEXT);
    expect(c.text()).toContain('No encontré');
    await c.send('Av. Juárez 45, Centro');
    expect(c.state).toBe(BotState.ADDRESS_CONFIRM);
    await c.btn('ac:no');
    expect(c.state).toBe(BotState.ADDRESS_TEXT);
    await c.send('Av. Juárez 45, Centro');
    await c.send('Sí, es correcta');
    expect(c.state).toBe(BotState.REFERENCES);
    await c.btn('ref:skip');
    expect(c.state).toBe(BotState.PAYMENT);
  });

  it('dirección guardada con referencias salta a pago', async () => {
    const { deps } = fakeDeps({ customer: { id: 'cu1', name: 'Eva', addresses: [{ id: 'a1', label: 'Casa', text: 'Madero 1', references: 'Azul', lat: 19.434, lng: -99.138 }] } });
    const c = new Chat(deps);
    c.state = BotState.ADDRESS;
    c.ctx = { orderType: 'DOMICILIO', cart: [{ productId: 'burger', name: 'H', unitPriceCents: 14900, quantity: 1, modifiers: [] }], lastOptions: [{ id: 'a:a1', title: 'Casa' }] };
    await c.send('1');
    expect(c.state).toBe(BotState.PAYMENT);
    expect(c.ctx.address).toMatchObject({ id: 'a1', references: 'Azul' });
  });

  it('pedido mínimo de la zona', async () => {
    const { deps } = fakeDeps();
    const c = new Chat(deps);
    c.state = BotState.ADDRESS;
    c.ctx = { orderType: 'DOMICILIO', cart: [{ productId: 'drink1', name: 'Bebida 1', unitPriceCents: 3500, quantity: 1, modifiers: [] }] };
    await c.send({ kind: 'location', ...IN_ZONE });
    expect(c.state).toBe(BotState.CART);
    expect(c.text()).toContain('pedido mínimo');
  });
});

describe('bot — tienda cerrada', () => {
  it('saluda con el mensaje de cerrado y horario', async () => {
    const { deps } = fakeDeps({ open: false });
    const c = new Chat(deps);
    await c.send('hola');
    expect(c.text()).toContain('Cerrados. Horario: Todos los días 09:00–23:00 (abrimos mañana a las 09:00)');
    expect(c.ids()).toEqual(['m:menu', 'm:human']);
    await c.btn('m:order');
    expect(c.text()).toContain('Cerrados');
    expect(c.state).toBe(BotState.MAIN_MENU);
  });

  it('ver menú manda texto y CTA a la web con el token de sesión', async () => {
    const { deps } = fakeDeps();
    const c = new Chat(deps);
    await c.send('hola');
    await c.btn('m:menu');
    expect(c.text()).toContain('Hamburguesa clásica — $149.00');
    const cta = c.last.find((m) => m.kind === 'cta_url') as Extract<OutgoingWa, { kind: 'cta_url' }>;
    expect(cta.url).toBe(`https://app.test/pedir?s=${c.ctx.sessionToken}&tel=525512345678`);
  });
});

describe('bot — humano y cancelar', () => {
  it('traspaso a humano desde cualquier estado', async () => {
    const { deps } = fakeDeps();
    const c = new Chat(deps);
    await c.send('hola');
    await c.btn('m:order');
    await c.send('quiero hablar con un asesor');
    expect(c.state).toBe(BotState.HUMAN);
    expect(c.effects.handoff).toBe(true);
    expect(c.text()).toBe('Te atiende una persona');
    // en modo humano el bot no contesta
    await c.send('hola?');
    expect(c.last).toEqual([]);
    expect(c.state).toBe(BotState.HUMAN);
  });

  it('botón "Hablar con alguien"', async () => {
    const { deps } = fakeDeps();
    const c = new Chat(deps);
    await c.send('hola');
    await c.btn('m:human');
    expect(c.state).toBe(BotState.HUMAN);
  });

  it('cancelar borra el carrito pero conserva el token web', async () => {
    const { deps } = fakeDeps();
    const c = new Chat(deps);
    await c.send('hola');
    const tok = c.ctx.sessionToken;
    await c.btn('m:order');
    await c.btn('t:PASAR_A_RECOGER');
    await c.list('c:cat-drinks');
    await c.list('p:drink1');
    await c.btn('q:1');
    await c.send('Cancelar');
    expect(c.state).toBe(BotState.IDLE);
    expect(c.text()).toContain('cancelé');
    expect(c.ctx).toEqual({ sessionToken: tok });
  });

  it('"menu" reinicia desde cualquier paso', async () => {
    const { deps } = fakeDeps();
    const c = new Chat(deps);
    c.state = BotState.PAYMENT;
    c.ctx = { orderType: 'DOMICILIO', cart: [{ productId: 'x', name: 'x', unitPriceCents: 1, quantity: 1, modifiers: [] }] };
    await c.send('Menú');
    expect(c.state).toBe(BotState.MAIN_MENU);
    expect(c.ctx.cart).toBeUndefined();
  });

  it('confirmar → cancelar', async () => {
    const { deps, created } = fakeDeps({ customer: { id: 'c', name: 'Eva', addresses: [] } });
    const c = new Chat(deps);
    c.state = BotState.PAYMENT;
    c.ctx = { orderType: 'PASAR_A_RECOGER', cart: [{ productId: 'drink1', name: 'Bebida 1', unitPriceCents: 3500, quantity: 1, modifiers: [] }] };
    await c.btn('pay:TARJETA');
    await c.btn('cf:cancel');
    expect(c.state).toBe(BotState.IDLE);
    expect(created).toHaveLength(0);
    expect(c.effects.cancelled).toBe(true);
  });
});

describe('bot — repetir último pedido (WAB-05)', () => {
  const last: LastOrderSummary = {
    folio: 'P-000007',
    type: 'DOMICILIO',
    lines: [],
    items: [{ productId: 'burger', name: 'Hamburguesa clásica', unitPriceCents: 14900, quantity: 1, modifiers: [{ modifierId: 'm-medio', name: 'Término medio', priceCents: 0 }] }],
    missing: ['Limonada'],
    address: null,
  };

  it('muestra la opción, el resumen y continúa a dirección', async () => {
    const saved = { id: 'a1', label: 'Casa', text: 'Madero 1', references: null, lat: 19.434, lng: -99.138 };
    const { deps, created } = fakeDeps({ lastOrder: last, customer: { id: 'cu', name: 'Eva', addresses: [saved] } });
    const c = new Chat(deps);
    await c.send('hola');
    expect(c.ids()).toContain('m:repeat');
    await c.list('m:repeat');
    expect(c.state).toBe(BotState.REPEAT_CONFIRM);
    expect(c.text()).toContain('P-000007');
    expect(c.text()).toContain('Ya no tenemos: Limonada');
    await c.btn('r:yes');
    expect(c.state).toBe(BotState.ADDRESS);
    await c.btn('a:a1');
    expect(c.state).toBe(BotState.REFERENCES);
    await c.btn('ref:skip');
    await c.btn('pay:EFECTIVO');
    await c.btn('cash:exact');
    expect(c.state).toBe(BotState.CONFIRM);
    // editar el pago desde el resumen y volver
    await c.btn('cf:edit');
    expect(c.state).toBe(BotState.EDIT);
    await c.btn('ed:payment');
    await c.btn('pay:TARJETA');
    expect(c.state).toBe(BotState.CONFIRM);
    await c.btn('cf:yes');
    expect(created[0]).toMatchObject({ type: 'DOMICILIO', paymentMethod: 'TARJETA', address: { id: 'a1' } });
  });

  it('"hacer otro" vacía el carrito', async () => {
    const { deps } = fakeDeps({ lastOrder: last });
    const c = new Chat(deps);
    await c.send('hola');
    await c.list('m:repeat');
    await c.btn('r:no');
    expect(c.state).toBe(BotState.ORDER_TYPE);
    expect(c.ctx.cart).toEqual([]);
  });
});

describe('bot — errores al confirmar', () => {
  it('cupón inválido se quita y reconfirma', async () => {
    const { deps } = fakeDeps({ customer: { id: 'c', name: 'Eva', addresses: [] } });
    let n = 0;
    const orig = deps.quote;
    deps.quote = async (i) => {
      const q = await orig(i);
      if (i.couponCode && n++ === 0) return { ...q, canOrder: false, errors: [{ code: 'COUPON_INVALID', message: 'El cupón XYZ ya venció' }] };
      return q;
    };
    const c = new Chat(deps);
    c.state = BotState.CONFIRM;
    c.ctx = { orderType: 'PASAR_A_RECOGER', paymentMethod: 'TARJETA', cart: [{ productId: 'drink1', name: 'B', unitPriceCents: 3500, quantity: 1, modifiers: [] }] };
    await c.send('cupón xyz');
    expect(c.text()).toContain('ya venció');
    expect(c.ctx.couponCode).toBeNull();
    expect(c.state).toBe(BotState.CONFIRM);
  });

  it('si la creación falla muestra el error y vuelve al resumen', async () => {
    const { deps } = fakeDeps({ customer: { id: 'c', name: 'Eva', addresses: [] } });
    deps.createOrder = async () => {
      throw new Error('Estamos cerrados');
    };
    const c = new Chat(deps);
    c.state = BotState.CONFIRM;
    c.ctx = { orderType: 'PASAR_A_RECOGER', paymentMethod: 'TARJETA', cart: [{ productId: 'drink1', name: 'B', unitPriceCents: 3500, quantity: 1, modifiers: [] }] };
    await c.btn('cf:yes');
    expect(c.text()).toContain('Estamos cerrados');
    expect(c.state).toBe(BotState.CONFIRM);
  });

  it('texto no entendido repite la pregunta', async () => {
    const { deps } = fakeDeps();
    const c = new Chat(deps);
    await c.send('hola');
    await c.btn('m:order');
    await c.send('asdf');
    expect(c.state).toBe(BotState.ORDER_TYPE);
    expect(c.text()).toContain('No te entendí');
  });
});
