// Todo el dinero se maneja en CENTAVOS (enteros) para evitar errores de punto flotante.

export function formatMoney(cents: number, currency = 'MXN', locale = 'es-MX'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format((cents || 0) / 100);
}

export function pesosToCents(pesos: number): number {
  return Math.round(pesos * 100);
}

export interface PricedModifier {
  priceCents: number;
  quantity?: number;
}

export interface PricedLine {
  unitPriceCents: number;
  quantity: number;
  modifiers?: PricedModifier[];
  discountCents?: number;
}

export function lineTotalCents(line: PricedLine): number {
  const mods = (line.modifiers ?? []).reduce((s, m) => s + m.priceCents * (m.quantity ?? 1), 0);
  return Math.max(0, (line.unitPriceCents + mods) * line.quantity - (line.discountCents ?? 0));
}

export interface DiscountRule {
  type: 'PERCENT' | 'AMOUNT';
  value: number; // PERCENT: 0-100 ; AMOUNT: centavos
  maxCents?: number | null;
}

export function applyDiscount(baseCents: number, rule: DiscountRule | null | undefined): number {
  if (!rule) return 0;
  let d = rule.type === 'PERCENT' ? Math.round((baseCents * rule.value) / 100) : rule.value;
  if (rule.maxCents != null) d = Math.min(d, rule.maxCents);
  return Math.max(0, Math.min(d, baseCents));
}

export interface TotalsInput {
  lines: PricedLine[];
  deliveryFeeCents?: number;
  discountCents?: number;
  tipCents?: number;
}

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  tipCents: number;
  totalCents: number;
}

export function computeTotals(input: TotalsInput): Totals {
  const subtotalCents = input.lines.reduce((s, l) => s + lineTotalCents(l), 0);
  const discountCents = Math.min(input.discountCents ?? 0, subtotalCents);
  const deliveryFeeCents = input.deliveryFeeCents ?? 0;
  const tipCents = input.tipCents ?? 0;
  return {
    subtotalCents,
    discountCents,
    deliveryFeeCents,
    tipCents,
    totalCents: subtotalCents - discountCents + deliveryFeeCents + tipCents,
  };
}

/** Redondeo de cantidades de insumos (hasta 3 decimales). */
export function roundQty(q: number): number {
  return Math.round(q * 1000) / 1000;
}

export function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : String(roundQty(q)).replace(/\.?0+$/, '');
}
