// Utilidades de zona horaria sin dependencias (Intl). Todas las reglas de horario
// se evalúan en la zona horaria del negocio (Business.timezone).

export interface LocalParts {
  /** YYYY-MM-DD */
  date: string;
  /** 0 = domingo ... 6 = sábado */
  weekday: number;
  /** HH:MM */
  hhmm: string;
  /** minutos desde medianoche */
  minutes: number;
  hour: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function localParts(d: Date, tz: string): LocalParts {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(d)) p[x.type] = x.value;
  const hour = Number(p.hour) % 24;
  const minute = Number(p.minute);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    weekday: WD.indexOf(p.weekday),
    hhmm: `${pad(hour)}:${pad(minute)}`,
    minutes: hour * 60 + minute,
    hour,
  };
}

/** Minutos de diferencia local − UTC en ese instante (p.ej. CDMX = -360). */
export function tzOffsetMinutes(d: Date, tz: string): number {
  const lp = localParts(d, tz);
  const [y, m, day] = lp.date.split('-').map(Number);
  const asUtc = Date.UTC(y, m - 1, day, lp.hour, lp.minutes % 60);
  const truncated = Math.floor(d.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - truncated) / 60_000);
}

/** Convierte fecha local (YYYY-MM-DD) + minutos locales a instante UTC. */
export function zonedTimeToUtc(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0) + minutes * 60_000;
  const off1 = tzOffsetMinutes(new Date(guess), tz);
  let t = guess - off1 * 60_000;
  const off2 = tzOffsetMinutes(new Date(t), tz);
  if (off2 !== off1) t = guess - off2 * 60_000;
  return new Date(t);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "HH:MM" → minutos. "24:00" = 1440. Inválido → NaN. */
export function parseHHMM(s: string | null | undefined): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return NaN;
  return h * 60 + mi;
}

export const fmtMinutes = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

/** ¿minutos dentro de la ventana [from, to)? Soporta ventanas nocturnas (22:00–02:00). */
export function inTimeWindow(minutes: number, from?: string | null, to?: string | null): boolean {
  if (!from && !to) return true;
  const f = from ? parseHHMM(from) : 0;
  const t = to ? parseHHMM(to) : 1440;
  if (Number.isNaN(f) || Number.isNaN(t)) return true;
  if (f === t) return true;
  return f < t ? minutes >= f && minutes < t : minutes >= f || minutes < t;
}

export const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const DAY_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
