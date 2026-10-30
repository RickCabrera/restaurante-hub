import { hoursText, nextOpening, storeStatus, withinHours } from './store-hours';
import { inTimeWindow, localParts, zonedTimeToUtc } from '../common/tz';

const TZ = 'America/Mexico_City'; // UTC-6 sin horario de verano (desde 2022)
/** Instante para una hora local de CDMX */
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return zonedTimeToUtc(date, h * 60 + m, TZ);
};

const every = (open: string, close: string) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), [{ open, close }]]));
const branch = (over: Partial<Parameters<typeof storeStatus>[0]> = {}) => ({
  active: true,
  hours: every('09:00', '23:00'),
  closedDates: [] as string[],
  pausedUntil: null as Date | null,
  pauseReason: null as string | null,
  ...over,
});

describe('tz helpers', () => {
  it('convierte hora local de CDMX a UTC', () => {
    expect(at('2026-10-30', '09:00').toISOString()).toBe('2026-10-30T15:00:00.000Z');
    const lp = localParts(new Date('2026-10-30T06:16:00Z'), TZ);
    expect(lp).toMatchObject({ date: '2026-10-30', hhmm: '00:16', weekday: 5 });
  });

  it('ventanas de tiempo normales y nocturnas', () => {
    expect(inTimeWindow(600, '09:00', '18:00')).toBe(true);
    expect(inTimeWindow(1100, '09:00', '18:00')).toBe(false);
    expect(inTimeWindow(23 * 60, '22:00', '02:00')).toBe(true);
    expect(inTimeWindow(60, '22:00', '02:00')).toBe(true);
    expect(inTimeWindow(3 * 60, '22:00', '02:00')).toBe(false);
    expect(inTimeWindow(5, null, null)).toBe(true);
  });
});

describe('StoreHours', () => {
  it('abierto dentro del horario y cerrado fuera', () => {
    expect(withinHours(branch(), at('2026-10-30', '12:00'), TZ)).toBe(true);
    expect(withinHours(branch(), at('2026-10-30', '08:59'), TZ)).toBe(false);
    expect(withinHours(branch(), at('2026-10-30', '23:00'), TZ)).toBe(false);
  });

  it('horario nocturno 18:00–02:00 cruza la medianoche', () => {
    // Solo viernes (5) de 18:00 a 02:00
    const b = branch({ hours: { '5': [{ open: '18:00', close: '02:00' }] } });
    expect(withinHours(b, at('2026-10-30', '17:59'), TZ)).toBe(false);
    expect(withinHours(b, at('2026-10-30', '18:00'), TZ)).toBe(true);
    expect(withinHours(b, at('2026-10-30', '23:30'), TZ)).toBe(true);
    // sábado 01:30 sigue abierto por el turno del viernes
    expect(withinHours(b, at('2026-10-31', '01:30'), TZ)).toBe(true);
    expect(withinHours(b, at('2026-10-31', '02:00'), TZ)).toBe(false);
    // jueves 01:00 cerrado (el miércoles no abre)
    expect(withinHours(b, at('2026-10-29', '01:00'), TZ)).toBe(false);
  });

  it('00:00–00:00 significa 24 horas', () => {
    const b = branch({ hours: every('00:00', '00:00') });
    expect(withinHours(b, at('2026-10-30', '03:00'), TZ)).toBe(true);
    expect(hoursText(b.hours)).toBe('Todos los días 24 horas');
  });

  it('día festivo cerrado (y su turno nocturno no se extiende)', () => {
    const b = branch({ hours: { '5': [{ open: '18:00', close: '02:00' }] }, closedDates: ['2026-10-30'] });
    expect(withinHours(b, at('2026-10-30', '20:00'), TZ)).toBe(false);
    expect(withinHours(b, at('2026-10-31', '01:00'), TZ)).toBe(false);
    const st = storeStatus(b, at('2026-10-30', '20:00'), TZ);
    expect(st.reason).toBe('CLOSED_DATE');
    expect(st.nextOpeningText).toBe('el viernes a las 18:00');
  });

  it('pausa temporal cierra aunque esté en horario y reabre al terminar', () => {
    const now = at('2026-10-30', '13:00');
    const b = branch({ pausedUntil: new Date(now.getTime() + 30 * 60_000), pauseReason: 'Mucha demanda' });
    const st = storeStatus(b, now, TZ);
    expect(st).toMatchObject({ open: false, reason: 'PAUSED', nextOpeningText: 'hoy a las 13:30' });
    expect(st.message).toContain('Mucha demanda');
    expect(storeStatus(b, new Date(now.getTime() + 31 * 60_000), TZ).open).toBe(true);
  });

  it('pausa que termina fuera de horario → próxima apertura normal', () => {
    const now = at('2026-10-30', '22:50');
    const b = branch({ pausedUntil: at('2026-10-30', '23:30') });
    expect(nextOpening(b, now, TZ)?.toISOString()).toBe(at('2026-10-31', '09:00').toISOString());
  });

  it('próxima apertura: hoy, mañana o día de la semana', () => {
    expect(storeStatus(branch(), at('2026-10-30', '00:16'), TZ).nextOpeningText).toBe('hoy a las 09:00');
    expect(storeStatus(branch(), at('2026-10-30', '23:30'), TZ).nextOpeningText).toBe('mañana a las 09:00');
    const onlyMonday = branch({ hours: { '1': [{ open: '10:00', close: '20:00' }] } });
    expect(storeStatus(onlyMonday, at('2026-10-30', '12:00'), TZ).nextOpeningText).toBe('el lunes a las 10:00');
  });

  it('sucursal inactiva o sin horario', () => {
    expect(storeStatus(branch({ active: false }), at('2026-10-30', '12:00'), TZ)).toMatchObject({ open: false, reason: 'INACTIVE', nextOpeningAt: null });
    expect(storeStatus(branch({ hours: {} }), at('2026-10-30', '12:00'), TZ)).toMatchObject({ open: false, nextOpeningText: null });
  });

  it('texto de horario agrupa días', () => {
    const h = { ...every('09:00', '22:00'), '0': [] as { open: string; close: string }[], '6': [{ open: '10:00', close: '23:00' }] };
    expect(hoursText(h)).toBe('Lun–Vie 09:00–22:00 · Sáb 10:00–23:00 · Dom cerrado');
  });
});
