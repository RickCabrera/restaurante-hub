import { Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { loadEnv } from '../../config/env';
import { hmacSha256Hex, safeEqual } from '../../common/utils/crypto';
import { RealtimeService, Rooms } from '../../realtime/realtime.service';

/** Mensaje saliente normalizado (independiente de Meta). */
export type OutgoingWa =
  | { kind: 'text'; body: string; previewUrl?: boolean }
  | { kind: 'buttons'; body: string; header?: string; footer?: string; buttons: { id: string; title: string }[] } // máx 3, título ≤ 20
  | {
      kind: 'list';
      body: string;
      header?: string;
      footer?: string;
      buttonText: string; // ≤ 20
      sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]; // ≤ 10 filas en total
    }
  | { kind: 'location_request'; body: string }
  | { kind: 'image'; url: string; caption?: string }
  | { kind: 'cta_url'; body: string; buttonText: string; url: string }
  | { kind: 'template'; name: string; language?: string; params: string[] };

export interface SendResult {
  id: string;
  simulated: boolean;
}

/**
 * Cliente de bajo nivel de WhatsApp Cloud API (Meta Graph API).
 * Si WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID no están configurados funciona en MODO SIMULADOR:
 * no sale nada a internet y el mensaje se emite por Socket.IO a la sala del simulador (/dev/whatsapp).
 */
@Injectable()
export class WhatsappClient {
  private readonly log = new Logger('WhatsappClient');
  private readonly env = loadEnv();

  constructor(private readonly rt: RealtimeService) {}

  get simulated(): boolean {
    return !this.env.WHATSAPP_TOKEN || !this.env.WHATSAPP_PHONE_NUMBER_ID;
  }

  /** Valida X-Hub-Signature-256 del webhook. En modo simulador sin APP_SECRET se acepta. */
  verifySignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
    const secret = this.env.WHATSAPP_APP_SECRET;
    if (!secret) return this.simulated;
    if (!rawBody || !header?.startsWith('sha256=')) return false;
    return safeEqual(header.slice(7), hmacSha256Hex(secret, rawBody));
  }

  async send(businessId: string, to: string, msg: OutgoingWa): Promise<SendResult> {
    if (this.simulated) {
      const id = `sim_${createId()}`;
      this.rt.emit(Rooms.waSim(businessId, normalizePhone(to)), 'wa.sim.out', { id, to, msg, at: new Date().toISOString() });
      return { id, simulated: true };
    }
    const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to: normalizePhone(to), ...toMetaPayload(msg, this.env.WHATSAPP_TEMPLATE_LANG) };
    const data = await this.graph(`${this.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, body);
    return { id: data?.messages?.[0]?.id ?? createId(), simulated: false };
  }

  async markRead(waMessageId: string) {
    if (this.simulated || waMessageId.startsWith('sim_')) return;
    await this.graph(`${this.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: waMessageId,
    }).catch((e) => this.log.debug(`markRead: ${e.message}`));
  }

  private async graph(pathPart: string, body: unknown): Promise<any> {
    const url = `https://graph.facebook.com/${this.env.WHATSAPP_API_VERSION}/${pathPart}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const err = json?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`WhatsApp API: ${err}`);
    }
    return json;
  }
}

/** Deja solo dígitos. Para México, WhatsApp entrega 521XXXXXXXXXX; se normaliza a 52XXXXXXXXXX. */
export function normalizePhone(p: string): string {
  let d = (p || '').replace(/\D/g, '');
  if (d.length === 10) d = `52${d}`;
  if (d.startsWith('521') && d.length === 13) d = `52${d.slice(3)}`;
  return d;
}

const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function toMetaPayload(msg: OutgoingWa, lang: string): Record<string, unknown> {
  switch (msg.kind) {
    case 'text':
      return { type: 'text', text: { body: trim(msg.body, 4096), preview_url: !!msg.previewUrl } };
    case 'buttons':
      return {
        type: 'interactive',
        interactive: {
          type: 'button',
          ...(msg.header ? { header: { type: 'text', text: trim(msg.header, 60) } } : {}),
          body: { text: trim(msg.body, 1024) },
          ...(msg.footer ? { footer: { text: trim(msg.footer, 60) } } : {}),
          action: { buttons: msg.buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: trim(b.title, 20) } })) },
        },
      };
    case 'list':
      return {
        type: 'interactive',
        interactive: {
          type: 'list',
          ...(msg.header ? { header: { type: 'text', text: trim(msg.header, 60) } } : {}),
          body: { text: trim(msg.body, 4096) },
          ...(msg.footer ? { footer: { text: trim(msg.footer, 60) } } : {}),
          action: {
            button: trim(msg.buttonText, 20),
            sections: msg.sections.map((s) => ({
              title: trim(s.title, 24),
              rows: s.rows.map((r) => ({ id: r.id, title: trim(r.title, 24), ...(r.description ? { description: trim(r.description, 72) } : {}) })),
            })),
          },
        },
      };
    case 'location_request':
      return { type: 'interactive', interactive: { type: 'location_request_message', body: { text: msg.body }, action: { name: 'send_location' } } };
    case 'image':
      return { type: 'image', image: { link: msg.url, ...(msg.caption ? { caption: msg.caption } : {}) } };
    case 'cta_url':
      return {
        type: 'interactive',
        interactive: { type: 'cta_url', body: { text: msg.body }, action: { name: 'cta_url', parameters: { display_text: trim(msg.buttonText, 20), url: msg.url } } },
      };
    case 'template':
      return {
        type: 'template',
        template: {
          name: msg.name,
          language: { code: msg.language ?? lang },
          components: msg.params.length ? [{ type: 'body', parameters: msg.params.map((t) => ({ type: 'text', text: t })) }] : [],
        },
      };
  }
}

/** Convierte un mensaje saliente en texto plano (para historial / bandeja). */
export function describeOutgoing(msg: OutgoingWa): string {
  switch (msg.kind) {
    case 'text':
    case 'buttons':
    case 'list':
    case 'location_request':
    case 'cta_url':
      return msg.body;
    case 'image':
      return msg.caption ?? '[imagen]';
    case 'template':
      return `[plantilla ${msg.name}] ${msg.params.join(' | ')}`;
  }
}
