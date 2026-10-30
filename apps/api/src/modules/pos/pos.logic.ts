// Lógica pura del punto de venta (sin BD): totales de cuenta, pagos/cambio,
// cuadre de caja, división de cuentas y validación de modificadores.
import { applyDiscount, lineTotalCents, PaymentMethod, PaymentMethodLabel, TableStatus, TicketStatus } from '@rh/shared';

export type DiscountKind = 'PERCENT' | 'AMOUNT';

export interface LineForTotals {
  unitPriceCents: number;
  quantity: number;
  modifiers: { priceCents: number; quantity?: number }[];
  isCourtesy: boolean;
  discountType: string | null;
  discountValue: number | null;
  cancelledAt: Date | null;
}

/** Importe bruto del renglón (precio + modificadores) × cantidad. */
export function lineGrossCents(l: Pick<LineForTotals, 'unitPriceCents' | 'quantity' | 'modifiers'>): number {
  return lineTotalCents({ unitPriceCents: l.unitPriceCents, quantity: l.quantity, modifiers: l.modifiers });
}

/** Descuento y total de un renglón. Cortesía = total 0. */
export function computeLine(l: LineForTotals): { grossCents: number; discountCents: number; totalCents: number } {
  const grossCents = lineGrossCents(l);
  let discountCents = 0;
  if (l.isCourtesy) discountCents = grossCents;
  else if (l.discountType && l.discountValue) {
    discountCents = applyDiscount(grossCents, { type: l.discountType as DiscountKind, value: l.discountValue });
  }
  return { grossCents, discountCents, totalCents: grossCents - discountCents };
}

export interface TicketTotalsInput {
  lines: LineForTotals[];
  discountType: string | null;
  discountValue: number | null;
  tipPercent: number | null;
  tipFixedCents: number | null;
  /** Propinas capturadas en pagos (tarjeta, efectivo) */
  paymentTipsCents: number;
  /** Suma de amountCents de los pagos (sin propina de pago) */
  paidAmountCents: number;
}

export interface TicketTotals {
  subtotalCents: number;
  discountCents: number;
  /** propina de la regla (% o monto) */
  ruleTipCents: number;
  tipCents: number;
  totalCents: number;
  paidCents: number;
  /** saldo por cobrar (sin propinas de pago) */
  remainingCents: number;
  lines: { discountCents: number; totalCents: number }[];
}

/**
 * Totales de la cuenta:
 *  subtotal = Σ renglones vigentes (con su descuento / cortesía)
 *  descuento de cuenta = regla % o monto sobre el subtotal
 *  propina = regla (% de subtotal − descuento, o monto fijo) + propinas capturadas en pagos
 *  total = subtotal − descuento + propina
 *  pagado = Σ (monto + propina) de pagos
 */
export function computeTicketTotals(i: TicketTotalsInput): TicketTotals {
  const lines = i.lines.map((l) => (l.cancelledAt ? { discountCents: 0, totalCents: 0 } : computeLine(l)));
  const subtotalCents = lines.reduce((s, l) => s + l.totalCents, 0);
  const discountCents = i.discountType && i.discountValue
    ? applyDiscount(subtotalCents, { type: i.discountType as DiscountKind, value: i.discountValue })
    : 0;
  const net = subtotalCents - discountCents;
  const ruleTipCents = i.tipPercent != null
    ? Math.round((net * i.tipPercent) / 100)
    : Math.max(0, i.tipFixedCents ?? 0);
  const tipCents = ruleTipCents + i.paymentTipsCents;
  const totalCents = net + tipCents;
  const paidCents = i.paidAmountCents + i.paymentTipsCents;
  return {
    subtotalCents, discountCents, ruleTipCents, tipCents, totalCents, paidCents,
    remainingCents: Math.max(0, totalCents - paidCents),
    lines,
  };
}

/** Propinas sugeridas para la pre-cuenta. */
export function suggestedTips(netCents: number, percents: number[]) {
  return percents.map((percent) => ({ percent, amountCents: Math.round((netCents * percent) / 100) }));
}

export interface PaymentInput {
  method: PaymentMethod;
  amountCents: number;
  receivedCents?: number;
  reference?: string;
  tipCents: number;
}

export interface PlannedPayment {
  method: PaymentMethod;
  amountCents: number;
  tipCents: number;
  receivedCents: number | null;
  changeCents: number | null;
  reference: string | null;
}

/**
 * Normaliza pagos contra el saldo:
 *  - amountCents se aplica al saldo; tipCents es propina adicional del pago.
 *  - Efectivo: si el monto excede el saldo se ajusta al saldo; el cambio = recibido − (monto + propina).
 *  - Tarjeta / transferencia no pueden exceder el saldo.
 */
export function planPayments(remainingCents: number, inputs: PaymentInput[]):
  { ok: true; payments: PlannedPayment[]; appliedCents: number; changeCents: number } | { ok: false; error: string } {
  let left = remainingCents;
  const out: PlannedPayment[] = [];
  if (left <= 0) return { ok: false, error: 'La cuenta ya está pagada' };
  for (const p of inputs) {
    if (left <= 0) return { ok: false, error: 'Los pagos exceden el saldo de la cuenta' };
    if (p.method === 'EFECTIVO') {
      const amount = Math.min(p.amountCents, left);
      const received = p.receivedCents ?? p.amountCents + p.tipCents;
      const due = amount + p.tipCents;
      if (received < due) return { ok: false, error: 'El efectivo recibido no cubre el pago' };
      out.push({ method: p.method, amountCents: amount, tipCents: p.tipCents, receivedCents: received, changeCents: received - due, reference: p.reference ?? null });
      left -= amount;
    } else {
      if (p.amountCents > left) return { ok: false, error: `El pago con ${PaymentMethodLabel[p.method].toLowerCase()} excede el saldo` };
      out.push({ method: p.method, amountCents: p.amountCents, tipCents: p.tipCents, receivedCents: null, changeCents: null, reference: p.reference ?? null });
      left -= p.amountCents;
    }
  }
  return {
    ok: true,
    payments: out,
    appliedCents: out.reduce((s, p) => s + p.amountCents, 0),
    changeCents: out.reduce((s, p) => s + (p.changeCents ?? 0), 0),
  };
}

/** Divide un monto en N partes iguales; los centavos sobrantes van a las primeras partes. */
export function splitEqual(amountCents: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts));
  const base = Math.floor(amountCents / n);
  const rem = amountCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Estado de la mesa según sus cuentas abiertas. */
export function tableStatusFor(openStatuses: TicketStatus[]): TableStatus {
  const open = openStatuses.filter((s) => s === 'ABIERTA' || s === 'POR_COBRAR');
  if (!open.length) return 'LIBRE';
  return open.every((s) => s === 'POR_COBRAR') ? 'POR_COBRAR' : 'OCUPADA';
}

// ---------------------------------------------------------------- caja

export interface CashSummaryInput {
  openingCents: number;
  payments: { method: PaymentMethod; amountCents: number; tipCents: number }[];
  movements: { type: 'ENTRADA' | 'SALIDA'; amountCents: number; reason: string; source: string }[];
}

export function computeCashSummary(i: CashSummaryInput) {
  const methods: PaymentMethod[] = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'];
  const salesByMethod = methods.map((m) => {
    const ps = i.payments.filter((p) => p.method === m);
    return {
      method: m,
      label: PaymentMethodLabel[m],
      amountCents: ps.reduce((s, p) => s + p.amountCents, 0),
      tipsCents: ps.reduce((s, p) => s + p.tipCents, 0),
      count: ps.length,
    };
  });
  const cash = salesByMethod.find((s) => s.method === 'EFECTIVO')!;
  const entradasCents = i.movements.filter((m) => m.type === 'ENTRADA').reduce((s, m) => s + m.amountCents, 0);
  const salidasCents = i.movements.filter((m) => m.type === 'SALIDA').reduce((s, m) => s + m.amountCents, 0);
  const salesCents = salesByMethod.reduce((s, x) => s + x.amountCents, 0);
  return {
    openingCents: i.openingCents,
    salesByMethod,
    salesCents,
    /** propinas capturadas en pagos (por método) */
    paymentTipsCents: salesByMethod.reduce((s, x) => s + x.tipsCents, 0),
    entradasCents,
    salidasCents,
    /** fondo + ventas en efectivo (incl. propina en efectivo) + entradas − salidas */
    expectedCashCents: i.openingCents + cash.amountCents + cash.tipsCents + entradasCents - salidasCents,
  };
}

// ---------------------------------------------------------------- modificadores

export interface GroupForValidation {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  modifiers: { id: string; name: string; priceCents: number; available: boolean }[];
}

/** Valida selección de modificadores contra los grupos del producto. Devuelve los modificadores con precio o error. */
export function resolveModifiers(
  productName: string,
  groups: GroupForValidation[],
  selected: { modifierId: string; quantity: number }[],
): { ok: true; modifiers: { modifierId: string; name: string; groupName: string; priceCents: number; quantity: number }[] } | { ok: false; error: string } {
  const out: { modifierId: string; name: string; groupName: string; priceCents: number; quantity: number }[] = [];
  const perGroup = new Map<string, number>();
  for (const s of selected) {
    const g = groups.find((gr) => gr.modifiers.some((m) => m.id === s.modifierId));
    const m = g?.modifiers.find((x) => x.id === s.modifierId);
    if (!g || !m) return { ok: false, error: `Opción inválida para ${productName}` };
    if (!m.available) return { ok: false, error: `${m.name} no está disponible` };
    perGroup.set(g.id, (perGroup.get(g.id) ?? 0) + s.quantity);
    out.push({ modifierId: m.id, name: m.name, groupName: g.name, priceCents: m.priceCents, quantity: s.quantity });
  }
  for (const g of groups) {
    const n = perGroup.get(g.id) ?? 0;
    if (n < g.minSelect) return { ok: false, error: `Elige ${g.minSelect === 1 ? 'una opción' : `al menos ${g.minSelect} opciones`} de "${g.name}" para ${productName}` };
    if (g.maxSelect > 0 && n > g.maxSelect) return { ok: false, error: `Máximo ${g.maxSelect} en "${g.name}" para ${productName}` };
  }
  return { ok: true, modifiers: out };
}

/** ¿Requiere ADMIN? Descuentos mayores a 20 % (o montos equivalentes). */
export const DISCOUNT_LIMIT_PERCENT = 20;
export function discountNeedsAdmin(type: DiscountKind, value: number, baseCents: number): boolean {
  if (type === 'PERCENT') return value > DISCOUNT_LIMIT_PERCENT;
  return baseCents > 0 ? value * 100 > baseCents * DISCOUNT_LIMIT_PERCENT : value > 0;
}

/** Inicio del día (00:00) en la zona horaria del negocio, como Date UTC. */
export function startOfDayInTz(tz: string, at = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const [y, m, d] = parts.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return new Date(guess - tzOffsetMs(tz, new Date(guess)));
}

export function tzOffsetMs(tz: string, at: Date): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

export function hourInTz(tz: string, at: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(at));
}

/** Valida y separa los renglones a mover en una división por renglones. */
export function partitionForSplit<T extends { id: string; cancelledAt: Date | null }>(
  items: T[], lineIds: string[],
): { ok: true; moving: T[]; staying: T[] } | { ok: false; error: string } {
  const active = items.filter((i) => !i.cancelledAt);
  const want = new Set(lineIds);
  const moving = active.filter((i) => want.has(i.id));
  if (moving.length !== want.size) return { ok: false, error: 'Renglones inválidos para dividir' };
  const staying = active.filter((i) => !want.has(i.id));
  if (!staying.length) return { ok: false, error: 'Deja al menos un producto en la cuenta original' };
  return { ok: true, moving, staying };
}
