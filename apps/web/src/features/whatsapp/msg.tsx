import { Bubble } from './Bubble';
import type { OutgoingWa, WaMessage } from './types';

type Loc = { lat: number; lng: number; address?: string | null; name?: string | null };

/** Ubicación de un mensaje entrante (formato normalizado del simulador o crudo de Meta). */
export function inboundLocation(m: WaMessage): Loc | null {
  const p = m.payload as Record<string, any> | null;
  if (!p) return null;
  if (p.kind === 'location' && typeof p.lat === 'number') return { lat: p.lat, lng: p.lng, address: p.address, name: p.name };
  if (p.type === 'location' && p.location) return { lat: Number(p.location.latitude), lng: Number(p.location.longitude), address: p.location.address, name: p.location.name };
  return null;
}

export function isOutgoing(p: unknown): p is OutgoingWa {
  return !!p && typeof p === 'object' && typeof (p as { kind?: unknown }).kind === 'string' &&
    ['text', 'buttons', 'list', 'location_request', 'image', 'cta_url', 'template'].includes((p as { kind: string }).kind);
}

export function MessageBubble({ m }: { m: WaMessage }) {
  if (m.direction === 'OUT') {
    return <Bubble dir="OUT" at={m.createdAt} status={m.status} out={isOutgoing(m.payload) ? m.payload : null} body={m.body} byHuman={!!m.sentByUserId} error={m.error} />;
  }
  const loc = inboundLocation(m);
  return <Bubble dir="IN" at={m.createdAt} body={m.body} location={loc} replyTo={m.kind === 'button_reply' || m.kind === 'list_reply' || m.kind === 'interactive'} />;
}

/** Separadores por día */
export function dayLabel(d: string): string {
  const date = new Date(d);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, today)) return 'Hoy';
  if (same(date, y)) return 'Ayer';
  return date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
}
