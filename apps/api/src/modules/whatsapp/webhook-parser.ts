// Parseo PURO del payload del webhook de Meta (WhatsApp Cloud API) a eventos normalizados.
import type { Inbound } from './bot/types';

export interface InboundEvent {
  type: 'message';
  phoneNumberId: string | null;
  from: string;
  profileName: string | null;
  waMessageId: string;
  timestamp: Date;
  inbound: Inbound;
  /** tipo original de Meta (text, interactive, location, image, button…) */
  metaType: string;
  /** texto legible para historial */
  body: string;
  raw: unknown;
}

export interface StatusEvent {
  type: 'status';
  phoneNumberId: string | null;
  waMessageId: string;
  status: string; // sent | delivered | read | failed
  recipient: string | null;
  error: string | null;
  timestamp: Date;
}

export type WebhookEvent = InboundEvent | StatusEvent;

export function parseMetaWebhook(body: any): WebhookEvent[] {
  const out: WebhookEvent[] = [];
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return out;
  for (const entry of body.entry) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value ?? {};
      const phoneNumberId: string | null = v.metadata?.phone_number_id ?? null;
      const contacts: any[] = v.contacts ?? [];
      for (const m of v.messages ?? []) {
        const contact = contacts.find((c) => c.wa_id === m.from) ?? contacts[0];
        const parsed = parseMessage(m);
        if (!parsed) continue;
        out.push({
          type: 'message',
          phoneNumberId,
          from: String(m.from),
          profileName: contact?.profile?.name ?? null,
          waMessageId: String(m.id),
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
          inbound: parsed.inbound,
          metaType: String(m.type),
          body: parsed.body,
          raw: m,
        });
      }
      for (const s of v.statuses ?? []) {
        out.push({
          type: 'status',
          phoneNumberId,
          waMessageId: String(s.id),
          status: String(s.status),
          recipient: s.recipient_id ?? null,
          error: s.errors?.[0] ? `${s.errors[0].code ?? ''} ${s.errors[0].title ?? s.errors[0].message ?? ''}`.trim() : null,
          timestamp: s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date(),
        });
      }
    }
  }
  return out;
}

function parseMessage(m: any): { inbound: Inbound; body: string } | null {
  switch (m?.type) {
    case 'text':
      return { inbound: { kind: 'text', text: String(m.text?.body ?? '') }, body: String(m.text?.body ?? '') };
    case 'interactive': {
      const i = m.interactive ?? {};
      if (i.type === 'button_reply') return { inbound: { kind: 'button', id: String(i.button_reply.id), title: i.button_reply.title }, body: String(i.button_reply.title ?? i.button_reply.id) };
      if (i.type === 'list_reply') return { inbound: { kind: 'list', id: String(i.list_reply.id), title: i.list_reply.title }, body: String(i.list_reply.title ?? i.list_reply.id) };
      if (i.type === 'nfm_reply') return { inbound: { kind: 'other', description: 'formulario' }, body: '[formulario]' };
      return { inbound: { kind: 'other', description: i.type }, body: `[${i.type}]` };
    }
    case 'button':
      // Botón de respuesta rápida de una plantilla
      return { inbound: { kind: 'text', text: String(m.button?.text ?? m.button?.payload ?? '') }, body: String(m.button?.text ?? '') };
    case 'location': {
      const l = m.location ?? {};
      return {
        inbound: { kind: 'location', lat: Number(l.latitude), lng: Number(l.longitude), address: l.address ?? null, name: l.name ?? null },
        body: `📍 ${[l.name, l.address].filter(Boolean).join(', ') || `${l.latitude}, ${l.longitude}`}`,
      };
    }
    case 'image':
      return { inbound: { kind: 'image', caption: m.image?.caption ?? null }, body: m.image?.caption ? `[imagen] ${m.image.caption}` : '[imagen]' };
    case 'audio':
    case 'voice':
      return { inbound: { kind: 'other', description: 'audio' }, body: '[audio]' };
    case 'document':
      return { inbound: { kind: 'other', description: 'documento' }, body: `[documento] ${m.document?.filename ?? ''}`.trim() };
    case 'sticker':
      return { inbound: { kind: 'other', description: 'sticker' }, body: '[sticker]' };
    case 'reaction':
      return null;
    case 'unsupported':
    case undefined:
      return null;
    default:
      return { inbound: { kind: 'other', description: String(m.type) }, body: `[${m.type}]` };
  }
}

/** Texto legible de un mensaje entrante normalizado (simulador). */
export function describeInbound(i: Inbound): string {
  switch (i.kind) {
    case 'text': return i.text;
    case 'button':
    case 'list': return i.title ?? i.id;
    case 'location': return `📍 ${i.address || i.name || `${i.lat}, ${i.lng}`}`;
    case 'image': return i.caption ? `[imagen] ${i.caption}` : '[imagen]';
    default: return `[${i.description ?? 'mensaje'}]`;
  }
}
