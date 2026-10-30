import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { REQUISITION_OPEN_STATUSES, RT } from '@rh/shared';
import type { ConversationType } from '@rh/shared';
import { z } from 'zod';
import { InjectDb, Db } from '../../db/db.module';
import { areas, conversations, messages, quickMessages, requisitions } from '../../db/schema';
import type { Actor } from '../../common/actor';
import { actorName, actorUserId, isManager } from '../../common/actor';
import { RealtimeService, Rooms } from '../../realtime/realtime.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../common/services/audit.service';
import { isUniqueViolation, scopedAreaIds, sideOf } from './access';
import type { Side } from './requisitions.logic';

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
export type MessageView = MessageRow;

export interface ConversationView {
  id: string;
  type: ConversationType;
  title: string;
  areaId: string | null;
  area: { id: string; name: string; color: string; icon: string } | null;
  requisitionId: string | null;
  requisition: { id: string; folio: string; status: string } | null;
  lastMessageAt: Date | null;
  lastMessage: Pick<MessageRow, 'id' | 'body' | 'imageUrl' | 'authorName' | 'authorSide' | 'createdAt'> | null;
  unread: number;
}

const TypingSchema = z.object({ conversationId: z.string().min(1), typing: z.boolean().optional() });

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly log = new Logger('Chat');

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly rt: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.rt.handle(RT.TYPING, async (_socket, actor, payload) => {
      if (!actor || actor.kind === 'agent') throw new Error('No autorizado');
      const p = TypingSchema.safeParse(payload);
      if (!p.success) throw new Error('Datos inválidos');
      const conv = await this.loadConversation(actor, p.data.conversationId);
      const side = sideOf(actor);
      const out = { conversationId: conv.id, authorName: actorName(actor), side, typing: p.data.typing ?? true };
      this.rt.emit(this.otherSideRooms(conv, side), RT.TYPING, out);
      return { ok: true };
    });
  }

  // -------------------------------------------------------------- salas
  /** Salas que reciben los eventos de una conversación (managers + área; general → todo el negocio). */
  private rooms(c: ConversationRow): string[] {
    if (c.type === 'GENERAL') return [Rooms.business(c.businessId)];
    return [Rooms.managers(c.businessId), ...(c.areaId ? [Rooms.area(c.areaId)] : [])];
  }

  private otherSideRooms(c: ConversationRow, side: Side): string[] {
    if (side === 'AREA') return [Rooms.managers(c.businessId)];
    if (c.type === 'GENERAL') return [Rooms.business(c.businessId)];
    return c.areaId ? [Rooms.area(c.areaId)] : [];
  }

  // -------------------------------------------------------------- conversaciones
  /** Crea (si faltan) la conversación GENERAL y las AREA_OWNER de las áreas activas. */
  private async ensureBaseConversations(bid: string) {
    const existing = await this.db
      .select({ type: conversations.type, areaId: conversations.areaId })
      .from(conversations)
      .where(and(eq(conversations.businessId, bid), inArray(conversations.type, ['GENERAL', 'AREA_OWNER'])));
    const areaRows = await this.db.select({ id: areas.id, name: areas.name }).from(areas).where(and(eq(areas.businessId, bid), eq(areas.active, true)));
    const values: (typeof conversations.$inferInsert)[] = [];
    if (!existing.some((e) => e.type === 'GENERAL')) values.push({ businessId: bid, type: 'GENERAL', title: 'Todos' });
    for (const a of areaRows) {
      if (!existing.some((e) => e.type === 'AREA_OWNER' && e.areaId === a.id)) values.push({ businessId: bid, type: 'AREA_OWNER', areaId: a.id, title: a.name });
    }
    if (values.length) await this.db.insert(conversations).values(values).onConflictDoNothing();
  }

  private async generalConversation(bid: string): Promise<ConversationRow> {
    await this.ensureBaseConversations(bid);
    const [c] = await this.db.select().from(conversations).where(and(eq(conversations.businessId, bid), eq(conversations.type, 'GENERAL')));
    return c;
  }

  /** Conversación de una requisición (se crea la primera vez que alguien escribe). */
  async ensureRequisitionConversation(actor: Actor, requisitionId: string): Promise<ConversationRow> {
    const [r] = await this.db
      .select({ id: requisitions.id, areaId: requisitions.areaId, folio: requisitions.folio })
      .from(requisitions)
      .where(and(eq(requisitions.id, requisitionId), eq(requisitions.businessId, actor.businessId)));
    if (!r) throw new NotFoundException('Requisición no encontrada');
    await this.assertAreaVisible(actor, r.areaId);
    const [found] = await this.db.select().from(conversations).where(eq(conversations.requisitionId, r.id));
    if (found) return found;
    try {
      const [c] = await this.db
        .insert(conversations)
        .values({ businessId: actor.businessId, type: 'REQUISITION', areaId: r.areaId, requisitionId: r.id, title: r.folio })
        .returning();
      return c;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const [c] = await this.db.select().from(conversations).where(eq(conversations.requisitionId, r.id));
      return c;
    }
  }

  private async assertAreaVisible(actor: Actor, areaId: string | null) {
    if (!areaId) return;
    const scope = await scopedAreaIds(this.db, actor);
    if (scope && !scope.includes(areaId)) throw new ForbiddenException('No tienes acceso a esta conversación');
  }

  async loadConversation(actor: Actor, id: string): Promise<ConversationRow> {
    const [c] = await this.db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.businessId, actor.businessId)));
    if (!c) throw new NotFoundException('Conversación no encontrada');
    if (c.type !== 'GENERAL') await this.assertAreaVisible(actor, c.areaId);
    return c;
  }

  async listConversations(actor: Actor): Promise<ConversationView[]> {
    const bid = actor.businessId;
    await this.ensureBaseConversations(bid);
    const side = sideOf(actor);
    const scope = await scopedAreaIds(this.db, actor);
    let rows = await this.db.query.conversations.findMany({
      where: eq(conversations.businessId, bid),
      with: { area: true, requisition: { columns: { id: true, folio: true, status: true } } },
    });
    rows = rows.filter((c) => {
      if (c.type === 'GENERAL') return true;
      if (c.area && !c.area.active) return false;
      if (scope && (!c.areaId || !scope.includes(c.areaId))) return false;
      if (c.type === 'REQUISITION') {
        // lado área: solo hilos de requisiciones abiertas; managers: hilos con mensajes
        if (side === 'AREA') return !!c.requisition && REQUISITION_OPEN_STATUSES.includes(c.requisition.status);
        return !!c.lastMessageAt;
      }
      return true;
    });
    const ids = rows.map((r) => r.id);
    const unreadMap = await this.unreadCounts(ids, side);
    const lastMap = await this.lastMessages(ids);
    const views: ConversationView[] = rows.map((c) => ({
      id: c.id,
      type: c.type,
      title: c.type === 'GENERAL' ? c.title ?? 'Todos' : c.type === 'REQUISITION' ? `${c.requisition?.folio ?? c.title ?? ''}` : c.area?.name ?? c.title ?? '',
      areaId: c.areaId,
      area: c.area ? { id: c.area.id, name: c.area.name, color: c.area.color, icon: c.area.icon } : null,
      requisitionId: c.requisitionId,
      requisition: c.requisition ?? null,
      lastMessageAt: c.lastMessageAt,
      lastMessage: lastMap.get(c.id) ?? null,
      unread: unreadMap.get(c.id) ?? 0,
    }));
    const typeOrder: Record<ConversationType, number> = { GENERAL: 0, AREA_OWNER: 1, REQUISITION: 2 };
    return views.sort((a, b) => {
      const ta = a.lastMessageAt?.getTime() ?? 0;
      const tb = b.lastMessageAt?.getTime() ?? 0;
      if (side === 'MANAGER') {
        // la dueña ve primero lo no leído y lo más reciente
        if (!!a.unread !== !!b.unread) return a.unread ? -1 : 1;
        if (ta !== tb) return tb - ta;
      }
      return typeOrder[a.type] - typeOrder[b.type] || tb - ta || a.title.localeCompare(b.title, 'es');
    });
  }

  private async unreadCounts(ids: string[], side: Side) {
    if (!ids.length) return new Map<string, number>();
    const rows = await this.db
      .select({ id: messages.conversationId, n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(inArray(messages.conversationId, ids), ne(messages.authorSide, side), sql`not (${messages.readBy} ? ${side})`))
      .groupBy(messages.conversationId);
    return new Map(rows.map((r) => [r.id, r.n]));
  }

  private async lastMessages(ids: string[]) {
    if (!ids.length) return new Map<string, ConversationView['lastMessage']>();
    const rows = await this.db
      .selectDistinctOn([messages.conversationId], {
        conversationId: messages.conversationId, id: messages.id, body: messages.body, imageUrl: messages.imageUrl,
        authorName: messages.authorName, authorSide: messages.authorSide, createdAt: messages.createdAt,
      })
      .from(messages)
      .where(inArray(messages.conversationId, ids))
      .orderBy(messages.conversationId, desc(messages.createdAt));
    return new Map(rows.map(({ conversationId, ...m }) => [conversationId, m]));
  }

  async unreadTotal(actor: Actor) {
    const list = await this.listConversations(actor);
    return { unread: list.reduce((s, c) => s + c.unread, 0) };
  }

  // -------------------------------------------------------------- mensajes
  async listMessages(actor: Actor, conversationId: string, q: { before?: string; limit: number }) {
    const c = await this.loadConversation(actor, conversationId);
    const conds = [eq(messages.conversationId, c.id)];
    if (q.before) conds.push(lt(messages.createdAt, new Date(q.before)));
    const rows = await this.db.select().from(messages).where(and(...conds)).orderBy(desc(messages.createdAt), desc(messages.id)).limit(q.limit + 1);
    const page = rows.slice(0, q.limit).reverse(); // ascendente para pintar
    return { items: page, hasMore: rows.length > q.limit, nextBefore: rows.length > q.limit ? page[0]?.createdAt.toISOString() ?? null : null };
  }

  async send(actor: Actor, dto: { conversationId: string; body?: string; imageUrl?: string; quickMessageId?: string }, opts: { broadcast?: boolean } = {}) {
    if (actor.kind === 'agent') throw new ForbiddenException('No permitido');
    const c = await this.loadConversation(actor, dto.conversationId);
    const side = sideOf(actor);
    if (c.type === 'GENERAL' && side === 'AREA') throw new ForbiddenException('Solo la dueña puede escribir en el canal general');
    let body = dto.body?.trim() || null;
    let urgentQuick = false;
    if (dto.quickMessageId) {
      const [qm] = await this.db
        .select()
        .from(quickMessages)
        .where(and(eq(quickMessages.id, dto.quickMessageId), eq(quickMessages.businessId, actor.businessId), eq(quickMessages.active, true)));
      if (!qm) throw new BadRequestException('Mensaje rápido no disponible');
      body = body ? `${qm.text} — ${body}` : qm.text;
      urgentQuick = qm.urgent;
    }
    if (!body && !dto.imageUrl) throw new BadRequestException('Escribe un mensaje');
    const now = new Date();
    const msg = await this.db.transaction(async (tx) => {
      const [m] = await tx
        .insert(messages)
        .values({
          conversationId: c.id,
          authorUserId: actorUserId(actor),
          authorDeviceId: actor.kind === 'device' ? actor.deviceId : null,
          authorName: actorName(actor),
          authorSide: side,
          body,
          imageUrl: dto.imageUrl ?? null,
          quickMessageId: dto.quickMessageId ?? null,
          isBroadcast: !!opts.broadcast,
          readBy: { [side]: now.toISOString() },
        })
        .returning();
      await tx.update(conversations).set({ lastMessageAt: m.createdAt }).where(eq(conversations.id, c.id));
      return m;
    });
    this.rt.emit(this.rooms(c), RT.MESSAGE_CREATED, { ...msg, conversation: { id: c.id, type: c.type, areaId: c.areaId, requisitionId: c.requisitionId } });

    if (side === 'AREA') {
      const area = c.areaId ? await this.db.query.areas.findFirst({ where: eq(areas.id, c.areaId), columns: { name: true } }) : null;
      const where = c.type === 'REQUISITION' ? `${area?.name ?? 'Área'} · ${c.title ?? 'Requisición'}` : area?.name ?? 'Área';
      await this.notifications
        .notifyManagers(actor.businessId, {
          type: 'MESSAGE',
          title: `${urgentQuick ? '🚨 ' : ''}${where}`,
          body: `${msg.authorName}: ${body ?? '📷 Foto'}`.slice(0, 200),
          link: c.type === 'REQUISITION' && c.requisitionId ? `/admin/requisiciones/${c.requisitionId}` : `/admin/chat/${c.id}`,
          data: { conversationId: c.id, messageId: msg.id, areaId: c.areaId },
          urgent: urgentQuick,
        })
        .catch((e) => this.log.warn(`notify: ${(e as Error).message}`));
    }
    return msg;
  }

  async sendToRequisition(actor: Actor, requisitionId: string, dto: { body?: string; imageUrl?: string; quickMessageId?: string }) {
    const c = await this.ensureRequisitionConversation(actor, requisitionId);
    return this.send(actor, { ...dto, conversationId: c.id });
  }

  async broadcast(actor: Actor, dto: { body: string; imageUrl?: string }) {
    if (!isManager(actor)) throw new ForbiddenException('Solo la dueña puede enviar avisos a todas las áreas');
    const g = await this.generalConversation(actor.businessId);
    const m = await this.send(actor, { conversationId: g.id, body: dto.body, imageUrl: dto.imageUrl }, { broadcast: true });
    await this.audit.record(actor, { businessId: actor.businessId, action: 'chat.broadcast', entity: 'message', entityId: m.id, data: { body: dto.body } });
    return m;
  }

  /** Marca como leídos los mensajes del otro lado. */
  async markRead(actor: Actor, conversationId: string) {
    const c = await this.loadConversation(actor, conversationId);
    const side = sideOf(actor);
    const at = new Date().toISOString();
    const updated = await this.db
      .update(messages)
      .set({ readBy: sql`${messages.readBy} || ${JSON.stringify({ [side]: at })}::jsonb` })
      .where(and(eq(messages.conversationId, c.id), ne(messages.authorSide, side), sql`not (${messages.readBy} ? ${side})`))
      .returning({ id: messages.id });
    if (updated.length) {
      this.rt.emit(this.rooms(c), RT.MESSAGE_READ, { conversationId: c.id, side, readAt: at, readerName: actorName(actor), messageIds: updated.map((u) => u.id) });
    }
    return { ok: true, updated: updated.length, readAt: at };
  }

  // -------------------------------------------------------------- mensajes rápidos
  listQuickMessages(actor: Actor, includeInactive: boolean) {
    const conds = [eq(quickMessages.businessId, actor.businessId)];
    if (!includeInactive) conds.push(eq(quickMessages.active, true));
    return this.db.select().from(quickMessages).where(and(...conds)).orderBy(asc(quickMessages.sortOrder), asc(quickMessages.text));
  }

  async createQuickMessage(actor: Actor, dto: { text: string; icon: string; urgent: boolean; active: boolean }) {
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${quickMessages.sortOrder}), 0)` })
      .from(quickMessages)
      .where(eq(quickMessages.businessId, actor.businessId));
    const [q] = await this.db.insert(quickMessages).values({ ...dto, businessId: actor.businessId, sortOrder: Number(max) + 1 }).returning();
    this.rt.toBusiness(actor.businessId, RT.CATALOG_CHANGED, { kind: 'quick_message', id: q.id });
    return q;
  }

  async updateQuickMessage(actor: Actor, id: string, dto: Partial<{ text: string; icon: string; urgent: boolean; active: boolean }>) {
    const [q] = await this.db.update(quickMessages).set(dto).where(and(eq(quickMessages.id, id), eq(quickMessages.businessId, actor.businessId))).returning();
    if (!q) throw new NotFoundException('Mensaje rápido no encontrado');
    this.rt.toBusiness(actor.businessId, RT.CATALOG_CHANGED, { kind: 'quick_message', id });
    return q;
  }

  async deleteQuickMessage(actor: Actor, id: string) {
    const r = await this.db.delete(quickMessages).where(and(eq(quickMessages.id, id), eq(quickMessages.businessId, actor.businessId))).returning();
    if (!r.length) throw new NotFoundException('Mensaje rápido no encontrado');
    this.rt.toBusiness(actor.businessId, RT.CATALOG_CHANGED, { kind: 'quick_message', id });
    return { ok: true };
  }

  async reorderQuickMessages(actor: Actor, ids: string[]) {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(quickMessages).set({ sortOrder: i + 1 }).where(and(eq(quickMessages.id, id), eq(quickMessages.businessId, actor.businessId)));
      }
    });
    this.rt.toBusiness(actor.businessId, RT.CATALOG_CHANGED, { kind: 'quick_message' });
    return this.listQuickMessages(actor, true);
  }
}
