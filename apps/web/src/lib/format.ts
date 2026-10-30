import { formatMoney, formatQty, UnitLabel, type UnitCode } from '@rh/shared';

export { formatMoney, formatQty };

export const money = (cents: number | null | undefined) => formatMoney(cents ?? 0);

export function qtyWithUnit(q: number, unit: UnitCode): string {
  const u = UnitLabel[unit];
  if (!u) return `${formatQty(q)}`;
  if (['KG', 'G', 'L', 'ML'].includes(unit)) return `${formatQty(q)} ${u.short}`;
  return `${formatQty(q)} ${q === 1 ? u.one : u.many}`;
}

const dtf = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
const tf = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

export const fmtDateTime = (d?: string | Date | null) => (d ? dtf.format(new Date(d)) : '—');
export const fmtTime = (d?: string | Date | null) => (d ? tf.format(new Date(d)) : '—');
export const fmtDate = (d?: string | Date | null) => (d ? df.format(new Date(d)) : '—');

/** "hace 5 min", "hace 2 h" */
export function timeAgo(d?: string | Date | null): string {
  if (!d) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 45) return 'ahora';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return fmtDate(d);
}

export function minutesSince(d?: string | Date | null): number {
  return d ? Math.floor((Date.now() - new Date(d).getTime()) / 60000) : 0;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
