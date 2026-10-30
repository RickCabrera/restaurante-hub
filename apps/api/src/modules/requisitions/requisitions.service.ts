import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, ne, sql, SQL } from 'drizzle-orm';
import {
  formatQty, REQUISITION_OPEN_STATUSES, RequisitionStatus, RequisitionStatusLabel, RT,
} from '@rh/shared';
import type { Priority, UnitCode } from '@rh/shared';
import { InjectDb, Db, DbOrTx } from '../../db/db.module';
import {
  areas, requisitionItems, requisitions, requisitionTemplates, supplies, supplyAreas, suppliers, users,
} from '../../db/schema';
import type { Actor } from '../../common/actor';
import { actorName, actorUserId, isManager } from '../../common/actor';
import { AuditService } from '../../common/services/audit.service';
import { RealtimeService, Rooms } from '../../realtime/realtime.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SettingsService } from '../../settings/settings.service';
import { JobsService } from '../../jobs/jobs.service';
import { assertAreaAccess, deviceAreaId, isUniqueViolation, scopedAreaIds, sideOf } from './access';
import {
  aggregateShoppingList, computeFulfill, computeReceive, computeReviewOutcome, decodeCursor, encodeCursor,
  isLateForWindow, localMidnightUtc, normalizeIncomingItems, planMerge, ShoppingGroup, ShoppingRow, transitionError,
  validateItemsAgainstCatalog, windowClosingInfo,
} from './requisitions.logic';
import type { ItemValidationSupply } from './requisitions.logic';
import type { CreateRequisitionBodyDto, FulfillDto, ReceiveDto, ReqListQueryDto, ReviewDto } from './dto';

type ReqRow = typeof requisitions.$inferSelect;

export interface RequisitionItemView {
  id: string;
  supplyId: string;
  supplyName: string;
  unit: UnitCode;
  icon: string | null;
  imageUrl: string | null;
  requestedQty: number;
  approvedQty: number | null;
  fulfilledQty: number | null;
  receivedQty: number | null;
  rejected: boolean;
  purchased: boolean;
  note: string | null;
  reviewNote: string | null;
}

export type RequisitionView = Omit<ReqRow, 'mergedRequestIds'> & {
  area: { id: string; name: string; color: string; icon: string };
  items: RequisitionItemView[];
  itemCount: number;
  conversationId: string | null;
};

export const ESCALATE_JOB = 'requisition.escalate';
const ACTIVE_FOR_SHOPPING: RequisitionStatus[] = ['APROBADA', 'APROBADA_PARCIAL', 'EN_COMPRA'];

@Injectable()
export class RequisitionsService implements OnModuleInit {
  private readonly log = new Logger('Requisitions');
  /** avisos de cierre de ventana ya enviados hoy: `${areaId}|${fecha}` */
  private readonly windowNotified = new Set<string>();

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: AuditService,
    private readonly rt: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.register<{ requisitionId: string }>(ESCALATE_JOB, (d) => this.escalate(d.requisitionId));
  }

  // ================================================================ lectura
  async loadViews(db: DbOrTx, businessId: string, ids: string[]): Promise<RequisitionView[]> {
    if (!ids.length) return [];
    const rows = await db.query.requisitions.findMany({
      where: and(eq(requisitions.businessId, businessId), inArray(requisitions.id, ids)),
      with: {
        area: { columns: { id: true, name: true, color: true, icon: true } },
        items: { with: { supply: { columns: { icon: true, imageUrl: true } } }, orderBy: [asc(requisitionItems.supplyName)] },
        conversation: { columns: { id: true } },
      },
    });
    const byId = new Map(
      rows.map((r) => {
        const { mergedRequestIds: _m, items, conversation, area, ...rest } = r;
        const view: RequisitionView = {
          ...rest,
          area,
          conversationId: conversation?.id ?? null,
          itemCount: items.length,
          items: items.map(({ supply, requisitionId: _r, ...it }) => ({ ...it, icon: supply?.icon ?? null, imageUrl: supply?.imageUrl ?? null })),
        };
        return [r.id, view] as const;
      }),
    );
    return ids.map((id) => byId.get(id)).filter((v): v is RequisitionView => !!v);
  }

  async loadView(db: DbOrTx, businessId: string, id: string): Promise<RequisitionView> {
    const [v] = await this.loadViews(db, businessId, [id]);
    if (!v) throw new NotFoundException('Requisición no encontrada');
    return v;
  }

  async get(actor: Actor, id: string) {
    const v = await this.loadView(this.db, actor.businessId, id);
    await assertAreaAccess(this.db, actor, v.areaId);
    return v;
  }

  async list(actor: Actor, q: ReqListQueryDto) {
    const conds: SQL[] = [eq(requisitions.businessId, actor.businessId)];
    const scope = await scopedAreaIds(this.db, actor);
    if (scope) {
      if (q.areaId && !scope.includes(q.areaId)) throw new ForbiddenException('No tienes acceso a esta área');
      conds.push(scope.length ? inArray(requisitions.areaId, q.areaId ? [q.areaId] : scope) : sql`false`);
    } else if (q.areaId) conds.push(eq(requisitions.areaId, q.areaId));
    let statuses: RequisitionStatus[] | undefined;
    if (q.status?.length) {
      const bad = q.status.find((s) => !(s in RequisitionStatusLabel));
      if (bad) throw new BadRequestException(`Estado inválido: ${bad}`);
      statuses = q.status as RequisitionStatus[];
    }
    if (q.open) statuses = statuses ? statuses.filter((s) => REQUISITION_OPEN_STATUSES.includes(s)) : REQUISITION_OPEN_STATUSES;
    if (statuses) conds.push(statuses.length ? inArray(requisitions.status, statuses) : sql`false`);
    if (q.priority) conds.push(eq(requisitions.priority, q.priority));
    if (q.late !== undefined) conds.push(eq(requisitions.isLate, q.late));
    if (q.from || q.to) {
      const tz = (await this.settings.getBusiness(actor.businessId)).timezone;
      if (q.from) conds.push(gte(requisitions.createdAt, parseBoundary(q.from, tz, false)));
      if (q.to) conds.push(lt(requisitions.createdAt, parseBoundary(q.to, tz, true)));
    }
    if (q.q) conds.push(ilike(requisitions.folio, `%${q.q.trim()}%`));
    if (q.supplyId) {
      conds.push(inArray(requisitions.id, this.db.select({ id: requisitionItems.requisitionId }).from(requisitionItems).where(eq(requisitionItems.supplyId, q.supplyId))));
    }
    const cur = decodeCursor(q.cursor);
    if (q.cursor && !cur) throw new BadRequestException('Cursor inválido');
    const createdMs = sql`date_trunc('milliseconds', ${requisitions.createdAt})`;
    if (cur) conds.push(sql`(${createdMs}, ${requisitions.id}) < (${cur.createdAt.toISOString()}::timestamptz, ${cur.id})`);
    const rows = await this.db
      .select({ id: requisitions.id, createdAt: requisitions.createdAt })
      .from(requisitions)
      .where(and(...conds))
      .orderBy(desc(createdMs), desc(requisitions.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const items = await this.loadViews(this.db, actor.businessId, page.map((r) => r.id));
    const last = page[page.length - 1];
    return { items, nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null };
  }

  /** Tablero de la dueña: pendientes por área y estado. */
  async pendingStats(actor: Actor) {
    const scope = await scopedAreaIds(this.db, actor);
    const conds: SQL[] = [eq(requisitions.businessId, actor.businessId), inArray(requisitions.status, REQUISITION_OPEN_STATUSES)];
    if (scope) conds.push(scope.length ? inArray(requisitions.areaId, scope) : sql`false`);
    const rows = await this.db
      .select({
        areaId: requisitions.areaId,
        status: requisitions.status,
        n: sql<number>`count(*)::int`,
        urgent: sql<number>`count(*) filter (where ${requisitions.priority} = 'URGENTE')::int`,
        oldest: sql<string>`min(${requisitions.createdAt})`,
      })
      .from(requisitions)
      .where(and(...conds))
      .groupBy(requisitions.areaId, requisitions.status);
    const areaRows = await this.db
      .select({ id: areas.id, name: areas.name, color: areas.color, icon: areas.icon, sortOrder: areas.sortOrder })
      .from(areas)
      .where(and(eq(areas.businessId, actor.businessId), eq(areas.active, true)))
      .orderBy(asc(areas.sortOrder));
    const empty = () => Object.fromEntries(REQUISITION_OPEN_STATUSES.map((s) => [s, 0])) as Record<RequisitionStatus, number>;
    const totals = { byStatus: empty(), total: 0, urgent: 0, toReview: 0 };
    const byArea = areaRows
      .filter((a) => !scope || scope.includes(a.id))
      .map((a) => {
        const mine = rows.filter((r) => r.areaId === a.id);
        const counts = empty();
        for (const r of mine) counts[r.status] = r.n;
        const total = mine.reduce((s, r) => s + r.n, 0);
        const urgent = mine.reduce((s, r) => s + r.urgent, 0);
        const toReview = counts.ENVIADA + counts.VISTA;
        const oldestToReview = mine.filter((r) => r.status === 'ENVIADA' || r.status === 'VISTA').map((r) => r.oldest).sort()[0] ?? null;
        for (const s of REQUISITION_OPEN_STATUSES) totals.byStatus[s] += counts[s];
        totals.total += total;
        totals.urgent += urgent;
        totals.toReview += toReview;
        return { area: { id: a.id, name: a.name, color: a.color, icon: a.icon }, counts, total, urgent, toReview, oldestToReview: oldestToReview ? new Date(oldestToReview).toISOString() : null };
      });
    return { byArea, totals };
  }

  // ================================================================ creación
  async create(actor: Actor, dto: CreateRequisitionBodyDto): Promise<{ requisition: RequisitionView; created: boolean; merged: boolean }> {
    const bid = actor.businessId;
    // --- área
    let areaId: string;
    const devArea = deviceAreaId(actor);
    if (actor.kind === 'device') {
      if (!devArea) throw new ForbiddenException('Esta tablet no está ligada a un área');
      if (dto.areaId && dto.areaId !== devArea) throw new ForbiddenException('Solo puedes pedir para tu área');
      areaId = devArea;
    } else {
      if (!dto.areaId) throw new BadRequestException('Selecciona el área');
      areaId = dto.areaId;
      await assertAreaAccess(this.db, actor, areaId);
    }

    // --- idempotencia (reintentos offline)
    const existing = await this.findByClientRequestId(bid, dto.clientRequestId);
    if (existing) return { requisition: existing, created: false, merged: false };

    const area = await this.db.query.areas.findFirst({ where: and(eq(areas.id, areaId), eq(areas.businessId, bid)) });
    if (!area || !area.active) throw new BadRequestException('Área inválida');
    if (!area.canRequisition) throw new BadRequestException(`El área ${area.name} no tiene permitido hacer requisiciones`);

    // --- quién pide
    const s = await this.settings.getSettings(bid);
    const who = await this.resolveRequester(actor, areaId, dto.userId);
    if (s.requirePin && actor.kind === 'device' && !who.userId) throw new BadRequestException('Identifícate con tu PIN para enviar el pedido');

    // --- renglones
    const items = normalizeIncomingItems(dto.items);
    const supplyIds = items.map((i) => i.supplyId);
    const supplyRows = await this.db
      .select({
        id: supplies.id, name: supplies.name, unit: supplies.unit, active: supplies.active, maxPerOrder: supplies.maxPerOrder,
        autoApprove: supplies.autoApprove, inArea: sql<boolean>`${supplyAreas.areaId} is not null`,
      })
      .from(supplies)
      .leftJoin(supplyAreas, and(eq(supplyAreas.supplyId, supplies.id), eq(supplyAreas.areaId, areaId)))
      .where(and(eq(supplies.businessId, bid), inArray(supplies.id, supplyIds)));
    const supplyMap = new Map<string, ItemValidationSupply & { unit: UnitCode; autoApprove: boolean }>(supplyRows.map((r) => [r.id, r]));
    const err = validateItemsAgainstCatalog(items, supplyMap);
    if (err) throw new BadRequestException(err);

    const business = await this.settings.getBusiness(bid);
    const now = new Date();
    const isLate = isLateForWindow(area.orderWindow, now, business.timezone);
    const allAuto = items.every((i) => supplyMap.get(i.supplyId)!.autoApprove);
    const neededFor = dto.neededFor ? new Date(dto.neededFor) : null;
    if (neededFor && Number.isNaN(neededFor.getTime())) throw new BadRequestException('Fecha requerida inválida');

    let result: { id: string; merged: boolean; addedCount: number; priority: Priority };
    try {
      result = await this.db.transaction(async (tx) => {
        // --- agrupación con una requisición ENVIADA no vista reciente del área
        if (s.groupWindowMinutes > 0 && !allAuto) {
          const since = new Date(now.getTime() - s.groupWindowMinutes * 60_000);
          const [target] = await tx
            .select()
            .from(requisitions)
            .where(and(
              eq(requisitions.businessId, bid), eq(requisitions.areaId, areaId), eq(requisitions.status, 'ENVIADA'),
              isNull(requisitions.seenAt), gte(requisitions.createdAt, since),
            ))
            .orderBy(desc(requisitions.createdAt))
            .limit(1)
            .for('update');
          if (target) {
            const current = await tx
              .select({ id: requisitionItems.id, supplyId: requisitionItems.supplyId, requestedQty: requisitionItems.requestedQty, note: requisitionItems.note })
              .from(requisitionItems)
              .where(eq(requisitionItems.requisitionId, target.id));
            const plan = planMerge(current, items);
            for (const u of plan.updates) {
              await tx.update(requisitionItems).set({ requestedQty: u.requestedQty, note: u.note }).where(eq(requisitionItems.id, u.id));
            }
            if (plan.inserts.length) {
              await tx.insert(requisitionItems).values(plan.inserts.map((i) => {
                const sp = supplyMap.get(i.supplyId)!;
                return { requisitionId: target.id, supplyId: i.supplyId, supplyName: sp.name, unit: sp.unit, requestedQty: i.quantity, note: i.note ?? null };
              }));
            }
            const priority: Priority = dto.priority === 'URGENTE' ? 'URGENTE' : target.priority;
            await tx
              .update(requisitions)
              .set({
                mergedRequestIds: [...target.mergedRequestIds, dto.clientRequestId],
                priority,
                note: joinText(target.note, dto.note),
                isLate: target.isLate || isLate,
                neededFor: target.neededFor ?? neededFor,
              })
              .where(eq(requisitions.id, target.id));
            await this.audit.record(actor, { businessId: bid, action: 'requisition.merge', entity: 'requisition', entityId: target.id, data: { clientRequestId: dto.clientRequestId, items } }, tx);
            return { id: target.id, merged: true, addedCount: items.length, priority };
          }
        }

        const folio = await this.settings.nextFolio(tx, bid, 'REQ');
        const status: RequisitionStatus = allAuto ? 'APROBADA' : 'ENVIADA';
        const [req] = await tx
          .insert(requisitions)
          .values({
            businessId: bid, folio, areaId, deviceId: actor.kind === 'device' ? actor.deviceId : null,
            createdById: who.userId, createdByName: who.name, clientRequestId: dto.clientRequestId, priority: dto.priority,
            status, note: dto.note?.trim() || null, neededFor, isLate,
            ...(allAuto ? { reviewedAt: now, reviewedById: 'SYSTEM', reviewNote: 'Aprobada automáticamente' } : {}),
          })
          .returning();
        await tx.insert(requisitionItems).values(items.map((i) => {
          const sp = supplyMap.get(i.supplyId)!;
          return {
            requisitionId: req.id, supplyId: i.supplyId, supplyName: sp.name, unit: sp.unit, requestedQty: i.quantity, note: i.note ?? null,
            ...(allAuto ? { approvedQty: i.quantity } : {}),
          };
        }));
        await this.audit.record(actor, { businessId: bid, action: 'requisition.create', entity: 'requisition', entityId: req.id, data: { folio, items: items.length, priority: dto.priority, autoApproved: allAuto } }, tx);
        return { id: req.id, merged: false, addedCount: items.length, priority: dto.priority };
      });
    } catch (e) {
      // carrera con el mismo clientRequestId (dos reintentos simultáneos)
      if (isUniqueViolation(e)) {
        const again = await this.findByClientRequestId(bid, dto.clientRequestId);
        if (again) return { requisition: again, created: false, merged: false };
      }
      throw e;
    }

    const view = await this.loadView(this.db, bid, result.id);
    this.emit(view, result.merged ? RT.REQUISITION_UPDATED : RT.REQUISITION_CREATED);
    await this.notifyCreated(view, result.merged, result.addedCount).catch((e) => this.log.warn(`notify: ${(e as Error).message}`));
    if (result.priority === 'URGENTE' && view.status === 'ENVIADA') {
      await this.jobs
        .add(ESCALATE_JOB, { requisitionId: view.id }, { delayMs: s.urgentEscalationMinutes * 60_000, jobId: `escalate-${view.id}`, attempts: 1 })
        .catch((e) => this.log.warn(`No se pudo programar escalamiento: ${(e as Error).message}`));
    }
    return { requisition: view, created: !result.merged, merged: result.merged };
  }

  private async findByClientRequestId(bid: string, crid: string): Promise<RequisitionView | null> {
    const [row] = await this.db
      .select({ id: requisitions.id })
      .from(requisitions)
      .where(and(
        eq(requisitions.businessId, bid),
        sql`(${requisitions.clientRequestId} = ${crid} or ${requisitions.mergedRequestIds} @> ${JSON.stringify([crid])}::jsonb)`,
      ))
      .limit(1);
    return row ? this.loadView(this.db, bid, row.id) : null;
  }

  private async resolveRequester(actor: Actor, areaId: string, bodyUserId?: string): Promise<{ userId: string | null; name: string }> {
    if (actor.kind === 'device' && actor.staff) return { userId: actor.staff.userId, name: actor.staff.name };
    if (bodyUserId) {
      const u = await this.db.query.users.findFirst({
        where: and(eq(users.id, bodyUserId), eq(users.businessId, actor.businessId), eq(users.active, true)),
        with: { areas: true },
      });
      if (!u) throw new BadRequestException('La persona que pide no existe');
      const mgr = u.role === 'OWNER' || u.role === 'ADMIN';
      if (!mgr && !u.areas.some((a) => a.areaId === areaId)) throw new BadRequestException(`${u.name} no pertenece a esta área`);
      return { userId: u.id, name: u.name };
    }
    const uid = actorUserId(actor);
    return { userId: uid, name: actor.kind === 'device' ? actor.name : actorName(actor) };
  }

  private async notifyCreated(v: RequisitionView, merged: boolean, added: number) {
    const urgent = v.priority === 'URGENTE';
    const parts = [`${v.itemCount} ${v.itemCount === 1 ? 'insumo' : 'insumos'}`];
    if (urgent) parts.push('Urgente');
    if (v.isLate) parts.push('Fuera de horario');
    if (v.status === 'APROBADA') parts.push('Aprobada automáticamente');
    if (v.createdByName) parts.push(v.createdByName);
    const title = merged
      ? `Se agregaron ${added} ${added === 1 ? 'insumo' : 'insumos'} a ${v.folio} · ${v.area.name}`
      : `${urgent ? 'Requisición URGENTE' : 'Nueva requisición'} ${v.folio} · ${v.area.name}`;
    await this.notifications.notifyManagers(v.businessId, {
      type: merged ? 'REQUISITION_UPDATED' : urgent ? 'REQUISITION_URGENT' : 'REQUISITION_NEW',
      title,
      body: parts.join(' · '),
      link: `/admin/requisiciones/${v.id}`,
      data: { requisitionId: v.id, folio: v.folio, areaId: v.areaId },
      urgent,
    });
  }

  /** NOT-04: urgente sin ver tras N minutos → re-notifica a dueña y administradores. */
  async escalate(id: string) {
    const r = await this.db.query.requisitions.findFirst({ where: eq(requisitions.id, id), with: { area: true, items: { columns: { id: true } } } });
    if (!r || r.status !== 'ENVIADA' || r.seenAt || r.escalatedAt || r.priority !== 'URGENTE') return;
    await this.db.update(requisitions).set({ escalatedAt: new Date() }).where(eq(requisitions.id, id));
    const mins = Math.round((Date.now() - r.createdAt.getTime()) / 60_000);
    await this.notifications.notifyManagers(r.businessId, {
      type: 'REQUISITION_URGENT',
      title: `⚠️ Urgente sin revisar: ${r.folio} · ${r.area.name}`,
      body: `Lleva ${mins} min esperando · ${r.items.length} ${r.items.length === 1 ? 'insumo' : 'insumos'}`,
      link: `/admin/requisiciones/${r.id}`,
      data: { requisitionId: r.id, folio: r.folio, areaId: r.areaId, escalated: true },
      urgent: true,
    });
    const view = await this.loadView(this.db, r.businessId, id);
    this.emit(view, RT.REQUISITION_UPDATED);
    await this.audit.record('SYSTEM', { businessId: r.businessId, action: 'requisition.escalate', entity: 'requisition', entityId: id });
  }

  // ================================================================ transiciones
  private emit(v: RequisitionView, event: string) {
    this.rt.emit([Rooms.managers(v.businessId), Rooms.area(v.areaId)], event, v);
  }

  /**
   * Ejecuta una transición dentro de una transacción con bloqueo de fila.
   * `apply` recibe la fila bloqueada, puede actualizar renglones y devuelve el patch (y opcionalmente el estado
   * destino calculado, p.ej. aprobación parcial). La validación de la máquina de estados se hace antes de confirmar.
   */
  private async transition(
    actor: Actor,
    id: string,
    to: RequisitionStatus | null,
    action: string,
    apply: (tx: DbOrTx, r: ReqRow) => Promise<{ status?: RequisitionStatus; patch: Partial<typeof requisitions.$inferInsert> }>,
    data?: Record<string, unknown>,
  ): Promise<RequisitionView> {
    const side = sideOf(actor);
    await this.db.transaction(async (tx) => {
      const [r] = await tx
        .select()
        .from(requisitions)
        .where(and(eq(requisitions.id, id), eq(requisitions.businessId, actor.businessId)))
        .for('update');
      if (!r) throw new NotFoundException('Requisición no encontrada');
      await assertAreaAccess(tx, actor, r.areaId);
      if (to) {
        const err = transitionError(r.status, to, side);
        if (err) throw new ConflictException(err);
      }
      const { status, patch } = await apply(tx, r);
      const target = status ?? to;
      if (!target) throw new Error('Transición sin estado destino');
      const err = transitionError(r.status, target, side);
      if (err) throw new ConflictException(err);
      await tx.update(requisitions).set({ ...patch, status: target }).where(eq(requisitions.id, id));
      await this.audit.record(actor, { businessId: actor.businessId, action, entity: 'requisition', entityId: id, data: { from: r.status, to: target, ...(data ?? {}) } }, tx);
    });
    const view = await this.loadView(this.db, actor.businessId, id);
    this.emit(view, RT.REQUISITION_UPDATED);
    return view;
  }

  /** La dueña abrió la requisición. Idempotente. */
  async markSeen(actor: Actor, id: string) {
    if (!isManager(actor)) throw new ForbiddenException('Solo la dueña puede marcar como vista');
    const [r] = await this.db.select().from(requisitions).where(and(eq(requisitions.id, id), eq(requisitions.businessId, actor.businessId)));
    if (!r) throw new NotFoundException('Requisición no encontrada');
    if (r.status !== 'ENVIADA') {
      if (!r.seenAt) {
        await this.db.update(requisitions).set({ seenAt: new Date() }).where(eq(requisitions.id, id));
        const v = await this.loadView(this.db, actor.businessId, id);
        this.emit(v, RT.REQUISITION_UPDATED);
        return v;
      }
      return this.loadView(this.db, actor.businessId, id);
    }
    try {
      return await this.transition(actor, id, 'VISTA', 'requisition.seen', async (_tx, row) => ({ patch: { seenAt: row.seenAt ?? new Date() } }));
    } catch (e) {
      // otra sesión la marcó al mismo tiempo
      if (e instanceof ConflictException) return this.loadView(this.db, actor.businessId, id);
      throw e;
    }
  }

  async review(actor: Actor, id: string, dto: ReviewDto) {
    if (dto.action === 'REJECT' && !dto.reason?.trim()) throw new BadRequestException('Indica el motivo del rechazo');
    if (dto.action === 'APPROVE' && !dto.items?.length) throw new BadRequestException('Indica las cantidades aprobadas');
    const view = await this.transition(
      actor, id, null,
      dto.action === 'REJECT' ? 'requisition.reject' : 'requisition.approve',
      async (tx, r) => {
        const its = await tx
          .select({ id: requisitionItems.id, requestedQty: requisitionItems.requestedQty })
          .from(requisitionItems)
          .where(eq(requisitionItems.requisitionId, r.id));
        const out = computeReviewOutcome(its, dto.action, dto.items);
        if (!out.ok) throw new BadRequestException(out.error);
        // valida la transición antes de tocar renglones
        const err = transitionError(r.status, out.status, sideOf(actor));
        if (err) throw new ConflictException(err);
        for (const it of out.items) {
          await tx.update(requisitionItems).set({ approvedQty: it.approvedQty, rejected: it.rejected, reviewNote: it.reviewNote }).where(eq(requisitionItems.id, it.id));
        }
        const now = new Date();
        const reason = dto.reason?.trim() || null;
        return {
          status: out.status,
          patch: {
            reviewedAt: now,
            reviewedById: actorUserId(actor) ?? (actor.kind === 'device' ? actor.deviceId : null),
            seenAt: r.seenAt ?? now,
            rejectReason: out.status === 'RECHAZADA' ? reason ?? 'Ningún insumo aprobado' : null,
            reviewNote: out.status === 'RECHAZADA' ? null : reason,
          },
        };
      },
      { action: dto.action, items: dto.items, reason: dto.reason },
    );
    await this.notifyRequester(view);
    return view;
  }

  async purchasing(actor: Actor, id: string) {
    return this.transition(actor, id, 'EN_COMPRA', 'requisition.purchasing', async () => ({ patch: { purchasingAt: new Date() } }));
  }

  async fulfill(actor: Actor, id: string, dto: FulfillDto) {
    const view = await this.transition(actor, id, 'SURTIDA', 'requisition.fulfill', async (tx, r) => {
      const its = await tx.select().from(requisitionItems).where(eq(requisitionItems.requisitionId, r.id));
      const out = computeFulfill(its, dto.items);
      if (!out.ok) throw new BadRequestException(out.error);
      for (const it of out.items) {
        await tx.update(requisitionItems).set({ fulfilledQty: it.qty, purchased: true }).where(eq(requisitionItems.id, it.id));
      }
      return { patch: { fulfilledAt: new Date() } };
    }, { items: dto.items });
    await this.notifyRequester(view);
    return view;
  }

  async receive(actor: Actor, id: string, dto: ReceiveDto) {
    let diffs: { id: string; fulfilledQty: number; receivedQty: number }[] = [];
    const view = await this.transition(actor, id, 'RECIBIDA', 'requisition.receive', async (tx, r) => {
      const its = await tx.select().from(requisitionItems).where(eq(requisitionItems.requisitionId, r.id));
      const out = computeReceive(its, dto.items);
      if (!out.ok) throw new BadRequestException(out.error);
      for (const it of out.items) await tx.update(requisitionItems).set({ receivedQty: it.qty }).where(eq(requisitionItems.id, it.id));
      diffs = out.differences;
      return { patch: { receivedAt: new Date(), hasDifferences: out.hasDifferences, receptionNote: dto.note?.trim() || null } };
    }, { items: dto.items, note: dto.note });
    if (view.hasDifferences) {
      const names = diffs
        .map((d) => {
          const it = view.items.find((i) => i.id === d.id);
          return it ? `${it.supplyName}: llegó ${formatQty(d.receivedQty)} de ${formatQty(d.fulfilledQty)}` : null;
        })
        .filter(Boolean)
        .slice(0, 4);
      await this.notifications
        .notifyManagers(view.businessId, {
          type: 'RECEPTION_DIFF',
          title: `Diferencias en recepción ${view.folio} · ${view.area.name}`,
          body: names.join(' · ') + (view.receptionNote ? ` · «${view.receptionNote}»` : ''),
          link: `/admin/requisiciones/${view.id}`,
          data: { requisitionId: view.id, folio: view.folio, areaId: view.areaId },
        })
        .catch((e) => this.log.warn(`notify: ${(e as Error).message}`));
    }
    return view;
  }

  async cancel(actor: Actor, id: string, reason?: string) {
    const view = await this.transition(actor, id, 'CANCELADA', 'requisition.cancel', async () => ({
      patch: { cancelledAt: new Date(), cancelReason: reason?.trim() || null },
    }), { reason });
    if (sideOf(actor) === 'AREA') {
      await this.notifications
        .notifyManagers(view.businessId, {
          type: 'REQUISITION_UPDATED',
          title: `${view.area.name} canceló ${view.folio}`,
          body: reason?.trim() || 'Sin motivo',
          link: `/admin/requisiciones/${view.id}`,
          data: { requisitionId: view.id },
        })
        .catch(() => undefined);
    } else {
      await this.notifyRequester(view);
    }
    return view;
  }

  /** Avisa a quien pidió (si tiene cuenta y no es la dueña) cuando la dueña revisa/surte/cancela. */
  private async notifyRequester(v: RequisitionView) {
    if (!v.createdById) return;
    const u = await this.db.query.users.findFirst({ where: eq(users.id, v.createdById), columns: { id: true, role: true, active: true } });
    if (!u || !u.active || u.role === 'OWNER' || u.role === 'ADMIN') return;
    const label = RequisitionStatusLabel[v.status];
    await this.notifications
      .notifyUsers(v.businessId, [u.id], {
        type: 'REQUISITION_UPDATED',
        title: `${v.folio}: ${label}`,
        body: v.status === 'RECHAZADA' ? v.rejectReason ?? '' : v.reviewNote ?? `${v.itemCount} insumos`,
        link: `/tablet/requisiciones/${v.id}`,
        data: { requisitionId: v.id, status: v.status },
      })
      .catch((e) => this.log.warn(`notifyRequester: ${(e as Error).message}`));
  }

  // ================================================================ lista de compras
  private async shoppingRows(bid: string): Promise<ShoppingRow[]> {
    return this.db
      .select({
        itemId: requisitionItems.id,
        requisitionId: requisitions.id,
        folio: requisitions.folio,
        areaId: areas.id,
        areaName: areas.name,
        supplyId: requisitionItems.supplyId,
        supplyName: requisitionItems.supplyName,
        unit: requisitionItems.unit,
        approvedQty: sql<number>`coalesce(${requisitionItems.approvedQty}, 0)`,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        supplierPhone: suppliers.phone,
        supplierContact: suppliers.contactName,
      })
      .from(requisitionItems)
      .innerJoin(requisitions, eq(requisitions.id, requisitionItems.requisitionId))
      .innerJoin(areas, eq(areas.id, requisitions.areaId))
      .innerJoin(supplies, eq(supplies.id, requisitionItems.supplyId))
      .leftJoin(suppliers, eq(suppliers.id, supplies.supplierId))
      .where(and(
        eq(requisitions.businessId, bid),
        inArray(requisitions.status, ACTIVE_FOR_SHOPPING),
        eq(requisitionItems.purchased, false),
        eq(requisitionItems.rejected, false),
        sql`coalesce(${requisitionItems.approvedQty}, 0) > 0`,
      ))
      .orderBy(asc(requisitions.createdAt));
  }

  async shoppingList(actor: Actor): Promise<{ generatedAt: string; businessName: string; groups: ShoppingGroup[]; totalLines: number; requisitionCount: number }> {
    const business = await this.settings.getBusiness(actor.businessId);
    const rows = await this.shoppingRows(actor.businessId);
    const groups = aggregateShoppingList(rows, business.name);
    return {
      generatedAt: new Date().toISOString(),
      businessName: business.name,
      groups,
      totalLines: groups.reduce((s, g) => s + g.items.length, 0),
      requisitionCount: new Set(rows.map((r) => r.requisitionId)).size,
    };
  }

  async markPurchased(actor: Actor, dto: { supplyIds?: string[]; supplierId?: string | null }) {
    const rows = await this.shoppingRows(actor.businessId);
    const selected = rows.filter((r) => {
      if (dto.supplyIds?.length && !dto.supplyIds.includes(r.supplyId)) return false;
      if (dto.supplierId !== undefined && r.supplierId !== dto.supplierId) return false;
      return true;
    });
    if (!selected.length) return { updatedItems: 0, requisitions: [] as RequisitionView[] };
    const itemIds = selected.map((r) => r.itemId);
    const reqIds = [...new Set(selected.map((r) => r.requisitionId))];
    const moved: string[] = [];
    await this.db.transaction(async (tx) => {
      await tx.update(requisitionItems).set({ purchased: true }).where(inArray(requisitionItems.id, itemIds));
      const rs = await tx
        .update(requisitions)
        .set({ status: 'EN_COMPRA', purchasingAt: new Date() })
        .where(and(inArray(requisitions.id, reqIds), inArray(requisitions.status, ['APROBADA', 'APROBADA_PARCIAL'])))
        .returning({ id: requisitions.id });
      moved.push(...rs.map((r) => r.id));
      await this.audit.record(actor, { businessId: actor.businessId, action: 'requisition.purchased', entity: 'requisition', data: { itemIds, supplyIds: dto.supplyIds, supplierId: dto.supplierId, moved } }, tx);
    });
    const views = await this.loadViews(this.db, actor.businessId, reqIds);
    for (const v of views) this.emit(v, RT.REQUISITION_UPDATED);
    return { updatedItems: itemIds.length, movedToPurchasing: moved, requisitions: views };
  }

  // ================================================================ plantillas y repetir pedido
  private async templateAreaFor(actor: Actor, areaId?: string): Promise<string> {
    const dev = deviceAreaId(actor);
    if (actor.kind === 'device') {
      if (!dev) throw new ForbiddenException('Esta tablet no está ligada a un área');
      if (areaId && areaId !== dev) throw new ForbiddenException('Solo puedes ver tu área');
      return dev;
    }
    if (!areaId) throw new BadRequestException('Selecciona el área');
    await assertAreaAccess(this.db, actor, areaId);
    return areaId;
  }

  private async enrichTemplateItems(bid: string, areaId: string, items: { supplyId: string; quantity: number }[]) {
    const ids = [...new Set(items.map((i) => i.supplyId))];
    const rows = ids.length
      ? await this.db
          .select({
            id: supplies.id, name: supplies.name, unit: supplies.unit, icon: supplies.icon, imageUrl: supplies.imageUrl, active: supplies.active,
            maxPerOrder: supplies.maxPerOrder, inArea: sql<boolean>`${supplyAreas.areaId} is not null`,
          })
          .from(supplies)
          .leftJoin(supplyAreas, and(eq(supplyAreas.supplyId, supplies.id), eq(supplyAreas.areaId, areaId)))
          .where(and(eq(supplies.businessId, bid), inArray(supplies.id, ids)))
      : [];
    const m = new Map(rows.map((r) => [r.id, r]));
    return items.map((i) => {
      const s = m.get(i.supplyId);
      return {
        supplyId: i.supplyId, quantity: i.quantity, supplyName: s?.name ?? null, unit: s?.unit ?? null, icon: s?.icon ?? null, imageUrl: s?.imageUrl ?? null,
        available: !!s && s.active && s.inArea,
      };
    });
  }

  async listTemplates(actor: Actor, areaId?: string) {
    const conds: SQL[] = [eq(requisitionTemplates.businessId, actor.businessId)];
    if (actor.kind === 'device' || areaId || !isManager(actor)) {
      const a = await this.templateAreaFor(actor, areaId);
      conds.push(eq(requisitionTemplates.areaId, a));
    }
    const rows = await this.db.select().from(requisitionTemplates).where(and(...conds)).orderBy(asc(requisitionTemplates.name));
    return Promise.all(rows.map(async (t) => ({ ...t, items: await this.enrichTemplateItems(actor.businessId, t.areaId, t.items) })));
  }

  private async validateTemplateItems(bid: string, areaId: string, items: { supplyId: string; quantity: number }[]) {
    const norm = normalizeIncomingItems(items).map((i) => ({ supplyId: i.supplyId, quantity: i.quantity }));
    const enriched = await this.enrichTemplateItems(bid, areaId, norm);
    const bad = enriched.find((e) => !e.available);
    if (bad) throw new BadRequestException(bad.supplyName ? `«${bad.supplyName}» no está disponible para esta área` : 'Uno de los insumos no existe');
    return norm;
  }

  async createTemplate(actor: Actor, dto: { name: string; areaId?: string; items: { supplyId: string; quantity: number }[] }) {
    const areaId = await this.templateAreaFor(actor, dto.areaId);
    const items = await this.validateTemplateItems(actor.businessId, areaId, dto.items);
    const [t] = await this.db.insert(requisitionTemplates).values({ businessId: actor.businessId, areaId, name: dto.name, items }).returning();
    return { ...t, items: await this.enrichTemplateItems(actor.businessId, areaId, t.items) };
  }

  private async loadTemplate(actor: Actor, id: string) {
    const [t] = await this.db.select().from(requisitionTemplates).where(and(eq(requisitionTemplates.id, id), eq(requisitionTemplates.businessId, actor.businessId)));
    if (!t) throw new NotFoundException('Plantilla no encontrada');
    await this.templateAreaFor(actor, t.areaId);
    return t;
  }

  async updateTemplate(actor: Actor, id: string, dto: { name?: string; items?: { supplyId: string; quantity: number }[] }) {
    const t = await this.loadTemplate(actor, id);
    const items = dto.items ? await this.validateTemplateItems(actor.businessId, t.areaId, dto.items) : undefined;
    const [u] = await this.db
      .update(requisitionTemplates)
      .set({ ...(dto.name ? { name: dto.name } : {}), ...(items ? { items } : {}) })
      .where(eq(requisitionTemplates.id, id))
      .returning();
    return { ...u, items: await this.enrichTemplateItems(actor.businessId, u.areaId, u.items) };
  }

  async deleteTemplate(actor: Actor, id: string) {
    await this.loadTemplate(actor, id);
    await this.db.delete(requisitionTemplates).where(eq(requisitionTemplates.id, id));
    return { ok: true };
  }

  /** "Repetir último pedido": renglones de la última requisición no cancelada del área. */
  async last(actor: Actor, areaId?: string) {
    const a = await this.templateAreaFor(actor, areaId);
    const [r] = await this.db
      .select({ id: requisitions.id })
      .from(requisitions)
      .where(and(eq(requisitions.businessId, actor.businessId), eq(requisitions.areaId, a), ne(requisitions.status, 'CANCELADA')))
      .orderBy(desc(requisitions.createdAt))
      .limit(1);
    if (!r) return { requisition: null, items: [] };
    const v = await this.loadView(this.db, actor.businessId, r.id);
    const items = await this.enrichTemplateItems(actor.businessId, a, v.items.map((i) => ({ supplyId: i.supplyId, quantity: i.requestedQty })));
    return { requisition: { id: v.id, folio: v.folio, createdAt: v.createdAt, status: v.status }, items };
  }

  // ================================================================ ventanas de pedido (REQ-08)
  @Cron('*/5 * * * *')
  async windowReminders(now = new Date()) {
    try {
      const rows = await this.db
        .select({ id: areas.id, businessId: areas.businessId, name: areas.name, orderWindow: areas.orderWindow })
        .from(areas)
        .where(and(eq(areas.active, true), eq(areas.canRequisition, true), sql`${areas.orderWindow} <> '{}'::jsonb`));
      for (const a of rows) {
        const tz = (await this.settings.getBusiness(a.businessId)).timezone;
        const info = windowClosingInfo(a.orderWindow, now, tz, 30);
        if (!info) continue;
        const key = `${a.id}|${info.date}`;
        if (this.windowNotified.has(key)) continue;
        this.windowNotified.add(key);
        this.rt.emit(Rooms.area(a.id), 'requisition.window_closing', {
          areaId: a.id, until: info.until, minutesLeft: info.minutesLeft,
          message: `Quedan ${info.minutesLeft} min para enviar el pedido (cierra a las ${info.until})`,
        });
      }
      if (this.windowNotified.size > 2000) this.windowNotified.clear();
    } catch (e) {
      this.log.warn(`windowReminders: ${(e as Error).message}`);
    }
  }

  // ================================================================ utilidades para otros servicios
  async requisitionForChat(bid: string, id: string) {
    const [r] = await this.db
      .select({ id: requisitions.id, areaId: requisitions.areaId, folio: requisitions.folio })
      .from(requisitions)
      .where(and(eq(requisitions.id, id), eq(requisitions.businessId, bid)));
    if (!r) throw new NotFoundException('Requisición no encontrada');
    return r;
  }

}

function joinText(a: string | null, b?: string): string | null {
  const parts = [a?.trim(), b?.trim()].filter((x): x is string => !!x);
  return parts.length ? [...new Set(parts)].join(' · ').slice(0, 500) : null;
}

/** "2026-10-30" → medianoche local (o la siguiente si es límite superior exclusivo); ISO con hora → tal cual. */
export function parseBoundary(s: string, timeZone: string, endExclusive: boolean): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = localMidnightUtc(s, timeZone);
    return endExclusive ? localMidnightUtc(new Date(Date.parse(`${s}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10), timeZone) : d;
  }
  return new Date(s);
}
