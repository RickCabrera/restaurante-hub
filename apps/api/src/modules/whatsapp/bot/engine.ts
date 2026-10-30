// Motor conversacional del bot de WhatsApp (WAB-02/05). Máquina de estados PURA:
//   runBot(state, context, inbound, deps) → { state, context, replies, effects }
// No toca BD ni red directamente: todo pasa por `deps` (fakes en bot/engine.spec.ts).
import { formatMoney, lineTotalCents, PaymentMethodLabel } from '@rh/shared';
import type { CartLineInput, PaymentMethod } from '@rh/shared';
import type { OutgoingWa } from '../../../whatsapp/client/whatsapp.client';
import type { MenuCategory, MenuModifierGroup, MenuProduct } from '../../delivery/menu/menu.service';
import {
  BotContext, BotDeps, BotEffects, BotResult, BotState, CartItem, CartMod, CoverageInfo, Inbound,
} from './types';

const PAGE = 8; // productos por página (+ "Ver más…" + "Volver" ≤ 10 filas)
const money = (c: number) => formatMoney(c);

export function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ$., ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RESTART = new Set(['hola', 'menu', 'inicio', 'empezar', 'reiniciar', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'hi', 'hello', 'ola']);
const CANCEL = new Set(['cancelar', 'cancela', 'cancelar pedido', 'cancelalo', 'ya no']);
const HUMAN_WORDS = ['humano', 'asesor', 'persona', 'agente', 'hablar con alguien', 'operador'];
const YES = new Set(['si', 'ok', 'va', 'sale', 'dale', 'confirmo', 'confirmar', 'correcto', 'claro', 'esta bien', 'si es correcta', 'yes']);
const NO = new Set(['no', 'nel', 'incorrecta', 'no es']);

export function fill(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** "$500", "500 pesos", "1,000", "350.50" → centavos */
export function parseAmount(text: string): number | null {
  const t = text.replace(/[, ]/g, '').replace(/pesos|mxn|\$/gi, '');
  const m = /^(\d{1,6})(\.\d{1,2})?$/.exec(t);
  if (!m) return null;
  return Math.round(Number(m[1] + (m[2] ?? '')) * 100);
}

class Out {
  readonly replies: OutgoingWa[] = [];
  options: { id: string; title: string }[] | undefined;

  text(body: string) {
    this.replies.push({ kind: 'text', body });
    return this;
  }
  buttons(body: string, buttons: { id: string; title: string }[], footer?: string) {
    this.replies.push({ kind: 'buttons', body, buttons: buttons.slice(0, 3), ...(footer ? { footer } : {}) });
    this.options = buttons.slice(0, 3);
    return this;
  }
  list(body: string, buttonText: string, rows: { id: string; title: string; description?: string }[], sectionTitle = 'Opciones') {
    const r = rows.slice(0, 10);
    this.replies.push({ kind: 'list', body, buttonText, sections: [{ title: sectionTitle, rows: r }] });
    this.options = r.map((x) => ({ id: x.id, title: x.title }));
    return this;
  }
  /** botones si caben (≤3), si no lista */
  choose(body: string, opts: { id: string; title: string; description?: string }[], buttonText = 'Ver opciones') {
    return opts.length <= 3 ? this.buttons(body, opts) : this.list(body, buttonText, opts);
  }
  raw(m: OutgoingWa) {
    this.replies.push(m);
    return this;
  }
}

/** Opción elegida: id de botón/lista, número de opción o texto igual al título. */
export function choice(inb: Inbound, ctx: BotContext): string | null {
  if (inb.kind === 'button' || inb.kind === 'list') return inb.id;
  if (inb.kind !== 'text') return null;
  const t = norm(inb.text);
  const opts = ctx.lastOptions ?? [];
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= opts.length) return opts[n - 1].id;
  }
  const exact = opts.find((o) => norm(o.title) === t);
  if (exact) return exact.id;
  if (t.length >= 3) {
    const pre = opts.filter((o) => norm(o.title).startsWith(t) || norm(o.title).split(' ').some((w) => w.length >= 4 && w === t));
    if (pre.length === 1) return pre[0].id;
  }
  if (YES.has(t)) return opts.find((o) => o.id.endsWith(':yes'))?.id ?? null;
  if (NO.has(t)) return opts.find((o) => o.id.endsWith(':no'))?.id ?? null;
  return null;
}

const toLines = (cart: CartItem[]): CartLineInput[] =>
  cart.map((i) => ({ productId: i.productId, quantity: i.quantity, modifiers: i.modifiers.map((m) => ({ modifierId: m.modifierId, quantity: 1 })), note: i.note ?? undefined }));

const itemTotal = (i: CartItem) => lineTotalCents({ unitPriceCents: i.unitPriceCents, quantity: i.quantity, modifiers: i.modifiers });
export const cartSubtotal = (cart: CartItem[]) => cart.reduce((s, i) => s + itemTotal(i), 0);

export function cartText(cart: CartItem[]): string {
  return cart
    .map((i) => {
      const mods = i.modifiers.length ? ` (${i.modifiers.map((m) => m.name).join(', ')})` : '';
      return `• ${i.quantity}× ${i.name}${mods} — ${money(itemTotal(i))}`;
    })
    .join('\n');
}

function sameItem(a: CartItem, b: CartItem) {
  if (a.productId !== b.productId || (a.note ?? '') !== (b.note ?? '')) return false;
  const ka = a.modifiers.map((m) => m.modifierId).sort().join(',');
  const kb = b.modifiers.map((m) => m.modifierId).sort().join(',');
  return ka === kb;
}

const availableGroupMods = (g: MenuModifierGroup) => g.modifiers.filter((m) => m.available);

/**
 * Ejecuta un paso del bot. Nunca lanza: los errores de dependencias se traducen en mensajes amables.
 */
export async function runBot(state: BotState, context: BotContext, inbound: Inbound, deps: BotDeps): Promise<BotResult> {
  const ctx: BotContext = { ...context };
  const out = new Out();
  const effects: BotEffects = {};
  let next: BotState = state;

  const vars = async () => {
    const st = await deps.store();
    return { negocio: deps.business.name, horario: st.hoursText + (st.nextOpeningText ? ` (abrimos ${st.nextOpeningText})` : '') };
  };

  // ------------------------------------------------------------------ prompts por estado
  const closedReply = async () => {
    out.buttons(fill(deps.texts.closedMessage, await vars()), [
      { id: 'm:menu', title: '📋 Ver menú' },
      { id: 'm:human', title: '🙋 Hablar con alguien' },
    ]);
    return BotState.MAIN_MENU;
  };

  const greet = async (prefix?: string): Promise<BotState> => {
    if (!ctx.sessionToken) ctx.sessionToken = deps.newSessionToken();
    const st = await deps.store();
    if (prefix) out.text(prefix);
    if (!st.open) return closedReply();
    const body = fill(deps.texts.greeting, await vars());
    const last = await deps.lastOrder().catch(() => null);
    if (last && last.items.length) {
      out.list(body, 'Ver opciones', [
        { id: 'm:order', title: '🛒 Hacer pedido' },
        { id: 'm:repeat', title: '🔁 Repetir último pedido', description: `Tu pedido ${last.folio}` },
        { id: 'm:menu', title: '📋 Ver menú' },
        { id: 'm:human', title: '🙋 Hablar con alguien' },
      ]);
    } else {
      out.buttons(body, [
        { id: 'm:order', title: '🛒 Hacer pedido' },
        { id: 'm:menu', title: '📋 Ver menú' },
        { id: 'm:human', title: '🙋 Hablar con alguien' },
      ]);
    }
    return BotState.MAIN_MENU;
  };

  const askType = (): BotState => {
    out.buttons('¿Cómo quieres recibir tu pedido?', [
      { id: 't:DOMICILIO', title: '🛵 Domicilio' },
      { id: 't:PASAR_A_RECOGER', title: '🏃 Pasar a recoger' },
    ]);
    return BotState.ORDER_TYPE;
  };

  const visibleMenu = async (): Promise<MenuCategory[]> => {
    const m = await deps.menu();
    return m.map((c) => ({ ...c, products: c.products.filter((p) => p.available) })).filter((c) => c.products.length);
  };

  const askCategory = async (prefix?: string): Promise<BotState> => {
    const cats = await visibleMenu();
    if (!cats.length) {
      out.text('Por ahora no tenemos productos disponibles 😔. Intenta más tarde.');
      return BotState.MAIN_MENU;
    }
    const cart = ctx.cart ?? [];
    const rows: { id: string; title: string; description?: string }[] = cats.slice(0, cart.length ? 9 : 10).map((c) => ({
      id: `c:${c.id}`,
      title: c.name,
      description: `${c.products.length} ${c.products.length === 1 ? 'opción' : 'opciones'}`,
    }));
    if (cart.length) rows.push({ id: 'cart:view', title: '🛒 Ver mi carrito', description: `${cart.reduce((s, i) => s + i.quantity, 0)} productos · ${money(cartSubtotal(cart))}` });
    out.list(`${prefix ? prefix + '\n\n' : ''}Elige una categoría 👇`, 'Ver categorías', rows, 'Menú');
    return BotState.CATEGORY;
  };

  const askProduct = async (): Promise<BotState> => {
    const cats = await visibleMenu();
    const cat = cats.find((c) => c.id === ctx.categoryId);
    if (!cat) return askCategory();
    const page = ctx.page ?? 0;
    const items = cat.products.slice(page * PAGE, page * PAGE + PAGE);
    const rows: { id: string; title: string; description?: string }[] = items.map((p) => ({ id: `p:${p.id}`, title: p.name, description: `${money(p.priceCents)}${p.description ? ' · ' + p.description : ''}` }));
    if (cat.products.length > (page + 1) * PAGE) rows.push({ id: 'p:more', title: 'Ver más…', description: 'Más productos de esta categoría' });
    rows.push({ id: 'p:back', title: '⬅️ Otras categorías' });
    out.list(`*${cat.name}* — elige un producto`, 'Ver productos', rows, cat.name);
    return BotState.PRODUCT;
  };

  const findProduct = async (id: string): Promise<MenuProduct | null> => {
    for (const c of await deps.menu()) {
      const p = c.products.find((x) => x.id === id);
      if (p) return p;
    }
    return null;
  };

  const askModifiers = async (prefix?: string): Promise<BotState> => {
    const pend = ctx.pending!;
    const p = await findProduct(pend.productId);
    if (!p || !p.available) {
      ctx.pending = undefined;
      out.text('Ese producto ya no está disponible 😔');
      return askProduct();
    }
    // salta grupos ya resueltos
    while (pend.groupIndex < p.modifierGroups.length) {
      const g = p.modifierGroups[pend.groupIndex];
      const mods = availableGroupMods(g);
      if (mods.length === 0 && g.minSelect === 0) {
        pend.groupIndex++;
        continue;
      }
      if (mods.length < g.minSelect) {
        ctx.pending = undefined;
        out.text(`Lo sentimos, por ahora no podemos preparar ${p.name} (sin opciones de ${g.name.toLowerCase()}) 😔`);
        return askProduct();
      }
      const selectedInGroup = pend.selected.filter((id) => mods.some((m) => m.id === id));
      const remaining = mods.filter((m) => !selectedInGroup.includes(m.id));
      if (g.maxSelect <= 1) {
        const opts: { id: string; title: string; description?: string }[] = mods.map((m) => ({ id: `mod:${m.id}`, title: m.name, description: m.priceCents ? `+${money(m.priceCents)}` : undefined }));
        if (g.minSelect === 0) opts.push({ id: 'mod:skip', title: 'Sin ' + g.name.toLowerCase(), description: undefined });
        const body = `${prefix ? prefix + '\n\n' : ''}*${p.name}*\nElige ${g.name.toLowerCase()}:`;
        out.choose(body, opts.slice(0, 10).map((o) => (o.description ? o : { id: o.id, title: o.title })), 'Ver opciones');
      } else {
        const chosen = pend.modifiers.filter((m) => selectedInGroup.includes(m.modifierId));
        const head = chosen.length ? `Llevas: ${chosen.map((m) => m.name).join(', ')}.` : '';
        const need = g.minSelect > 0 ? ` (mínimo ${g.minSelect}, máximo ${g.maxSelect})` : ` (hasta ${g.maxSelect})`;
        const opts = remaining.slice(0, 9).map((m) => ({ id: `mod:${m.id}`, title: m.name, description: m.priceCents ? `+${money(m.priceCents)}` : undefined }));
        opts.push({ id: 'mod:done', title: chosen.length ? '✅ Listo' : g.minSelect === 0 ? 'Sin ' + g.name.toLowerCase() : '✅ Listo', description: undefined });
        const body = `${prefix ? prefix + '\n\n' : ''}*${p.name}*\n${g.name}${need}. ${head}`.trim();
        out.choose(body, opts.map((o) => (o.description ? o : { id: o.id, title: o.title })), 'Ver opciones');
      }
      return BotState.MODIFIERS;
    }
    return askQuantity(p);
  };

  const askQuantity = (p: { name: string }): BotState => {
    out.buttons(`¿Cuántas *${p.name}* quieres? (o escribe otra cantidad)`, [
      { id: 'q:1', title: '1' },
      { id: 'q:2', title: '2' },
      { id: 'q:3', title: '3' },
    ]);
    return BotState.QUANTITY;
  };

  const showCart = (prefix?: string): BotState => {
    const cart = ctx.cart ?? [];
    if (!cart.length) {
      out.text(`${prefix ? prefix + '\n' : ''}Tu carrito está vacío.`);
      return BotState.CART;
    }
    out.buttons(`${prefix ? prefix + '\n\n' : ''}🛒 *Tu pedido*\n${cartText(cart)}\n\nSubtotal: *${money(cartSubtotal(cart))}*`, [
      { id: 'cart:add', title: '➕ Agregar más' },
      { id: 'cart:done', title: '✅ Terminar pedido' },
      { id: 'cart:clear', title: '🗑️ Vaciar' },
    ]);
    return BotState.CART;
  };

  const askAddress = async (prefix?: string): Promise<BotState> => {
    const c = await deps.customer();
    const saved = c.addresses.slice(0, 7);
    const body = `${prefix ? prefix + '\n\n' : ''}📍 ¿A dónde te lo llevamos?`;
    if (!saved.length) {
      out.raw({ kind: 'location_request', body: `${body}\nComparte tu ubicación con el botón 📍 o escribe tu dirección (calle, número y colonia).` });
      out.options = undefined;
      return BotState.ADDRESS;
    }
    const opts = [
      ...saved.map((a) => ({ id: `a:${a.id}`, title: a.label || a.text, description: a.label ? a.text : undefined })),
      { id: 'a:loc', title: '📍 Enviar ubicación', description: undefined },
      { id: 'a:text', title: 'Escribir dirección', description: undefined },
    ];
    out.choose(body, opts.map((o) => (o.description ? o : { id: o.id, title: o.title })), 'Elegir dirección');
    return BotState.ADDRESS;
  };

  const askReferences = (prefix?: string): BotState => {
    out.buttons(`${prefix ? prefix + '\n\n' : ''}¿Alguna referencia para encontrarte? (color de fachada, entre qué calles, número interior…)`, [
      { id: 'ref:skip', title: 'Omitir' },
    ]);
    return BotState.REFERENCES;
  };

  const askPayment = (prefix?: string): BotState => {
    const pickup = ctx.orderType === 'PASAR_A_RECOGER';
    out.buttons(`${prefix ? prefix + '\n\n' : ''}💳 ¿Cómo vas a pagar?${pickup ? '' : '\nCon tarjeta llevamos terminal a la entrega.'}`, [
      { id: 'pay:EFECTIVO', title: '💵 Efectivo' },
      { id: 'pay:TARJETA', title: '💳 Tarjeta' },
      { id: 'pay:TRANSFERENCIA', title: '🏦 Transferencia' },
    ]);
    return BotState.PAYMENT;
  };

  const quoteNow = () =>
    deps.quote({
      type: ctx.orderType ?? 'PASAR_A_RECOGER',
      lines: toLines(ctx.cart ?? []),
      address: ctx.orderType === 'DOMICILIO' && ctx.address
        ? { id: ctx.address.id ?? undefined, text: ctx.address.text, references: ctx.address.references ?? undefined, lat: ctx.address.lat ?? undefined, lng: ctx.address.lng ?? undefined }
        : undefined,
      couponCode: ctx.couponCode ?? undefined,
    });

  const askCash = async (): Promise<BotState> => {
    let total = cartSubtotal(ctx.cart ?? []) + (ctx.orderType === 'DOMICILIO' ? ctx.coverage?.feeCents ?? 0 : 0);
    try {
      total = (await quoteNow()).totalCents;
    } catch {
      /* usa estimado */
    }
    out.buttons(`Tu total es de *${money(total)}*. ¿Con cuánto vas a pagar? Escribe el monto para llevarte cambio (ej. 500).`, [
      { id: 'cash:exact', title: 'Pago exacto' },
    ]);
    return BotState.CASH_AMOUNT;
  };

  const afterPayment = async (): Promise<BotState> => {
    const c = await deps.customer();
    if (!ctx.name && !c.name) {
      out.text('¿A nombre de quién registramos el pedido?');
      return BotState.NAME;
    }
    return confirm();
  };

  const confirm = async (prefix?: string): Promise<BotState> => {
    ctx.reviewing = true;
    let q;
    try {
      q = await quoteNow();
    } catch {
      out.text('Tuvimos un problema al calcular tu pedido 😔. Intenta de nuevo en un momento.');
      return showCart();
    }
    const err = q.errors[0];
    if (err) {
      switch (err.code) {
        case 'STORE_CLOSED':
          return closedReply();
        case 'OUT_OF_ZONE':
        case 'ADDRESS_REQUIRED':
        case 'ADDRESS_NOT_FOUND':
          ctx.address = null;
          return askAddress(err.message);
        case 'MIN_ORDER':
          out.buttons(`${err.message}. Llevas ${money(q.subtotalCents)}.`, [
            { id: 'cart:add', title: '➕ Agregar más' },
            { id: 'oz:pickup', title: '🏃 Pasar a recoger' },
          ]);
          return BotState.CART;
        case 'COUPON_INVALID':
          ctx.couponCode = null;
          return confirm(`⚠️ ${err.message}`);
        case 'PRODUCT_UNAVAILABLE':
        case 'PRODUCT_NOT_FOUND':
        case 'MODIFIER_UNAVAILABLE':
        case 'MODIFIER_INVALID':
        case 'MODIFIER_MIN':
        case 'MODIFIER_MAX': {
          const idx = q.errors.filter((e) => e.lineIndex != null).map((e) => e.lineIndex!);
          ctx.cart = (ctx.cart ?? []).filter((_, i) => !idx.includes(i));
          return showCart(`⚠️ ${q.errors.map((e) => e.message).join('\n')}\nLo quitamos de tu carrito.`);
        }
        default:
          out.text(`⚠️ ${err.message}`);
          return showCart();
      }
    }
    const lines = q.lines
      .map((l) => `• ${l.quantity}× ${l.name}${l.modifiers.length ? ` (${l.modifiers.map((m) => m.name).join(', ')})` : ''} — ${money(l.totalCents)}`)
      .join('\n');
    const parts = [
      prefix ?? '',
      '📝 *Resumen de tu pedido*',
      lines,
      '',
      `Subtotal: ${money(q.subtotalCents)}`,
      ...q.appliedPromotions.filter((p) => p.discountCents > 0).map((p) => `🎁 ${p.name}: -${money(p.discountCents)}`),
      q.coupon && q.coupon.discountCents > 0 ? `🏷️ Cupón ${q.coupon.code}: -${money(q.coupon.discountCents)}` : '',
      ctx.orderType === 'DOMICILIO' ? `Envío: ${q.deliveryFeeCents ? money(q.deliveryFeeCents) : 'gratis 🎉'}` : '',
      `*Total: ${money(q.totalCents)}*`,
      '',
      ctx.orderType === 'DOMICILIO'
        ? `🛵 A domicilio: ${ctx.address?.text ?? ''}${ctx.address?.references ? `\nReferencias: ${ctx.address.references}` : ''}`
        : '🏃 Pasas a recoger a la sucursal',
      `💳 Pago: ${PaymentMethodLabel[ctx.paymentMethod ?? 'EFECTIVO']}${ctx.paymentMethod === 'EFECTIVO' && ctx.cashGivenCents ? ` (pagas con ${money(ctx.cashGivenCents)}, cambio ${money(Math.max(0, ctx.cashGivenCents - q.totalCents))})` : ''}`,
      q.estimatedMinutes ? `⏱️ Tiempo estimado: ${q.estimatedMinutes} min` : '',
      ...q.warnings.map((w) => `ℹ️ ${w}`),
    ].filter((x, i, arr) => x !== '' || (i > 0 && arr[i - 1] !== ''));
    const c = await deps.customer();
    const footer = !c.id && deps.privacyNoticeUrl ? `Al confirmar aceptas el aviso de privacidad` : '¿Tienes cupón? Escribe: cupón CÓDIGO';
    if (!c.id && deps.privacyNoticeUrl) parts.push(`\nAviso de privacidad: ${deps.privacyNoticeUrl}`);
    out.buttons(parts.join('\n').trim(), [
      { id: 'cf:yes', title: '✅ Confirmar' },
      { id: 'cf:edit', title: '✏️ Editar' },
      { id: 'cf:cancel', title: '❌ Cancelar' },
    ], footer);
    return BotState.CONFIRM;
  };

  const afterAddressOk = (): Promise<BotState> | BotState => (ctx.reviewing && ctx.paymentMethod ? confirm() : askPayment());

  /** Valida cobertura para una ubicación y avanza. */
  const checkCoverage = async (addr: { id?: string | null; text: string; lat: number; lng: number; references?: string | null }): Promise<BotState> => {
    let cv: CoverageInfo | null = null;
    try {
      cv = await deps.coverage(addr.lat, addr.lng);
    } catch {
      cv = null;
    }
    if (!cv) {
      ctx.address = null;
      ctx.coverage = null;
      out.buttons(`😔 Lo sentimos, *${addr.text}* está fuera de nuestra zona de reparto.\n¿Quieres pasar a recoger tu pedido o probar otra dirección?`, [
        { id: 'oz:pickup', title: '🏃 Pasar a recoger' },
        { id: 'oz:retry', title: '📍 Otra dirección' },
        { id: 'm:human', title: '🙋 Hablar con alguien' },
      ]);
      return BotState.ADDRESS;
    }
    ctx.address = { id: addr.id ?? null, text: addr.text, lat: addr.lat, lng: addr.lng, references: addr.references ?? null };
    ctx.coverage = cv;
    ctx.candidate = null;
    const sub = cartSubtotal(ctx.cart ?? []);
    const free = cv.freeFromCents != null && sub >= cv.freeFromCents;
    const msg = `✅ ¡Sí llegamos! Zona: ${cv.zoneName}\nEnvío: ${free || cv.feeCents === 0 ? 'gratis 🎉' : money(cv.feeCents)} · Tiempo estimado: ${cv.etaMinutes} min`;
    if (sub < cv.minOrderCents) {
      out.buttons(`${msg}\n\nEl pedido mínimo para tu zona es de ${money(cv.minOrderCents)} y llevas ${money(sub)}.`, [
        { id: 'cart:add', title: '➕ Agregar más' },
        { id: 'oz:pickup', title: '🏃 Pasar a recoger' },
      ]);
      return BotState.CART;
    }
    if (addr.references) {
      out.text(msg);
      return afterAddressOk();
    }
    return askReferences(msg);
  };

  const handleLocation = async (inb: Extract<Inbound, { kind: 'location' }>): Promise<BotState> => {
    let text = [inb.name, inb.address].filter(Boolean).join(', ');
    if (!text) {
      const r = await deps.reverse(inb.lat, inb.lng).catch(() => null);
      text = r?.formatted ?? `Ubicación compartida (${inb.lat.toFixed(5)}, ${inb.lng.toFixed(5)})`;
    }
    return checkCoverage({ text, lat: inb.lat, lng: inb.lng });
  };

  const handleAddressText = async (raw: string): Promise<BotState> => {
    const text = raw.trim();
    if (text.length < 6) {
      out.text('Escribe tu dirección completa: calle, número y colonia 🙏');
      return BotState.ADDRESS_TEXT;
    }
    const g = await deps.geocode(text).catch(() => null);
    if (!g) {
      out.raw({ kind: 'location_request', body: 'No encontré esa dirección 🤔. Revisa calle, número y colonia, o comparte tu ubicación con el botón 📍.' });
      out.options = undefined;
      return BotState.ADDRESS_TEXT;
    }
    ctx.candidate = { text, lat: g.lat, lng: g.lng, formatted: g.formatted };
    out.buttons(`¿Es correcta esta dirección?\n📍 ${g.formatted}`, [
      { id: 'ac:yes', title: 'Sí, es correcta' },
      { id: 'ac:no', title: 'No' },
    ]);
    return BotState.ADDRESS_CONFIRM;
  };

  const startOrderType = async (type: 'DOMICILIO' | 'PASAR_A_RECOGER'): Promise<BotState> => {
    ctx.orderType = type;
    ctx.cart = ctx.cart ?? [];
    return askCategory(type === 'DOMICILIO' ? '🛵 Pedido a domicilio.' : '🏃 Pasas a recoger.');
  };

  const toPickup = (): Promise<BotState> | BotState => {
    ctx.orderType = 'PASAR_A_RECOGER';
    ctx.address = null;
    ctx.coverage = null;
    if (!(ctx.cart ?? []).length) return askCategory('🏃 Perfecto, pasas a recoger.');
    return ctx.reviewing && ctx.paymentMethod ? confirm('🏃 Perfecto, pasas a recoger.') : askPayment('🏃 Perfecto, pasas a recoger.');
  };

  const menuText = async () => {
    const cats = await visibleMenu();
    let txt = `📋 *Menú de ${deps.business.name}*\n`;
    for (const c of cats) {
      txt += `\n*${c.name}*\n` + c.products.map((p) => `• ${p.name} — ${money(p.priceCents)}`).join('\n') + '\n';
    }
    return txt.length > 3800 ? txt.slice(0, 3790) + '\n…' : txt;
  };

  const webUrl = () => `${deps.appUrl.replace(/\/$/, '')}/pedir?s=${encodeURIComponent(ctx.sessionToken ?? '')}&tel=${encodeURIComponent(deps.phone)}`;

  const handoff = (): BotState => {
    out.text(deps.texts.handoffMessage);
    effects.handoff = true;
    return BotState.HUMAN;
  };

  // ------------------------------------------------------------------ comandos globales
  try {
    if (inbound.kind === 'text') {
      const t = norm(inbound.text);
      if (CANCEL.has(t)) {
        const had = (ctx.cart ?? []).length > 0;
        const keepToken = ctx.sessionToken;
        for (const k of Object.keys(ctx)) delete (ctx as Record<string, unknown>)[k];
        if (keepToken) ctx.sessionToken = keepToken;
        out.text(had ? 'Listo, cancelé tu pedido. Escribe *hola* cuando quieras volver a empezar 👋' : 'No hay ningún pedido en curso. Escribe *hola* para empezar 👋');
        effects.cancelled = true;
        return { state: BotState.IDLE, context: { sessionToken: ctx.sessionToken }, replies: out.replies, effects };
      }
      if (HUMAN_WORDS.some((w) => t === w || t.includes(w))) {
        next = handoff();
        return { state: next, context: { ...ctx, lastOptions: undefined }, replies: out.replies, effects };
      }
      if (RESTART.has(t) && state !== BotState.HUMAN) {
        const keepToken = ctx.sessionToken;
        for (const k of Object.keys(ctx)) delete (ctx as Record<string, unknown>)[k];
        if (keepToken) ctx.sessionToken = keepToken;
        next = await greet();
        return { state: next, context: { ...ctx, lastOptions: out.options }, replies: out.replies, effects };
      }
    }

    const pick = choice(inbound, ctx);
    if (pick === 'm:human') {
      next = handoff();
      return { state: next, context: { ...ctx, lastOptions: undefined }, replies: out.replies, effects };
    }
    if (pick === 'oz:pickup' && [BotState.ADDRESS, BotState.CART, BotState.ADDRESS_CONFIRM, BotState.ADDRESS_TEXT].includes(state as never)) {
      next = await toPickup();
      return { state: next, context: { ...ctx, lastOptions: out.options }, replies: out.replies, effects };
    }

    const unknown = (prefix = 'No te entendí 🤔') => prefix;

    switch (state) {
      case BotState.HUMAN:
        // El bot está en pausa: la persona atiende desde la bandeja
        next = BotState.HUMAN;
        break;

      case BotState.IDLE: {
        if (inbound.kind === 'image') {
          out.text('¡Gracias! Recibimos tu imagen 👍. Si es un comprobante de pago lo revisaremos en breve.');
          next = BotState.IDLE;
          break;
        }
        next = await greet();
        break;
      }

      case BotState.MAIN_MENU: {
        if (pick === 'm:order') {
          const st = await deps.store();
          next = st.open ? askType() : await closedReply();
        } else if (pick === 'm:menu') {
          if (!ctx.sessionToken) ctx.sessionToken = deps.newSessionToken();
          out.text(await menuText());
          out.raw({ kind: 'cta_url', body: '¿Prefieres ver fotos y armar tu pedido en la web? Te confirmamos por aquí 👇', buttonText: 'Pedir en la web', url: webUrl() });
          const st = await deps.store();
          if (st.open) {
            out.buttons('¿Quieres pedir por aquí?', [
              { id: 'm:order', title: '🛒 Hacer pedido' },
              { id: 'm:human', title: '🙋 Hablar con alguien' },
            ]);
          } else {
            out.text(fill(deps.texts.closedMessage, await vars()));
          }
          next = BotState.MAIN_MENU;
        } else if (pick === 'm:repeat') {
          const last = await deps.lastOrder();
          if (!last || !last.items.length) {
            out.text('No encontré un pedido anterior que podamos repetir.');
            next = askType();
            break;
          }
          const st = await deps.store();
          if (!st.open) {
            next = await closedReply();
            break;
          }
          ctx.cart = last.items;
          ctx.orderType = last.type;
          const miss = last.missing.length ? `\n⚠️ Ya no tenemos: ${last.missing.join(', ')}` : '';
          out.buttons(
            `🔁 Tu último pedido (${last.folio}):\n${cartText(last.items)}\nSubtotal: *${money(cartSubtotal(last.items))}*${miss}\n\n${last.type === 'DOMICILIO' ? '🛵 A domicilio' : '🏃 Para recoger'}. ¿Lo repetimos?`,
            [
              { id: 'r:yes', title: '✅ Sí, repetir' },
              { id: 'r:no', title: '✏️ Hacer otro' },
            ],
          );
          next = BotState.REPEAT_CONFIRM;
        } else {
          next = await greet(unknown('No te entendí 🤔 Elige una opción:'));
        }
        break;
      }

      case BotState.REPEAT_CONFIRM: {
        if (pick === 'r:yes') {
          if (ctx.orderType === 'DOMICILIO') next = await askAddress('¡Va! 🙌');
          else next = askPayment('¡Va! 🙌');
        } else if (pick === 'r:no') {
          ctx.cart = [];
          next = askType();
        } else {
          out.buttons('No te entendí 🤔 ¿Repetimos tu último pedido?', [
            { id: 'r:yes', title: '✅ Sí, repetir' },
            { id: 'r:no', title: '✏️ Hacer otro' },
          ]);
          next = BotState.REPEAT_CONFIRM;
        }
        break;
      }

      case BotState.ORDER_TYPE: {
        if (pick === 't:DOMICILIO' || pick === 't:PASAR_A_RECOGER') {
          next = await startOrderType(pick.slice(2) as 'DOMICILIO' | 'PASAR_A_RECOGER');
        } else {
          out.text(unknown());
          next = askType();
        }
        break;
      }

      case BotState.CATEGORY: {
        if (pick?.startsWith('c:')) {
          ctx.categoryId = pick.slice(2);
          ctx.page = 0;
          next = await askProduct();
        } else if (pick === 'cart:view') {
          next = showCart();
        } else {
          next = await askCategory(unknown());
        }
        break;
      }

      case BotState.PRODUCT: {
        if (pick === 'p:more') {
          ctx.page = (ctx.page ?? 0) + 1;
          next = await askProduct();
        } else if (pick === 'p:back') {
          next = await askCategory();
        } else if (pick?.startsWith('p:')) {
          const p = await findProduct(pick.slice(2));
          if (!p || !p.available) {
            out.text('Ese producto no está disponible por ahora 😔');
            next = await askProduct();
          } else {
            ctx.pending = { productId: p.id, groupIndex: 0, selected: [], modifiers: [] };
            next = await askModifiers();
          }
        } else {
          out.text(unknown());
          next = await askProduct();
        }
        break;
      }

      case BotState.MODIFIERS: {
        const pend = ctx.pending;
        const p = pend ? await findProduct(pend.productId) : null;
        if (!pend || !p) {
          next = await askCategory();
          break;
        }
        const g = p.modifierGroups[pend.groupIndex];
        if (!g) {
          next = askQuantity(p);
          break;
        }
        const mods = availableGroupMods(g);
        const inGroup = () => pend.selected.filter((id) => mods.some((m) => m.id === id)).length;
        if (pick === 'mod:skip' || pick === 'mod:done') {
          if (inGroup() < g.minSelect) {
            next = await askModifiers(`Elige al menos ${g.minSelect} ${g.minSelect === 1 ? 'opción' : 'opciones'} de ${g.name.toLowerCase()} 🙏`);
          } else {
            pend.groupIndex++;
            next = await askModifiers();
          }
        } else if (pick?.startsWith('mod:')) {
          const m = mods.find((x) => x.id === pick.slice(4));
          if (!m) {
            next = await askModifiers('Esa opción no está disponible 🤔');
            break;
          }
          if (!pend.selected.includes(m.id)) {
            pend.selected.push(m.id);
            pend.modifiers.push({ modifierId: m.id, name: m.name, priceCents: m.priceCents } as CartMod);
          }
          if (g.maxSelect <= 1 || inGroup() >= g.maxSelect) pend.groupIndex++;
          next = await askModifiers();
        } else {
          next = await askModifiers(unknown());
        }
        break;
      }

      case BotState.QUANTITY: {
        let qty: number | null = null;
        if (pick?.startsWith('q:')) qty = Number(pick.slice(2));
        else if (inbound.kind === 'text') {
          const n = Number(norm(inbound.text).replace(/[^0-9]/g, ''));
          if (Number.isInteger(n) && n >= 1) qty = n;
        }
        const pend = ctx.pending;
        const p = pend ? await findProduct(pend.productId) : null;
        if (!pend || !p) {
          next = await askCategory();
          break;
        }
        if (!qty || qty > 50) {
          out.text(qty && qty > 50 ? 'Para pedidos de más de 50 piezas escríbenos *asesor* 🙏' : unknown('Escribe un número, por ejemplo 4'));
          next = askQuantity(p);
          break;
        }
        const item: CartItem = { productId: p.id, name: p.name, unitPriceCents: p.priceCents, quantity: qty, modifiers: pend.modifiers };
        const cart = [...(ctx.cart ?? [])];
        const ex = cart.find((i) => sameItem(i, item));
        if (ex) ex.quantity += qty;
        else cart.push(item);
        ctx.cart = cart;
        ctx.pending = undefined;
        next = showCart(`✅ Agregado: ${qty}× ${p.name}`);
        break;
      }

      case BotState.CART: {
        if (pick === 'cart:add') next = await askCategory();
        else if (pick === 'cart:clear') {
          ctx.cart = [];
          next = await askCategory('🗑️ Vaciamos tu carrito.');
        } else if (pick === 'cart:done') {
          if (!(ctx.cart ?? []).length) {
            next = await askCategory('Tu carrito está vacío; agrega algo primero 🙂');
          } else if (ctx.orderType === 'DOMICILIO') {
            if (ctx.reviewing && ctx.address?.lat != null && ctx.address?.lng != null) {
              next = await checkCoverage({ ...ctx.address, lat: ctx.address.lat, lng: ctx.address.lng });
            } else next = await askAddress();
          } else if (!ctx.orderType) {
            next = askType();
          } else next = ctx.reviewing && ctx.paymentMethod ? await confirm() : askPayment();
        } else {
          next = (ctx.cart ?? []).length ? showCart(unknown()) : await askCategory();
        }
        break;
      }

      case BotState.ADDRESS:
      case BotState.ADDRESS_TEXT: {
        if (inbound.kind === 'location') {
          next = await handleLocation(inbound);
        } else if (pick === 'a:loc') {
          out.raw({ kind: 'location_request', body: 'Toca el botón para compartir tu ubicación 📍' });
          next = BotState.ADDRESS;
        } else if (pick === 'a:text') {
          out.text('Escribe tu dirección: calle, número, colonia (y alcaldía/municipio) ✍️');
          next = BotState.ADDRESS_TEXT;
        } else if (pick === 'oz:retry') {
          next = await askAddress();
        } else if (pick?.startsWith('a:')) {
          const c = await deps.customer();
          const a = c.addresses.find((x) => x.id === pick.slice(2));
          if (!a) next = await askAddress('Esa dirección ya no está guardada 🤔');
          else if (a.lat != null && a.lng != null) next = await checkCoverage({ id: a.id, text: a.text, lat: a.lat, lng: a.lng, references: a.references });
          else {
            const g = await deps.geocode(a.text).catch(() => null);
            next = g ? await checkCoverage({ id: a.id, text: a.text, lat: g.lat, lng: g.lng, references: a.references }) : await askAddress('No pudimos ubicar esa dirección; compártela de nuevo 📍');
          }
        } else if (inbound.kind === 'text') {
          next = await handleAddressText(inbound.text);
        } else {
          next = await askAddress(unknown());
        }
        break;
      }

      case BotState.ADDRESS_CONFIRM: {
        if (inbound.kind === 'location') next = await handleLocation(inbound);
        else if (pick === 'ac:yes' && ctx.candidate?.lat != null && ctx.candidate.lng != null) {
          next = await checkCoverage({ text: ctx.candidate.text, lat: ctx.candidate.lat, lng: ctx.candidate.lng });
        } else if (pick === 'ac:no') {
          ctx.candidate = null;
          out.raw({ kind: 'location_request', body: 'Escríbela de nuevo con más detalle (calle, número, colonia) o comparte tu ubicación 📍' });
          next = BotState.ADDRESS_TEXT;
        } else if (inbound.kind === 'text' && norm(inbound.text).length >= 6) {
          next = await handleAddressText(inbound.text);
        } else {
          out.buttons(`No te entendí 🤔 ¿Es correcta esta dirección?\n📍 ${ctx.candidate?.formatted ?? ''}`, [
            { id: 'ac:yes', title: 'Sí, es correcta' },
            { id: 'ac:no', title: 'No' },
          ]);
          next = BotState.ADDRESS_CONFIRM;
        }
        break;
      }

      case BotState.REFERENCES: {
        if (pick === 'ref:skip') {
          next = await afterAddressOk();
        } else if (inbound.kind === 'text' && inbound.text.trim()) {
          if (ctx.address) ctx.address = { ...ctx.address, references: inbound.text.trim().slice(0, 300) };
          next = await afterAddressOk();
        } else {
          next = askReferences(unknown());
        }
        break;
      }

      case BotState.PAYMENT: {
        if (pick?.startsWith('pay:')) {
          const m = pick.slice(4) as PaymentMethod;
          ctx.paymentMethod = m;
          ctx.cashGivenCents = null;
          if (m === 'EFECTIVO') next = await askCash();
          else {
            if (m === 'TRANSFERENCIA') {
              out.text(
                deps.transferInfo
                  ? `🏦 Datos para transferencia:\n${deps.transferInfo}\n\nCuando la hagas, envíanos tu comprobante por aquí 🙏`
                  : '🏦 Al confirmar te compartimos los datos para la transferencia.',
              );
            }
            next = await afterPayment();
          }
        } else {
          next = askPayment(unknown());
        }
        break;
      }

      case BotState.CASH_AMOUNT: {
        if (pick === 'cash:exact') {
          ctx.cashGivenCents = null;
          next = await afterPayment();
          break;
        }
        const amt = inbound.kind === 'text' ? parseAmount(inbound.text) : null;
        if (amt == null) {
          out.text('Escribe solo el monto, por ejemplo *500* 🙏');
          next = await askCash();
          break;
        }
        let total = 0;
        try {
          total = (await quoteNow()).totalCents;
        } catch {
          total = 0;
        }
        if (amt < total) {
          out.text(`El monto debe ser al menos ${money(total)} 🙏`);
          next = await askCash();
          break;
        }
        ctx.cashGivenCents = amt;
        next = await afterPayment();
        break;
      }

      case BotState.NAME: {
        const n = inbound.kind === 'text' ? inbound.text.trim().replace(/\s+/g, ' ') : '';
        if (n.length < 2 || n.length > 60 || /^\d+$/.test(n)) {
          out.text('¿A nombre de quién registramos el pedido? (escribe tu nombre)');
          next = BotState.NAME;
        } else {
          ctx.name = n;
          next = await confirm();
        }
        break;
      }

      case BotState.CONFIRM: {
        if (pick === 'cf:yes') {
          const c = await deps.customer();
          try {
            const o = await deps.createOrder({
              type: ctx.orderType ?? 'PASAR_A_RECOGER',
              lines: toLines(ctx.cart ?? []),
              address: ctx.orderType === 'DOMICILIO' && ctx.address
                ? { id: ctx.address.id ?? undefined, text: ctx.address.text, references: ctx.address.references ?? undefined, lat: ctx.address.lat ?? undefined, lng: ctx.address.lng ?? undefined }
                : undefined,
              couponCode: ctx.couponCode ?? undefined,
              name: ctx.name ?? c.name ?? 'Cliente WhatsApp',
              paymentMethod: ctx.paymentMethod ?? 'EFECTIVO',
              cashGivenCents: ctx.cashGivenCents ?? undefined,
              acceptPrivacy: !!deps.privacyNoticeUrl,
            });
            effects.orderCreated = o;
            const url = `${deps.appUrl.replace(/\/$/, '')}/pedido/${o.publicToken}`;
            out.text(
              `🎉 ¡Pedido recibido! Folio *${o.folio}*\n` +
                (o.estimatedMinutes ? `⏱️ Tiempo estimado: ${o.estimatedMinutes} min\n` : '') +
                `Total: ${money(o.totalCents)}\n\nSigue tu pedido aquí: ${url}\n\n${fill(deps.texts.goodbye, { negocio: deps.business.name, horario: '' })}`,
            );
            const token = ctx.sessionToken;
            for (const k of Object.keys(ctx)) delete (ctx as Record<string, unknown>)[k];
            if (token) ctx.sessionToken = deps.newSessionToken();
            next = BotState.IDLE;
          } catch (e) {
            const msg = (e as Error).message || 'No pudimos registrar tu pedido';
            out.text(`😔 ${msg}`);
            next = await confirm();
          }
        } else if (pick === 'cf:edit') {
          const isDel = ctx.orderType === 'DOMICILIO';
          out.buttons('¿Qué quieres cambiar?', [
            { id: 'ed:items', title: '🛒 Productos' },
            isDel ? { id: 'ed:address', title: '📍 Dirección' } : { id: 'ed:delivery', title: '🛵 A domicilio' },
            { id: 'ed:payment', title: '💳 Pago' },
          ]);
          next = BotState.EDIT;
        } else if (pick === 'cf:cancel') {
          const token = ctx.sessionToken;
          for (const k of Object.keys(ctx)) delete (ctx as Record<string, unknown>)[k];
          if (token) ctx.sessionToken = token;
          out.text('Listo, cancelé tu pedido. Escribe *hola* cuando quieras volver a empezar 👋');
          effects.cancelled = true;
          next = BotState.IDLE;
        } else if (inbound.kind === 'text' && /^cup[oó]n\s+\S+/i.test(inbound.text.trim())) {
          ctx.couponCode = inbound.text.trim().split(/\s+/)[1].toUpperCase();
          next = await confirm(`🏷️ Aplicando cupón ${ctx.couponCode}…`);
        } else {
          next = await confirm(unknown());
        }
        break;
      }

      case BotState.EDIT: {
        if (pick === 'ed:items') next = showCart();
        else if (pick === 'ed:address') next = await askAddress();
        else if (pick === 'ed:delivery') {
          ctx.orderType = 'DOMICILIO';
          next = await askAddress();
        } else if (pick === 'ed:payment') next = askPayment();
        else next = await confirm(unknown());
        break;
      }

      default:
        next = await greet();
    }
  } catch (e) {
    out.text('Uy, tuvimos un problema 😔. Escribe *hola* para empezar de nuevo o *asesor* para hablar con una persona.');
    next = BotState.IDLE;
  }

  ctx.lastOptions = out.options;
  return { state: next, context: ctx, replies: out.replies, effects };
}
