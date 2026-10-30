/**
 * delivery-common/format — Helpers de dinero, tiempo y etiquetas para Delivery.
 *
 * Exporta:
 * - `pesosToCentsInput(str)` → number | null : convierte "149.50" (texto de input) a centavos.
 * - `centsToPesosInput(cents)` → string : 14950 → "149.50" (para prellenar inputs).
 * - `elapsedTone(minutes, warnAt=15, dangerAt=30)` → 'ok'|'warn'|'danger'
 * - `fmtElapsed(minutes)` → "8 min" | "1 h 05"
 * - `phoneDigits(p)`, `waLink(phone, text?)`, `telLink(phone)`, `fmtPhone(p)`
 * - `CHANNEL_LABEL`, `TYPE_LABEL`, `TYPE_SHORT`, `PAYMENT_LABEL`, `WEEKDAY_SHORT`, `WEEKDAY_LONG`
 * - `toLocalDateInput(d)` → "YYYY-MM-DD" en hora local; `startOfLocalDay(iso)`, `endOfLocalDay(iso)` → Date
 */
import type { OrderChannel, OrderType, PaymentMethod } from '@rh/shared';

export function pesosToCentsInput(v: string): number | null {
  const t = v.replace(/[$,\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function centsToPesosInput(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export function elapsedTone(minutes: number, warnAt = 15, dangerAt = 30): 'ok' | 'warn' | 'danger' {
  if (minutes >= dangerAt) return 'danger';
  if (minutes >= warnAt) return 'warn';
  return 'ok';
}

export function fmtElapsed(minutes: number): string {
  if (minutes < 60) return `${Math.max(0, minutes)} min`;
  const h = Math.floor(minutes / 60);
  return `${h} h ${String(minutes % 60).padStart(2, '0')}`;
}

export const phoneDigits = (p?: string | null) => (p ?? '').replace(/\D/g, '');

/** Enlace de WhatsApp. Si el teléfono tiene 10 dígitos se antepone 52 (México). */
export function waLink(phone?: string | null, text?: string): string {
  let d = phoneDigits(phone);
  if (d.length === 10) d = `52${d}`;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
export const telLink = (phone?: string | null) => `tel:+${phoneDigits(phone).length === 10 ? '52' : ''}${phoneDigits(phone)}`;

/** 525511112222 → "55 1111 2222" */
export function fmtPhone(p?: string | null): string {
  let d = phoneDigits(p);
  if (d.length === 12 && d.startsWith('52')) d = d.slice(2);
  if (d.length === 13 && d.startsWith('521')) d = d.slice(3);
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  return p ?? '';
}

export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  WHATSAPP: 'WhatsApp', WEB: 'Web', TELEFONO: 'Teléfono', MOSTRADOR: 'Mostrador', MESA: 'Mesa',
};
export const TYPE_LABEL: Record<OrderType, string> = { DOMICILIO: 'Domicilio', PASAR_A_RECOGER: 'Pasar a recoger' };
export const TYPE_SHORT: Record<OrderType, string> = { DOMICILIO: 'Domicilio', PASAR_A_RECOGER: 'Recoger' };
export const PAYMENT_LABEL: Record<PaymentMethod, string> = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia' };
export const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const WEEKDAY_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function toLocalDateInput(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function startOfLocalDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
/** Inicio del día siguiente (rango semiabierto). */
export function endOfLocalDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0);
}
