import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { RT } from '@rh/shared';
import { InjectDb, Db } from '../../db/db.module';
import { areas, diningTables, orderItems, orders, ticketItems, tickets } from '../../db/schema';
import type { Actor } from '../../common/actor';
import { RealtimeService, Rooms } from '../../realtime/realtime.service';

export type KdsSource = 'ORDER' | 'TICKET';

export interface KdsItem {
  id: string;
  name: string;
  quantity: number;
  modifiers: { name: string; quantity: number }[];
  note: string | null;
  doneAt: Date | null;
}

export interface KdsGroup {
  source: KdsSource;
  id: string;
  folio: string;
  label: string;
  createdAt: Date;
  elapsedMinutes: number;
  notes: string | null;
  items: KdsItem[];
}

const KDS_ORDER_STATUSES = ['ACEPTADO', 'EN_PREPARACION'] as const;
/** Ventana para cuentas POS (evita que queden renglones viejos colgados en pantalla). */
const TICKET_WINDOW_MS = 18 * 3600_000;

export function serviceLabelForTicket(t: { serviceType: string; label: string | null; tableName?: string | null }): string {
  if (t.serviceType === 'MESA') return `Mesa ${t.tableName ?? t.label ?? ''}`.trim();
  const base = t.serviceType === 'PARA_LLEVAR' ? 'Para llevar' : 'Mostrador';
  return t.label ? `${base} · ${t.label}` : base;
}

/** Monitor de cocina (KDS): renglones de producción pendientes por área. */
@Injectable()
export class KdsService {
  constructor(@InjectDb() private readonly db: Db, private readonly rt: RealtimeService) {}

  /** Área efectiva: la del dispositivo KDS o la indicada por un gerente. */
  resolveArea(actor: Actor, areaId?: string): string {
    if (actor.kind === 'device' && actor.purpose === 'KDS') {
      if (!actor.areaId) throw new BadRequestException('La pantalla no tiene área asignada');
      if (areaId && areaId !== actor.areaId) throw new ForbiddenException('Esta pantalla solo ve su área');
      return actor.areaId;
    }
    if (!areaId) throw new BadRequestException('Indica el área (areaId)');
    return areaId;
  }

  async items(bid: string, areaId: string, opts: { includeDone?: boolean } = {}): Promise<KdsGroup[]> {
    const area = await this.db.query.areas.findFirst({ where: and(eq(areas.id, areaId), eq(areas.businessId, bid)) });
    if (!area) throw new BadRequestException('Área inválida');
    const now = Date.now();
    const groups: KdsGroup[] = [];

    // ---- Pedidos de delivery
    const orderRows = await this.db
      .select({ item: orderItems, order: orders })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(
        eq(orders.businessId, bid),
        inArray(orders.status, [...KDS_ORDER_STATUSES]),
        eq(orderItems.productionAreaId, areaId),
        opts.includeDone ? undefined : isNull(orderItems.kdsDoneAt),
      ))
      .orderBy(asc(orders.createdAt), asc(orderItems.id));
    const byOrder = new Map<string, KdsGroup>();
    for (const r of orderRows) {
      let g = byOrder.get(r.order.id);
      if (!g) {
        const created = r.order.acceptedAt ?? r.order.createdAt;
        g = {
          source: 'ORDER',
          id: r.order.id,
          folio: r.order.folio,
          label: `${r.order.type === 'DOMICILIO' ? 'Domicilio' : 'Recoger'} · ${r.order.customerName}`,
          createdAt: created,
          elapsedMinutes: Math.max(0, Math.floor((now - created.getTime()) / 60_000)),
          notes: r.order.notes,
          items: [],
        };
        byOrder.set(r.order.id, g);
        groups.push(g);
      }
      g.items.push({
        id: r.item.id,
        name: r.item.productName,
        quantity: r.item.quantity,
        modifiers: r.item.modifiers.map((m) => ({ name: m.name, quantity: m.quantity })),
        note: r.item.note,
        doneAt: r.item.kdsDoneAt,
      });
    }

    // ---- Cuentas POS
    const tRows = await this.db
      .select({ item: ticketItems, ticket: tickets, tableName: diningTables.name })
      .from(ticketItems)
      .innerJoin(tickets, eq(tickets.id, ticketItems.ticketId))
      .leftJoin(diningTables, eq(diningTables.id, tickets.tableId))
      .where(and(
        eq(tickets.businessId, bid),
        ne(tickets.status, 'CANCELADA'),
        eq(ticketItems.productionAreaId, areaId),
        isNotNull(ticketItems.sentAt),
        isNull(ticketItems.cancelledAt),
        gte(ticketItems.sentAt, new Date(now - TICKET_WINDOW_MS)),
        opts.includeDone ? undefined : isNull(ticketItems.kdsDoneAt),
      ))
      .orderBy(asc(ticketItems.sentAt), asc(ticketItems.createdAt));
    const byTicket = new Map<string, KdsGroup>();
    for (const r of tRows) {
      let g = byTicket.get(r.ticket.id);
      const sent = r.item.sentAt!;
      if (!g) {
        g = {
          source: 'TICKET',
          id: r.ticket.id,
          folio: r.ticket.folio,
          label: serviceLabelForTicket({ ...r.ticket, tableName: r.tableName }),
          createdAt: sent,
          elapsedMinutes: Math.max(0, Math.floor((now - sent.getTime()) / 60_000)),
          notes: r.ticket.notes,
          items: [],
        };
        byTicket.set(r.ticket.id, g);
        groups.push(g);
      }
      g.items.push({
        id: r.item.id,
        name: r.item.productName,
        quantity: r.item.quantity,
        modifiers: r.item.modifiers.map((m) => ({ name: m.name, quantity: m.quantity })),
        note: r.item.note,
        doneAt: r.item.kdsDoneAt,
      });
    }

    groups.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return groups;
  }

  /** Marca (o desmarca) renglones como listos. Devuelve cuántos cambiaron. */
  async setDone(bid: string, areaId: string | null, source: KdsSource, itemIds: string[], done: boolean) {
    if (!itemIds.length) return { updated: 0 };
    const at = done ? new Date() : null;
    let affectedOrders: string[] = [];
    let affectedAreas: string[] = [];
    let updated = 0;
    if (source === 'ORDER') {
      const rows = await this.db
        .select({ id: orderItems.id, orderId: orderItems.orderId, areaId: orderItems.productionAreaId })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(
          eq(orders.businessId, bid),
          inArray(orderItems.id, itemIds),
          areaId ? eq(orderItems.productionAreaId, areaId) : undefined,
        ));
      if (rows.length) {
        await this.db.update(orderItems).set({ kdsDoneAt: at }).where(inArray(orderItems.id, rows.map((r) => r.id)));
      }
      updated = rows.length;
      affectedOrders = [...new Set(rows.map((r) => r.orderId))];
      affectedAreas = [...new Set(rows.map((r) => r.areaId).filter((x): x is string => !!x))];
    } else {
      const rows = await this.db
        .select({ id: ticketItems.id, ticketId: ticketItems.ticketId, areaId: ticketItems.productionAreaId })
        .from(ticketItems)
        .innerJoin(tickets, eq(tickets.id, ticketItems.ticketId))
        .where(and(
          eq(tickets.businessId, bid),
          inArray(ticketItems.id, itemIds),
          isNotNull(ticketItems.sentAt),
          areaId ? eq(ticketItems.productionAreaId, areaId) : undefined,
        ));
      if (rows.length) {
        await this.db.update(ticketItems).set({ kdsDoneAt: at }).where(inArray(ticketItems.id, rows.map((r) => r.id)));
      }
      updated = rows.length;
      affectedAreas = [...new Set(rows.map((r) => r.areaId).filter((x): x is string => !!x))];
      for (const tid of new Set(rows.map((r) => r.ticketId))) {
        this.rt.emit(Rooms.pos(bid), RT.KDS_UPDATED, { source, id: tid, itemIds, done });
      }
    }
    if (done) for (const oid of affectedOrders) await this.maybeMarkOrderReady(bid, oid);
    this.notifyKds(bid, affectedAreas, { source, itemIds, done });
    return { updated };
  }

  /** Todos los renglones del área de un pedido/cuenta. */
  async groupDone(bid: string, areaId: string | null, source: KdsSource, id: string) {
    let ids: string[];
    if (source === 'ORDER') {
      const o = await this.db.query.orders.findFirst({ where: and(eq(orders.id, id), eq(orders.businessId, bid)), columns: { id: true } });
      if (!o) throw new BadRequestException('Pedido no encontrado');
      const rows = await this.db.query.orderItems.findMany({
        where: and(eq(orderItems.orderId, id), isNull(orderItems.kdsDoneAt), areaId ? eq(orderItems.productionAreaId, areaId) : undefined),
        columns: { id: true },
      });
      ids = rows.map((r) => r.id);
    } else {
      const t = await this.db.query.tickets.findFirst({ where: and(eq(tickets.id, id), eq(tickets.businessId, bid)), columns: { id: true } });
      if (!t) throw new BadRequestException('Cuenta no encontrada');
      const rows = await this.db.query.ticketItems.findMany({
        where: and(
          eq(ticketItems.ticketId, id), isNull(ticketItems.kdsDoneAt), isNotNull(ticketItems.sentAt), isNull(ticketItems.cancelledAt),
          areaId ? eq(ticketItems.productionAreaId, areaId) : undefined,
        ),
        columns: { id: true },
      });
      ids = rows.map((r) => r.id);
    }
    return this.setDone(bid, areaId, source, ids, true);
  }

  /**
   * Si todos los renglones con área de producción de un pedido están listos y el pedido
   * sigue en ACEPTADO/EN_PREPARACION, pasa a LISTO (mínimo; la lógica de pedidos es del módulo delivery).
   */
  private async maybeMarkOrderReady(bid: string, orderId: string) {
    const items = await this.db.query.orderItems.findMany({
      where: and(eq(orderItems.orderId, orderId), isNotNull(orderItems.productionAreaId)),
      columns: { kdsDoneAt: true },
    });
    if (!items.length || items.some((i) => !i.kdsDoneAt)) return;
    const [o] = await this.db
      .update(orders)
      .set({ status: 'LISTO', readyAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.businessId, bid), inArray(orders.status, [...KDS_ORDER_STATUSES])))
      .returning({ id: orders.id, folio: orders.folio, status: orders.status, readyAt: orders.readyAt, type: orders.type });
    if (!o) return;
    const payload = { ...o, source: 'KDS' };
    this.rt.toManagers(bid, RT.ORDER_UPDATED, payload);
    this.rt.emit(Rooms.pos(bid), RT.ORDER_UPDATED, payload);
  }

  notifyKds(bid: string, areaIds: string[], payload: Record<string, unknown>) {
    for (const a of areaIds) this.rt.emit(Rooms.kds(a), RT.KDS_UPDATED, { areaId: a, ...payload });
    if (areaIds.length) this.rt.toManagers(bid, RT.KDS_UPDATED, { areaIds, ...payload });
  }
}
