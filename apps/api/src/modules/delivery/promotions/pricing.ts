// Motor de cálculo de pedidos (ORD-02 / PRM-01 / PRM-02). Función PURA: no toca BD ni reloj.
// El servicio (PricingService) carga catálogo, promociones, cupón y cobertura y llama a computeQuote().
import { applyDiscount, formatMoney, lineTotalCents } from '@rh/shared';
import type { CartLineInput, OrderChannel, OrderType } from '@rh/shared';
import { inTimeWindow } from '../common/tz';

export type MenuChannel = 'web' | 'whatsapp' | 'qr' | 'pos';

export function menuChannelOf(c: OrderChannel): MenuChannel {
  switch (c) {
    case 'WEB': return 'web';
    case 'WHATSAPP': return 'whatsapp';
    case 'MESA': return 'qr';
    default: return 'pos';
  }
}

export interface CatalogModifier { id: string; name: string; priceCents: number; available: boolean }
export interface CatalogGroup {
  id: string; name: string; minSelect: number; maxSelect: number;
  modifiers: CatalogModifier[];
}
export interface CatalogProduct {
  id: string;
  name: string;
  categoryId: string;
  /** precio efectivo (con override de sucursal) */
  priceCents: number;
  /** disponible efectivo (producto activo, no agotado, categoría activa, override sucursal) */
  available: boolean;
  /** visible en el canal del pedido */
  visible: boolean;
  productionAreaId: string | null;
  groups: CatalogGroup[];
}

export interface PromotionRule {
  id: string;
  name: string;
  /** PERCENT_OFF | AMOUNT_OFF | BUY_X_GET_Y | FREE_DELIVERY */
  kind: string;
  value: number;
  buyQty: number | null;
  getQty: number | null;
  minOrderCents: number;
  productIds: string[];
  categoryIds: string[];
  weekdays: number[];
  timeFrom: string | null;
  timeTo: string | null;
  channels: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
}

export interface CouponRule {
  id: string;
  code: string;
  discountType: 'PERCENT' | 'AMOUNT';
  value: number;
  maxDiscountCents: number | null;
  minOrderCents: number;
  freeDelivery: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  usesCount: number;
  channels: string[];
  customerId: string | null;
  active: boolean;
}

export interface QuoteCoverage {
  zone: { id: string; name: string };
  feeCents: number;
  minOrderCents: number;
  freeFromCents: number | null;
  etaMinutes: number;
}

export interface QuoteBranch {
  id: string;
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  prepMinutes: number;
}

export interface QuoteContext {
  channel: OrderChannel;
  type: OrderType;
  lines: CartLineInput[];
  catalog: Map<string, CatalogProduct>;
  promotions: PromotionRule[];
  couponCode?: string | null;
  /** null = no existe el código */
  coupon?: CouponRule | null;
  /** usos del cupón por el cliente (por teléfono) */
  couponCustomerUses?: number;
  customerId?: string | null;
  hasCustomerPhone?: boolean;
  branch: QuoteBranch | null;
  /** solo DOMICILIO */
  hasLocation?: boolean;
  coverage?: QuoteCoverage | null;
  store: { open: boolean; message: string };
  now: Date;
  local: { weekday: number; minutes: number };
}

export interface QuoteLine {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  modifiers: { modifierId: string; name: string; groupName: string; priceCents: number; quantity: number }[];
  totalCents: number;
  note: string | null;
  productionAreaId: string | null;
}

export interface QuoteError { code: string; message: string; lineIndex?: number }

export interface QuoteResult {
  lines: QuoteLine[];
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  appliedPromotions: { id: string; name: string; discountCents: number }[];
  coupon: { id: string; code: string; discountCents: number; freeDelivery: boolean } | null;
  zone: { id: string; name: string; etaMinutes: number } | null;
  branchId: string | null;
  estimatedMinutes: number | null;
  warnings: string[];
  errors: QuoteError[];
  canOrder: boolean;
}

const money = (c: number) => formatMoney(c);

/** Construye renglones validando producto, disponibilidad, visibilidad y modificadores. */
export function buildLines(ctx: Pick<QuoteContext, 'lines' | 'catalog'>): { lines: QuoteLine[]; errors: QuoteError[] } {
  const out: QuoteLine[] = [];
  const errors: QuoteError[] = [];
  ctx.lines.forEach((l, i) => {
    const p = ctx.catalog.get(l.productId);
    if (!p || !p.visible) {
      errors.push({ code: 'PRODUCT_NOT_FOUND', message: 'Un producto de tu pedido ya no está en el menú', lineIndex: i });
      return;
    }
    if (!p.available) {
      errors.push({ code: 'PRODUCT_UNAVAILABLE', message: `${p.name} está agotado por hoy`, lineIndex: i });
      return;
    }
    const mods: QuoteLine['modifiers'] = [];
    let lineOk = true;
    const byGroup = new Map<string, number>();
    const seen = new Set<string>();
    for (const m of l.modifiers ?? []) {
      const g = p.groups.find((gr) => gr.modifiers.some((x) => x.id === m.modifierId));
      const mod = g?.modifiers.find((x) => x.id === m.modifierId);
      if (!g || !mod) {
        errors.push({ code: 'MODIFIER_INVALID', message: `Una opción elegida no aplica para ${p.name}`, lineIndex: i });
        lineOk = false;
        continue;
      }
      if (!mod.available) {
        errors.push({ code: 'MODIFIER_UNAVAILABLE', message: `${mod.name} (${p.name}) está agotado`, lineIndex: i });
        lineOk = false;
        continue;
      }
      const qty = m.quantity ?? 1;
      if (seen.has(mod.id)) {
        const ex = mods.find((x) => x.modifierId === mod.id)!;
        ex.quantity += qty;
      } else {
        seen.add(mod.id);
        mods.push({ modifierId: mod.id, name: mod.name, groupName: g.name, priceCents: mod.priceCents, quantity: qty });
      }
      byGroup.set(g.id, (byGroup.get(g.id) ?? 0) + qty);
    }
    for (const g of p.groups) {
      const n = byGroup.get(g.id) ?? 0;
      if (n < g.minSelect) {
        errors.push({
          code: 'MODIFIER_MIN',
          message: g.minSelect === 1 ? `Elige ${g.name.toLowerCase()} para ${p.name}` : `Elige al menos ${g.minSelect} opciones de ${g.name.toLowerCase()} para ${p.name}`,
          lineIndex: i,
        });
        lineOk = false;
      }
      if (g.maxSelect > 0 && n > g.maxSelect) {
        errors.push({ code: 'MODIFIER_MAX', message: `Máximo ${g.maxSelect} de ${g.name.toLowerCase()} para ${p.name}`, lineIndex: i });
        lineOk = false;
      }
    }
    if (!lineOk) return;
    out.push({
      productId: p.id,
      name: p.name,
      quantity: l.quantity,
      unitPriceCents: p.priceCents,
      modifiers: mods,
      totalCents: lineTotalCents({ unitPriceCents: p.priceCents, quantity: l.quantity, modifiers: mods }),
      note: l.note?.trim() || null,
      productionAreaId: p.productionAreaId,
    });
  });
  return { lines: out, errors };
}

export function promotionApplies(p: PromotionRule, channel: OrderChannel, now: Date, local: { weekday: number; minutes: number }): boolean {
  if (!p.active) return false;
  if (p.startsAt && now < p.startsAt) return false;
  if (p.endsAt && now > p.endsAt) return false;
  if (p.weekdays?.length && !p.weekdays.includes(local.weekday)) return false;
  if (!inTimeWindow(local.minutes, p.timeFrom, p.timeTo)) return false;
  if (p.channels?.length && !p.channels.includes(channel)) return false;
  return true;
}

function eligibleLines(p: PromotionRule, lines: QuoteLine[], catalog: Map<string, CatalogProduct>): QuoteLine[] {
  const hasFilter = p.productIds.length > 0 || p.categoryIds.length > 0;
  if (!hasFilter) return lines;
  return lines.filter((l) => p.productIds.includes(l.productId) || p.categoryIds.includes(catalog.get(l.productId)?.categoryId ?? ''));
}

/**
 * BUY_X_GET_Y: por cada grupo de `buyQty` piezas elegibles, `getQty` van gratis (las más baratas).
 * 2x1 → buyQty 2, getQty 1 · 3x2 → buyQty 3, getQty 1.
 */
export function buyXGetYDiscount(lines: QuoteLine[], buyQty: number, getQty: number): number {
  if (!(buyQty > 0) || !(getQty > 0) || getQty >= buyQty) return 0;
  const units: number[] = [];
  for (const l of lines) {
    const unit = Math.round(l.totalCents / l.quantity);
    for (let k = 0; k < l.quantity; k++) units.push(unit);
  }
  const groups = Math.floor(units.length / buyQty);
  if (!groups) return 0;
  units.sort((a, b) => a - b);
  return units.slice(0, groups * getQty).reduce((s, u) => s + u, 0);
}

export function computeQuote(ctx: QuoteContext): QuoteResult {
  const warnings: string[] = [];
  const { lines, errors } = buildLines(ctx);
  if (!ctx.lines.length) errors.push({ code: 'EMPTY_CART', message: 'Tu carrito está vacío' });

  const subtotalCents = lines.reduce((s, l) => s + l.totalCents, 0);

  // ---------- Sucursal / horario / tipo ----------
  if (!ctx.branch) {
    if (ctx.type === 'PASAR_A_RECOGER' || ctx.hasLocation) {
      errors.push({ code: 'NO_BRANCH', message: 'No hay una sucursal disponible para tu pedido' });
    }
  } else {
    if (ctx.type === 'DOMICILIO' && !ctx.branch.acceptsDelivery) errors.push({ code: 'DELIVERY_DISABLED', message: 'Por ahora no tenemos servicio a domicilio' });
    if (ctx.type === 'PASAR_A_RECOGER' && !ctx.branch.acceptsPickup) errors.push({ code: 'PICKUP_DISABLED', message: 'Por ahora no tenemos servicio para pasar a recoger' });
  }
  if (!ctx.store.open) errors.push({ code: 'STORE_CLOSED', message: ctx.store.message });

  // ---------- Promociones automáticas ----------
  const appliedPromotions: QuoteResult['appliedPromotions'] = [];
  let freeDelivery = false;
  let promoDiscount = 0;
  for (const p of ctx.promotions) {
    if (!promotionApplies(p, ctx.channel, ctx.now, ctx.local)) continue;
    if (subtotalCents < p.minOrderCents) continue;
    const el = eligibleLines(p, lines, ctx.catalog);
    const remaining = subtotalCents - promoDiscount;
    let d = 0;
    switch (p.kind) {
      case 'PERCENT_OFF':
        d = applyDiscount(el.reduce((s, l) => s + l.totalCents, 0), { type: 'PERCENT', value: p.value });
        break;
      case 'AMOUNT_OFF':
        d = el.length ? applyDiscount(el.reduce((s, l) => s + l.totalCents, 0), { type: 'AMOUNT', value: p.value }) : 0;
        break;
      case 'BUY_X_GET_Y':
        d = buyXGetYDiscount(el, p.buyQty ?? 0, p.getQty ?? 0);
        break;
      case 'FREE_DELIVERY':
        if (ctx.type === 'DOMICILIO' && el.length) {
          freeDelivery = true;
          appliedPromotions.push({ id: p.id, name: p.name, discountCents: 0 });
        }
        continue;
      default:
        continue;
    }
    d = Math.min(d, remaining);
    if (d > 0) {
      promoDiscount += d;
      appliedPromotions.push({ id: p.id, name: p.name, discountCents: d });
    }
  }

  // ---------- Cupón ----------
  let coupon: QuoteResult['coupon'] = null;
  let couponDiscount = 0;
  const code = ctx.couponCode?.trim();
  if (code) {
    const c = ctx.coupon;
    const err = (message: string) => errors.push({ code: 'COUPON_INVALID', message });
    if (!c || !c.active) err(`El cupón ${code.toUpperCase()} no existe o ya no está activo`);
    else if (c.startsAt && ctx.now < c.startsAt) err(`El cupón ${c.code} aún no está vigente`);
    else if (c.endsAt && ctx.now > c.endsAt) err(`El cupón ${c.code} ya venció`);
    else if (c.maxUses != null && c.usesCount >= c.maxUses) err(`El cupón ${c.code} ya se agotó`);
    else if (c.channels.length && !c.channels.includes(ctx.channel)) err(`El cupón ${c.code} no aplica en este canal`);
    else if (c.customerId && !ctx.hasCustomerPhone) err(`Ingresa tu teléfono para usar el cupón ${c.code}`);
    else if (c.customerId && c.customerId !== ctx.customerId) err(`El cupón ${c.code} es personal y no corresponde a este teléfono`);
    else if (c.maxUsesPerCustomer != null && (ctx.couponCustomerUses ?? 0) >= c.maxUsesPerCustomer) err(`Ya usaste el cupón ${c.code}`);
    else if (subtotalCents < c.minOrderCents) err(`El cupón ${c.code} aplica en compras desde ${money(c.minOrderCents)}`);
    else {
      const base = subtotalCents - promoDiscount;
      couponDiscount = c.value > 0 ? applyDiscount(base, { type: c.discountType, value: c.value, maxCents: c.maxDiscountCents }) : 0;
      if (c.freeDelivery) {
        if (ctx.type === 'DOMICILIO') freeDelivery = true;
        else if (couponDiscount === 0) warnings.push(`El cupón ${c.code} es de envío gratis y tu pedido es para recoger`);
      }
      coupon = { id: c.id, code: c.code, discountCents: couponDiscount, freeDelivery: c.freeDelivery };
    }
  }

  // ---------- Envío ----------
  let deliveryFeeCents = 0;
  let zone: QuoteResult['zone'] = null;
  let estimatedMinutes: number | null = ctx.branch?.prepMinutes ?? null;
  if (ctx.type === 'DOMICILIO') {
    if (!ctx.hasLocation) {
      errors.push({ code: 'ADDRESS_REQUIRED', message: 'Indica tu dirección o ubicación para calcular el envío' });
    } else if (!ctx.coverage) {
      errors.push({ code: 'OUT_OF_ZONE', message: 'Lo sentimos, tu ubicación está fuera de nuestra zona de reparto' });
    } else {
      const cv = ctx.coverage;
      zone = { id: cv.zone.id, name: cv.zone.name, etaMinutes: cv.etaMinutes };
      estimatedMinutes = cv.etaMinutes;
      const freeByAmount = cv.freeFromCents != null && subtotalCents >= cv.freeFromCents;
      deliveryFeeCents = freeDelivery || freeByAmount ? 0 : cv.feeCents;
      if (subtotalCents < cv.minOrderCents) {
        errors.push({ code: 'MIN_ORDER', message: `El pedido mínimo para tu zona es de ${money(cv.minOrderCents)}` });
      } else if (cv.freeFromCents != null && !freeByAmount && !freeDelivery && cv.feeCents > 0) {
        warnings.push(`Agrega ${money(cv.freeFromCents - subtotalCents)} más y tu envío es gratis`);
      }
    }
  }

  const discountCents = Math.min(subtotalCents, promoDiscount + couponDiscount);
  const totalCents = subtotalCents - discountCents + deliveryFeeCents;
  return {
    lines,
    subtotalCents,
    discountCents,
    deliveryFeeCents,
    totalCents,
    appliedPromotions,
    coupon,
    zone,
    branchId: ctx.branch?.id ?? null,
    estimatedMinutes,
    warnings,
    errors,
    canOrder: errors.length === 0 && lines.length > 0,
  };
}
