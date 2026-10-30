import { HttpException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { formatMoney } from '@rh/shared';
import { Db, InjectDb } from '../../db/db.module';
import { addresses, customers } from '../../db/schema';
import { loadEnv } from '../../config/env';
import { randomToken } from '../../common/utils/crypto';
import { JobsService } from '../../jobs/jobs.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SettingsService } from '../../settings/settings.service';
import { normalizePhone, OutgoingWa } from '../../whatsapp/client/whatsapp.client';
import { BranchesService } from '../delivery/branches/branches.service';
import { CoverageService } from '../delivery/zones/zones.service';
import { GeoService } from '../delivery/geo/geo.service';
import { MenuCategory, MenuService } from '../delivery/menu/menu.service';
import { PricingService } from '../delivery/promotions/promotions.service';
import { OrdersService } from '../delivery/orders/orders.service';
import { DeliveryEvents, OrderEventInfo } from '../delivery/common/delivery-events';
import { runBot } from './bot/engine';
import { BotContext, BotDeps, BotResult, BotState, CartItem, Inbound, LastOrderSummary } from './bot/types';
import { ConversationsService, WaConversation, WaSender } from './conversations.service';

export const SESSION_MS = 2 * 3600_000;

export interface InboundInput {
  from: string;
  profileName?: string | null;
  waMessageId: string;
  inbound: Inbound;
  body: string;
  kind: string;
  raw?: unknown;
  at?: Date;
}

export interface ProcessResult {
  duplicate: boolean;
  conversationId: string | null;
  state: string | null;
  humanMode: boolean;
  replies: OutgoingWa[];
}

/** Plantillas de Meta usadas fuera de la ventana de 24 h (ver docs/WHATSAPP.md). */
export const TEMPLATES = {
  ACEPTADO: 'pedido_confirmado',
  EN_CAMINO: 'pedido_en_camino',
  LISTO: 'pedido_listo',
  ENTREGADO: 'pedido_entregado',
  RECOGIDO: 'pedido_entregado',
  RECHAZADO: 'pedido_cancelado',
  CANCELADO: 'pedido_cancelado',
  LOYALTY: 'cupon_lealtad',
} as const;

/**
 * Orquesta el bot: persistencia de conversación, sesión de 2 h, traspaso a humano,
 * avisos de estado del pedido (WAB-03), pedidos web ligados al chat y cupones de lealtad.
 */
@Injectable()
export class BotService implements OnModuleInit {
  private readonly log = new Logger('WhatsappBot');
  private readonly env = loadEnv();
  /** serializa mensajes por conversación (evita carreras si llegan dos seguidos) */
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly convs: ConversationsService,
    private readonly sender: WaSender,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
    private readonly branches: BranchesService,
    private readonly menu: MenuService,
    private readonly coverage: CoverageService,
    private readonly geo: GeoService,
    private readonly pricing: PricingService,
    private readonly orders: OrdersService,
    private readonly events: DeliveryEvents,
  ) {}

  onModuleInit() {
    this.events.on('order.status', ({ order }) => this.jobs.add('wa.order_status', { order }, { attempts: 3 }));
    this.events.on('order.created', (p) => (p.sessionToken && !p.fromBot ? this.webOrderLinked(p.order, p.sessionToken) : undefined));
    this.events.on('loyalty.coupon', (p) => this.jobs.add('wa.loyalty', p, { attempts: 3 }));
    this.jobs.register<{ order: OrderEventInfo }>('wa.order_status', (d) => this.notifyStatus(d.order));
    this.jobs.register<{ businessId: string; phone: string; name: string | null; code: string; description: string }>('wa.loyalty', (d) => this.sendLoyalty(d));
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    this.locks.set(key, tail);
    void tail.then(() => {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    });
    return run;
  }

  /** Pipeline único para webhook y simulador. */
  async processInbound(businessId: string, input: InboundInput): Promise<ProcessResult> {
    const phone = normalizePhone(input.from);
    return this.withLock(`${businessId}:${phone}`, async () => {
      let conv = await this.convs.upsert(businessId, phone, input.profileName ?? null);
      const rec = await this.convs.recordInbound(conv, { waMessageId: input.waMessageId, kind: input.kind, body: input.body, payload: input.raw ?? input.inbound, at: input.at });
      if (!rec) return { duplicate: true, conversationId: conv.id, state: conv.state, humanMode: conv.humanMode, replies: [] };
      conv = rec.conversation;
      await this.convs.emit(businessId, conv, rec.message);
      void this.sender.markRead(input.waMessageId);

      if (conv.humanMode) return { duplicate: false, conversationId: conv.id, state: conv.state, humanMode: true, replies: [] };
      if (!(await this.settings.isModuleEnabled(businessId, 'delivery'))) {
        return { duplicate: false, conversationId: conv.id, state: conv.state, humanMode: false, replies: [] };
      }

      const now = new Date();
      let state = (conv.state as BotState) || BotState.IDLE;
      let context = (conv.context ?? {}) as BotContext;
      if (conv.sessionExpiresAt && conv.sessionExpiresAt < now && state !== BotState.IDLE) {
        state = BotState.IDLE;
        context = context.sessionToken ? { sessionToken: context.sessionToken } : {};
      }

      const deps = await this.buildDeps(businessId, conv, now);
      const r: BotResult = await runBot(state, context, input.inbound, deps);

      const humanMode = !!r.effects.handoff;
      conv = await this.convs.update(conv.id, {
        state: r.state,
        context: r.context as Record<string, unknown>,
        sessionExpiresAt: new Date(now.getTime() + SESSION_MS),
        ...(humanMode ? { humanMode: true, humanSince: now } : {}),
      });
      await this.sender.sendAll(businessId, conv, r.replies);
      if (humanMode) await this.notifyHandoff(businessId, conv);
      return { duplicate: false, conversationId: conv.id, state: r.state, humanMode: conv.humanMode, replies: r.replies };
    });
  }

  private async notifyHandoff(businessId: string, conv: WaConversation) {
    const v = await this.convs.view(conv);
    await this.notifications
      .notifyManagers(businessId, {
        type: 'HUMAN_HANDOFF',
        title: 'Cliente quiere hablar con una persona',
        body: `${v.displayName} (+${conv.phone}) pidió atención por WhatsApp`,
        link: `/admin/whatsapp/${conv.id}`,
        data: { conversationId: conv.id, phone: conv.phone },
        urgent: true,
      })
      .catch((e) => this.log.warn(`notify handoff: ${(e as Error).message}`));
  }

  /** Activa/desactiva el modo humano desde la bandeja. Al regresar al bot la sesión se reinicia. */
  async setHuman(businessId: string, id: string, on: boolean) {
    const conv = await this.convs.get(businessId, id);
    const c = await this.convs.update(conv.id, on
      ? { humanMode: true, humanSince: conv.humanSince ?? new Date(), state: BotState.HUMAN }
      : { humanMode: false, humanSince: null, state: BotState.IDLE, context: {} });
    await this.convs.emit(businessId, c, null);
    return this.convs.view(c);
  }

  // ------------------------------------------------------------------ dependencias reales del motor
  private async buildDeps(businessId: string, conv: WaConversation, now: Date): Promise<BotDeps> {
    const business = await this.settings.getBusiness(businessId);
    const s = await this.settings.getSettings(businessId);
    const phone = conv.phone;
    let menuCache: MenuCategory[] | null = null;
    const branchesP = this.branches.list(businessId, { activeOnly: true });
    const primary = async () => (await branchesP)[0] ?? null;

    const loadMenu = async () => {
      if (!menuCache) menuCache = await this.menu.getMenu(businessId, { channel: 'whatsapp', branchId: (await primary())?.id ?? null });
      return menuCache;
    };
    const customerRow = () => this.db.query.customers.findFirst({ where: and(eq(customers.businessId, businessId), eq(customers.phone, phone)) });

    return {
      now,
      appUrl: this.env.APP_URL,
      phone,
      business: { name: business.name },
      texts: {
        greeting: s.bot.greeting ?? '',
        closedMessage: s.bot.closedMessage ?? '',
        handoffMessage: s.bot.handoffMessage ?? '',
        goodbye: s.bot.goodbye ?? '',
      },
      transferInfo: s.transferInfo ?? null,
      privacyNoticeUrl: s.privacyNoticeUrl ?? null,
      store: async () => {
        const bs = await branchesP;
        if (!bs.length) return { open: false, message: 'Sin sucursales configuradas', hoursText: 'Sin horario configurado', nextOpeningText: null };
        const open = bs.find((b) => b.status.open);
        const st = (open ?? bs[0]).status;
        return { open: !!open, message: st.message, hoursText: st.hoursText, nextOpeningText: st.nextOpeningText };
      },
      menu: loadMenu,
      customer: async () => {
        const c = await customerRow();
        if (!c) return { id: null, name: null, addresses: [] };
        const as = await this.db.query.addresses.findMany({ where: eq(addresses.customerId, c.id), orderBy: desc(addresses.lastUsedAt), limit: 7 });
        // Cliente "nuevo" para el bot = sin pedidos todavía
        return { id: c.ordersCount > 0 || c.acceptedPrivacyAt ? c.id : null, name: c.name, addresses: as.map((a) => ({ id: a.id, label: a.label, text: a.text, references: a.references, lat: a.lat, lng: a.lng })) };
      },
      lastOrder: async () => {
        const c = await customerRow();
        if (!c) return null;
        const o = await this.orders.lastOrderOf(businessId, c.id);
        if (!o) return null;
        const menu = await loadMenu();
        const products = new Map(menu.flatMap((cat) => cat.products).map((p) => [p.id, p]));
        const items: CartItem[] = [];
        const missing: string[] = [];
        for (const it of o.items) {
          const p = products.get(it.productId);
          const mods = it.modifiers.map((m) => p?.modifierGroups.flatMap((g) => g.modifiers).find((x) => x.id === m.modifierId));
          if (!p || !p.available || mods.some((m) => !m || !m.available)) {
            missing.push(it.productName);
            continue;
          }
          items.push({ productId: p.id, name: p.name, unitPriceCents: p.priceCents, quantity: it.quantity, modifiers: mods.map((m) => ({ modifierId: m!.id, name: m!.name, priceCents: m!.priceCents })), note: it.note });
        }
        let address: LastOrderSummary['address'] = null;
        if (o.type === 'DOMICILIO' && o.addressText) {
          address = { id: '', label: null, text: o.addressText, references: o.addressRefs, lat: o.lat, lng: o.lng };
        }
        return { folio: o.folio, type: o.type, lines: [], items, missing, address };
      },
      geocode: async (text) => {
        const b = await primary();
        const r = await this.geo.geocode(text, b?.lat != null && b?.lng != null ? { lat: b.lat, lng: b.lng } : undefined);
        return r ? { lat: r.lat, lng: r.lng, formatted: r.formatted } : null;
      },
      reverse: async (lat, lng) => {
        const r = await this.geo.reverse(lat, lng);
        return r ? { formatted: r.formatted } : null;
      },
      coverage: async (lat, lng) => {
        const c = await this.coverage.resolve(businessId, lat, lng);
        return c ? { zoneName: c.zone.name, feeCents: c.feeCents, minOrderCents: c.minOrderCents, freeFromCents: c.freeFromCents, etaMinutes: c.etaMinutes } : null;
      },
      quote: (input) => this.pricing.quote(businessId, { ...input, channel: 'WHATSAPP', customerPhone: phone }, now),
      createOrder: async (input) => {
        try {
          const o = await this.orders.create(
            businessId,
            {
              channel: 'WHATSAPP',
              type: input.type,
              lines: input.lines,
              address: input.address,
              couponCode: input.couponCode,
              customer: { phone, name: input.name },
              paymentMethod: input.paymentMethod,
              cashGivenCents: input.cashGivenCents,
              acceptPrivacy: input.acceptPrivacy,
            },
            { channel: 'WHATSAPP', fromBot: true },
          );
          return { id: o.id, folio: o.folio, publicToken: o.publicToken, estimatedMinutes: o.estimatedMinutes, totalCents: o.totalCents };
        } catch (e) {
          if (e instanceof HttpException) {
            const r = e.getResponse() as { message?: string | string[] } | string;
            const msg = typeof r === 'string' ? r : Array.isArray(r.message) ? r.message[0] : r.message;
            throw new Error(msg ?? e.message);
          }
          throw e;
        }
      },
      newSessionToken: () => randomToken(12),
    };
  }

  // ------------------------------------------------------------------ pedidos web ligados al chat
  private async webOrderLinked(order: OrderEventInfo, sessionToken: string) {
    const conv = await this.convs.byContextToken(order.businessId, sessionToken);
    if (!conv) return;
    const url = `${this.env.APP_URL.replace(/\/$/, '')}/pedido/${order.publicToken}`;
    const c = await this.convs.update(conv.id, { state: BotState.IDLE, context: { sessionToken: randomToken(12) } });
    await this.sendToCustomer(order.businessId, c, {
      kind: 'text',
      body: `🎉 ¡Recibimos tu pedido web! Folio *${order.folio}*\nTotal: ${formatMoney(order.totalCents)}${order.estimatedMinutes ? `\n⏱️ Tiempo estimado: ${order.estimatedMinutes} min` : ''}\n\nSigue tu pedido aquí: ${url}`,
    }, null);
  }

  // ------------------------------------------------------------------ WAB-03 estado del pedido
  statusText(o: OrderEventInfo, businessName: string): string | null {
    const url = `${this.env.APP_URL.replace(/\/$/, '')}/pedido/${o.publicToken}`;
    const first = o.customerName.split(' ')[0];
    switch (o.status) {
      case 'ACEPTADO':
        return `✅ ${first}, ¡aceptamos tu pedido *${o.folio}*!${o.estimatedMinutes ? ` Estará ${o.type === 'DOMICILIO' ? 'contigo' : 'listo'} en aprox. ${o.estimatedMinutes} min.` : ''}\nSíguelo aquí: ${url}`;
      case 'EN_CAMINO':
        return `🛵 Tu pedido *${o.folio}* va en camino${o.driverName ? ` con ${o.driverName.split(' ')[0]}` : ''}. ¡Ya casi llega!\n${url}`;
      case 'LISTO':
        return o.type === 'PASAR_A_RECOGER' ? `🛍️ ${first}, tu pedido *${o.folio}* ya está listo para recoger en ${businessName}.` : null;
      case 'ENTREGADO':
      case 'RECOGIDO':
        return `🧡 ¡Gracias, ${first}! Tu pedido *${o.folio}* fue entregado. ¡Buen provecho!`;
      case 'RECHAZADO':
        return `😔 Lo sentimos, no pudimos aceptar tu pedido *${o.folio}*.${o.rejectReason ? ` Motivo: ${o.rejectReason}.` : ''} Escribe *hola* si quieres hacer otro pedido.`;
      case 'CANCELADO':
        return `Tu pedido *${o.folio}* fue cancelado.${o.cancelReason ? ` Motivo: ${o.cancelReason}.` : ''} Si tienes dudas, escribe *asesor*.`;
      default:
        return null;
    }
  }

  templateFor(o: OrderEventInfo, businessName: string): OutgoingWa | null {
    const url = `${this.env.APP_URL.replace(/\/$/, '')}/pedido/${o.publicToken}`;
    const first = o.customerName.split(' ')[0];
    switch (o.status) {
      case 'ACEPTADO':
        return { kind: 'template', name: TEMPLATES.ACEPTADO, params: [first, o.folio, String(o.estimatedMinutes ?? 40), url] };
      case 'EN_CAMINO':
        return { kind: 'template', name: TEMPLATES.EN_CAMINO, params: [first, o.folio, o.driverName?.split(' ')[0] ?? 'nuestro repartidor', url] };
      case 'LISTO':
        return o.type === 'PASAR_A_RECOGER' ? { kind: 'template', name: TEMPLATES.LISTO, params: [first, o.folio, businessName] } : null;
      case 'ENTREGADO':
      case 'RECOGIDO':
        return { kind: 'template', name: TEMPLATES.ENTREGADO, params: [first, o.folio, businessName] };
      case 'RECHAZADO':
        return { kind: 'template', name: TEMPLATES.RECHAZADO, params: [first, o.folio, o.rejectReason ?? 'no fue posible atenderlo'] };
      case 'CANCELADO':
        return { kind: 'template', name: TEMPLATES.CANCELADO, params: [first, o.folio, o.cancelReason ?? 'cancelado por el restaurante'] };
      default:
        return null;
    }
  }

  async notifyStatus(o: OrderEventInfo) {
    const b = await this.settings.getBusiness(o.businessId);
    const text = this.statusText(o, b.name);
    if (!text) return;
    const conv = await this.convs.findByPhone(o.businessId, o.customerPhone);
    const useText = !!conv && (this.convs.windowOpen(conv) || (this.sender.simulated && o.channel === 'WHATSAPP'));
    if (useText) {
      await this.sendToCustomer(o.businessId, conv!, { kind: 'text', body: text }, null);
      return;
    }
    if (o.channel === 'MOSTRADOR') return; // el cliente está presente
    const tpl = this.templateFor(o, b.name);
    if (!tpl) return;
    const c = conv ?? (await this.convs.upsert(o.businessId, o.customerPhone, null));
    await this.sendToCustomer(o.businessId, c, tpl, null);
  }

  private async sendLoyalty(d: { businessId: string; phone: string; name: string | null; code: string; description: string }) {
    const conv = (await this.convs.findByPhone(d.businessId, d.phone)) ?? (await this.convs.upsert(d.businessId, d.phone, null));
    const first = d.name?.split(' ')[0] ?? '';
    const msg: OutgoingWa = this.convs.windowOpen(conv) || this.sender.simulated
      ? { kind: 'text', body: `🎁 ¡Gracias por tu preferencia${first ? `, ${first}` : ''}! Te regalamos ${d.description}.\nUsa el cupón *${d.code}* en tu próximo pedido (un solo uso).` }
      : { kind: 'template', name: TEMPLATES.LOYALTY, params: [first || 'cliente', d.description, d.code] };
    await this.sendToCustomer(d.businessId, conv, msg, null);
  }

  private sendToCustomer(businessId: string, conv: WaConversation, msg: OutgoingWa, userId: string | null) {
    return this.sender.send(businessId, conv, msg, { userId });
  }

  /** Para el simulador */
  newSimMessageId() {
    return `simin_${createId()}`;
  }
}
