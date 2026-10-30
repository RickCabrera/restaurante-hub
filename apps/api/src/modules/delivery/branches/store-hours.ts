// Lógica pura de horario de tienda (ZON-03). Sin BD, probada en store-hours.spec.ts.
import type { OpeningHours } from '../../../db/schema';
import { DAY_LONG, DAY_SHORT, addDays, fmtMinutes, localParts, parseHHMM, weekdayOf, zonedTimeToUtc } from '../common/tz';

export interface BranchHoursInput {
  active: boolean;
  hours: OpeningHours;
  closedDates: string[];
  pausedUntil: Date | null;
  pauseReason?: string | null;
}

export type StoreClosedReason = 'OPEN' | 'PAUSED' | 'CLOSED_DATE' | 'OUTSIDE_HOURS' | 'INACTIVE';

export interface StoreStatus {
  open: boolean;
  reason: StoreClosedReason;
  /** Texto listo para mostrar al cliente */
  message: string;
  pausedUntil: string | null;
  pauseReason: string | null;
  nextOpeningAt: string | null;
  /** "hoy a las 18:00" | "mañana a las 09:00" | "el lunes a las 09:00" */
  nextOpeningText: string | null;
  /** "Todos los días 09:00–23:00" */
  hoursText: string;
}

interface Range { open: number; close: number }

function rangesOf(hours: OpeningHours, weekday: number): Range[] {
  return (hours?.[String(weekday)] ?? [])
    .map((r) => ({ open: parseHHMM(r.open), close: parseHHMM(r.close) }))
    .filter((r) => !Number.isNaN(r.open) && !Number.isNaN(r.close))
    .sort((a, b) => a.open - b.open);
}

const overnight = (r: Range) => r.close <= r.open; // 18:00–02:00 ó 00:00–00:00 (24 h)

/** ¿Dentro del horario (sin considerar pausa/activo)? */
export function withinHours(b: Pick<BranchHoursInput, 'hours' | 'closedDates'>, now: Date, tz: string): boolean {
  const lp = localParts(now, tz);
  const closed = new Set(b.closedDates ?? []);
  const m = lp.minutes;
  if (!closed.has(lp.date)) {
    for (const r of rangesOf(b.hours, lp.weekday)) {
      if (overnight(r) ? m >= r.open : m >= r.open && m < r.close) return true;
    }
  }
  const y = addDays(lp.date, -1);
  if (!closed.has(y)) {
    for (const r of rangesOf(b.hours, weekdayOf(y))) {
      if (overnight(r) && m < r.close) return true;
    }
  }
  return false;
}

/** Próximo instante en que la sucursal abre (considerando pausa). */
export function nextOpening(b: BranchHoursInput, now: Date, tz: string): Date | null {
  if (!b.active) return null;
  const paused = b.pausedUntil && b.pausedUntil > now ? b.pausedUntil : null;
  if (paused && withinHours(b, paused, tz)) return paused;
  const floor = paused ?? now;
  const today = localParts(now, tz).date;
  const closed = new Set(b.closedDates ?? []);
  for (let k = 0; k <= 8; k++) {
    const date = addDays(today, k);
    if (closed.has(date)) continue;
    for (const r of rangesOf(b.hours, weekdayOf(date))) {
      const t = zonedTimeToUtc(date, r.open, tz);
      if (t > floor) return t;
    }
  }
  return null;
}

export function describeWhen(t: Date, now: Date, tz: string): string {
  const a = localParts(now, tz);
  const b = localParts(t, tz);
  if (a.date === b.date) return `hoy a las ${b.hhmm}`;
  if (addDays(a.date, 1) === b.date) return `mañana a las ${b.hhmm}`;
  return `el ${DAY_LONG[b.weekday]} a las ${b.hhmm}`;
}

/** Horario legible agrupando días consecutivos iguales. */
export function hoursText(hours: OpeningHours): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const desc = order.map((d) => {
    const rs = rangesOf(hours, d);
    return rs.length ? rs.map((r) => (r.open === r.close ? '24 horas' : `${fmtMinutes(r.open)}–${r.close === 1440 ? '24:00' : fmtMinutes(r.close)}`)).join(' y ') : '';
  });
  if (desc.every((x) => x === '')) return 'Sin horario configurado';
  if (desc.every((x) => x === desc[0])) return `Todos los días ${desc[0]}`;
  const groups: { from: number; to: number; text: string }[] = [];
  desc.forEach((text, i) => {
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.to = i;
    else groups.push({ from: i, to: i, text });
  });
  return groups
    .map((g) => {
      const label = g.from === g.to ? DAY_SHORT[order[g.from]] : `${DAY_SHORT[order[g.from]]}–${DAY_SHORT[order[g.to]]}`;
      return `${label} ${g.text || 'cerrado'}`;
    })
    .join(' · ');
}

export function storeStatus(b: BranchHoursInput, now: Date, tz: string): StoreStatus {
  const ht = hoursText(b.hours);
  const base = {
    pausedUntil: b.pausedUntil && b.pausedUntil > now ? b.pausedUntil.toISOString() : null,
    pauseReason: b.pausedUntil && b.pausedUntil > now ? b.pauseReason ?? null : null,
    hoursText: ht,
  };
  const withNext = (reason: StoreClosedReason, prefix: string): StoreStatus => {
    const n = nextOpening(b, now, tz);
    const nt = n ? describeWhen(n, now, tz) : null;
    return { ...base, open: false, reason, nextOpeningAt: n?.toISOString() ?? null, nextOpeningText: nt, message: nt ? `${prefix}. Abrimos ${nt}.` : `${prefix}.` };
  };
  if (!b.active) return withNext('INACTIVE', 'Sucursal no disponible');
  if (b.pausedUntil && b.pausedUntil > now) {
    return withNext('PAUSED', b.pauseReason ? `Pedidos pausados: ${b.pauseReason}` : 'Pedidos pausados por el momento');
  }
  if (withinHours(b, now, tz)) {
    return { ...base, open: true, reason: 'OPEN', message: 'Abierto', nextOpeningAt: null, nextOpeningText: null };
  }
  const today = localParts(now, tz).date;
  if ((b.closedDates ?? []).includes(today)) return withNext('CLOSED_DATE', 'Hoy no abrimos');
  return withNext('OUTSIDE_HOURS', 'Estamos cerrados');
}
