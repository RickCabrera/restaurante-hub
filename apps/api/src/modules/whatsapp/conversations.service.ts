import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, lt, or, sql, SQL } from 'drizzle-orm';
import { RT } from '@rh/shared';
import { Db, InjectDb } from '../../db/db.module';
import { customers, waConversations, waMessages } from '../../db/schema';
import { RealtimeService } from '../../realtime/realtime.service';
import { describeOutgoing, normalizePhone, OutgoingWa, WhatsappClient } from '../../whatsapp/client/whatsapp.client';
import { CustomersService } from '../delivery/customers/customers.service';

export type WaConversation = typeof waConversations.$inferSelect;
export type WaMessage = typeof waMessages.$inferSelect;

export const WINDOW_MS = 24 * 3600_000;

export interface ConversationView {
  id: string;
  phone: string;
  profileName: string | null;
  customerId: string | null;
  customer: { id: string; name: string | null; ordersCount: number; lastOrderAt: Date | null } | null;
  displayName: string;
  state: string;
  humanMode: boolean;
  humanSince: Date | null;
  unreadCount: number;
  lastInboundAt: Date | null;
  lastMessageAt: Date | null;
  /** ventana de 24 h de Meta abierta (se puede responder con texto libre) */
  windowOpen: boolean;
  windowExpiresAt: string | null;
  lastMessage: { body: string | null; direction: 'IN' | 'OUT'; kind: string; createdAt: Date } | null;
  createdAt: Date;
}

@Injectable()
export class ConversationsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly customers: CustomersService,
    private readonly rt: RealtimeService,
  ) {}

  /** Crea/actualiza la conversación de un teléfono y la liga al cliente. */
  async upsert(businessId: string, phoneRaw: string, profileName?: string | null): Promise<WaConversation> {
    const phone = normalizePhone(phoneRaw);
    let conv = await this.db.query.waConversations.findFirst({ where: and(eq(waConversations.businessId, businessId), eq(waConversations.phone, phone)) });
    // El nombre de perfil de WhatsApp se guarda solo en la conversación; el nombre del cliente lo pide el bot.
    const customer = await this.customers.upsertByPhone(businessId, phone, null);
    if (!conv) {
      const [c] = await this.db
        .insert(waConversations)
        .values({ businessId, phone, profileName: profileName ?? null, customerId: customer.id })
        .onConflictDoNothing()
        .returning();
      conv = c ?? (await this.db.query.waConversations.findFirst({ where: and(eq(waConversations.businessId, businessId), eq(waConversations.phone, phone)) }))!;
    } else if ((profileName && profileName !== conv.profileName) || !conv.customerId) {
      const [c] = await this.db
        .update(waConversations)
        .set({ profileName: profileName ?? conv.profileName, customerId: conv.customerId ?? customer.id })
        .where(eq(waConversations.id, conv.id))
        .returning();
      conv = c;
    }
    return conv;
  }

  async findById(id: string) {
    return (await this.db.query.waConversations.findFirst({ where: eq(waConversations.id, id) })) ?? null;
  }

  async findByPhone(businessId: string, phone: string) {
    return (await this.db.query.waConversations.findFirst({ where: and(eq(waConversations.businessId, businessId), eq(waConversations.phone, normalizePhone(phone))) })) ?? null;
  }

  async get(businessId: string, id: string): Promise<WaConversation> {
    const c = await this.db.query.waConversations.findFirst({ where: and(eq(waConversations.id, id), eq(waConversations.businessId, businessId)) });
    if (!c) throw new NotFoundException('Conversación no encontrada');
    return c;
  }

  async update(id: string, set: Partial<typeof waConversations.$inferInsert>) {
    const [c] = await this.db.update(waConversations).set(set).where(eq(waConversations.id, id)).returning();
    return c;
  }

  windowOpen(c: Pick<WaConversation, 'lastInboundAt'>, now = new Date()) {
    return !!c.lastInboundAt && now.getTime() - c.lastInboundAt.getTime() < WINDOW_MS;
  }

  async view(c: WaConversation): Promise<ConversationView> {
    const [cust, last] = await Promise.all([
      c.customerId ? this.db.query.customers.findFirst({ where: eq(customers.id, c.customerId), columns: { id: true, name: true, ordersCount: true, lastOrderAt: true } }) : null,
      this.db.query.waMessages.findFirst({ where: eq(waMessages.conversationId, c.id), orderBy: desc(waMessages.createdAt), columns: { body: true, direction: true, kind: true, createdAt: true } }),
    ]);
    const { context: _ctx, sessionExpiresAt: _s, businessId: _b, ...rest } = c;
    return {
      ...rest,
      customer: cust ?? null,
      displayName: cust?.name || c.profileName || `+${c.phone}`,
      windowOpen: this.windowOpen(c),
      windowExpiresAt: c.lastInboundAt ? new Date(c.lastInboundAt.getTime() + WINDOW_MS).toISOString() : null,
      lastMessage: last ?? null,
    };
  }

  async list(businessId: string, q: { humanMode?: boolean; q?: string; limit?: number; offset?: number }) {
    const conds: SQL[] = [eq(waConversations.businessId, businessId)];
    if (q.humanMode != null) conds.push(eq(waConversations.humanMode, q.humanMode));
    if (q.q) {
      const digits = q.q.replace(/\D/g, '');
      const ors: SQL[] = [ilike(waConversations.profileName, `%${q.q}%`), ilike(customers.name, `%${q.q}%`)];
      if (digits.length >= 3) ors.push(ilike(waConversations.phone, `%${digits}%`));
      conds.push(or(...ors)!);
    }
    const rows = await this.db
      .select({ c: waConversations })
      .from(waConversations)
      .leftJoin(customers, eq(customers.id, waConversations.customerId))
      .where(and(...conds))
      .orderBy(desc(sql`${waConversations.unreadCount} > 0`), desc(waConversations.humanMode), sql`${waConversations.lastMessageAt} desc nulls last`)
      .limit(Math.min(q.limit ?? 50, 200))
      .offset(q.offset ?? 0);
    return Promise.all(rows.map((r) => this.view(r.c)));
  }

  async messages(businessId: string, id: string, opts: { before?: Date; limit?: number }) {
    await this.get(businessId, id);
    const rows = await this.db.query.waMessages.findMany({
      where: opts.before ? and(eq(waMessages.conversationId, id), lt(waMessages.createdAt, opts.before)) : eq(waMessages.conversationId, id),
      orderBy: desc(waMessages.createdAt),
      limit: Math.min(opts.limit ?? 50, 200),
    });
    return rows.reverse();
  }

  async markRead(businessId: string, id: string) {
    await this.get(businessId, id);
    const c = await this.update(id, { unreadCount: 0 });
    const v = await this.view(c);
    this.rt.toManagers(businessId, RT.WA_CONVERSATION, { conversation: v, message: null });
    return v;
  }

  /** Mensaje entrante con deduplicación por waMessageId. Devuelve null si ya existía. */
  async recordInbound(conv: WaConversation, input: { waMessageId: string; kind: string; body: string; payload: unknown; at?: Date }) {
    const [m] = await this.db
      .insert(waMessages)
      .values({ conversationId: conv.id, direction: 'IN', waMessageId: input.waMessageId, kind: input.kind, body: input.body, payload: input.payload as never, status: 'received' })
      .onConflictDoNothing()
      .returning();
    if (!m) return null;
    const now = input.at ?? new Date();
    const c = await this.update(conv.id, {
      lastInboundAt: now,
      lastMessageAt: now,
      unreadCount: sql`${waConversations.unreadCount} + 1` as unknown as number,
    });
    return { message: m, conversation: c };
  }

  async recordOutbound(convId: string, input: { waMessageId: string | null; msg: OutgoingWa; status: string; error?: string | null; userId?: string | null }) {
    const [m] = await this.db
      .insert(waMessages)
      .values({
        conversationId: convId,
        direction: 'OUT',
        waMessageId: input.waMessageId,
        kind: input.msg.kind,
        body: describeOutgoing(input.msg),
        payload: input.msg as never,
        status: input.status,
        error: input.error ?? null,
        sentByUserId: input.userId ?? null,
      })
      .returning();
    const c = await this.update(convId, { lastMessageAt: new Date() });
    return { message: m, conversation: c };
  }

  async updateStatus(waMessageId: string, status: string, error: string | null) {
    const [m] = await this.db
      .update(waMessages)
      .set({ status, ...(error ? { error } : {}) })
      .where(eq(waMessages.waMessageId, waMessageId))
      .returning();
    return m ?? null;
  }

  async emit(businessId: string, c: WaConversation, message: WaMessage | null) {
    this.rt.toManagers(businessId, RT.WA_CONVERSATION, { conversation: await this.view(c), message });
  }

  ensureWindow(c: WaConversation, simulated: boolean) {
    if (simulated) return;
    if (!this.windowOpen(c)) {
      throw new ConflictException('Pasaron más de 24 horas desde el último mensaje del cliente; WhatsApp solo permite responder con una plantilla aprobada.');
    }
  }

  async byContextToken(businessId: string, token: string) {
    return (
      (await this.db.query.waConversations.findFirst({
        where: and(eq(waConversations.businessId, businessId), sql`${waConversations.context}->>'sessionToken' = ${token}`),
      })) ?? null
    );
  }

  oldestFirst() {
    return asc(waMessages.createdAt);
  }
}

/** Envía mensajes por WhatsApp, los guarda en el historial y avisa a la bandeja en tiempo real. */
@Injectable()
export class WaSender {
  private readonly log = new Logger('WaSender');

  constructor(private readonly client: WhatsappClient, private readonly convs: ConversationsService) {}

  get simulated() {
    return this.client.simulated;
  }

  markRead(waMessageId: string) {
    return this.client.markRead(waMessageId).catch(() => undefined);
  }

  async send(businessId: string, conv: WaConversation, msg: OutgoingWa, opts: { userId?: string | null } = {}): Promise<WaMessage> {
    let waId: string | null = null;
    let status = 'sent';
    let error: string | null = null;
    try {
      const r = await this.client.send(businessId, conv.phone, msg);
      waId = r.id;
      status = r.simulated ? 'simulated' : 'sent';
    } catch (e) {
      status = 'failed';
      error = (e as Error).message;
      this.log.warn(`Envío a ${conv.phone} falló: ${error}`);
    }
    const { message, conversation } = await this.convs.recordOutbound(conv.id, { waMessageId: waId, msg, status, error, userId: opts.userId });
    await this.convs.emit(businessId, conversation, message);
    return message;
  }

  async sendAll(businessId: string, conv: WaConversation, msgs: OutgoingWa[]) {
    const out: WaMessage[] = [];
    for (const m of msgs) out.push(await this.send(businessId, conv, m));
    return out;
  }

  /** Envía a un teléfono (crea la conversación si no existe). */
  async sendTo(businessId: string, phone: string, msg: OutgoingWa) {
    const conv = await this.convs.upsert(businessId, phone);
    return this.send(businessId, conv, msg);
  }
}
