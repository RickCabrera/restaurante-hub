import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { ORDER_ACTIVE_STATUSES, RT } from '@rh/shared';
import { Db, InjectDb } from '../../../db/db.module';
import { cashMovements, cashSessions, orders, users } from '../../../db/schema';
import { RealtimeService, Rooms } from '../../../realtime/realtime.service';
import { SettingsService } from '../../../settings/settings.service';
import { loadEnv } from '../../../config/env';
import type { Actor } from '../../../common/actor';
import { actorUserId } from '../../../common/actor';
import { localParts, zonedTimeToUtc } from '../common/tz';
import { toOrderView } from '../orders/order-view';

@Injectable()
export class DriversService {
  private readonly env = loadEnv();

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly rt: RealtimeService,
  ) {}

  /** Repartidores con carga actual. */
  async list(businessId: string) {
    const ds = await this.db.query.users.findMany({
      where: and(eq(users.businessId, businessId), eq(users.role, 'DRIVER')),
      columns: { id: true, name: true, phone: true, active: true, avatarColor: true },
      orderBy: asc(users.name),
    });
    if (!ds.length) return [];
    const counts = await this.db
      .select({
        driverId: orders.driverId,
        active: sql<number>`count(*) filter (where ${orders.status} in ('NUEVO','ACEPTADO','EN_PREPARACION','LISTO','EN_CAMINO'))::int`,
        onTheWay: sql<number>`count(*) filter (where ${orders.status} = 'EN_CAMINO')::int`,
        unsettledCash: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} = 'ENTREGADO' and ${orders.paymentMethod} = 'EFECTIVO' and ${orders.driverSettledAt} is null),0)::int`,
      })
      .from(orders)
      .where(and(eq(orders.businessId, businessId), inArray(orders.driverId, ds.map((d) => d.id))))
      .groupBy(orders.driverId);
    return ds.map((d) => {
      const c = counts.find((x) => x.driverId === d.id);
      return { ...d, activeOrders: c?.active ?? 0, onTheWay: c?.onTheWay ?? 0, unsettledCashCents: c?.unsettledCash ?? 0 };
    });
  }

  async myOrders(actor: Actor) {
    const uid = actorUserId(actor)!;
    const rows = await this.db.query.orders.findMany({
      where: and(eq(orders.businessId, actor.businessId), eq(orders.driverId, uid), inArray(orders.status, ORDER_ACTIVE_STATUSES)),
      orderBy: asc(orders.createdAt),
      with: { items: true, driver: { columns: { id: true, name: true, phone: true } }, branch: { columns: { name: true } } },
    });
    return rows.map((o) => toOrderView(o, this.env.APP_URL));
  }

  private async todayStart(businessId: string): Promise<Date> {
    const b = await this.settings.getBusiness(businessId);
    return zonedTimeToUtc(localParts(new Date(), b.timezone).date, 0, b.timezone);
  }

  private async unsettled(businessId: string, driverId: string) {
    return this.db.query.orders.findMany({
      where: and(
        eq(orders.businessId, businessId),
        eq(orders.driverId, driverId),
        eq(orders.status, 'ENTREGADO'),
        eq(orders.paymentMethod, 'EFECTIVO'),
        isNull(orders.driverSettledAt),
      ),
      columns: { id: true, folio: true, totalCents: true, deliveryFeeCents: true, deliveredAt: true },
      orderBy: asc(orders.deliveredAt),
    });
  }

  async summary(businessId: string, driverId: string) {
    const from = await this.todayStart(businessId);
    const delivered = await this.db.query.orders.findMany({
      where: and(eq(orders.businessId, businessId), eq(orders.driverId, driverId), eq(orders.status, 'ENTREGADO'), gte(orders.deliveredAt, from)),
      columns: { id: true, folio: true, totalCents: true, deliveryFeeCents: true, paymentMethod: true, deliveredAt: true, customerName: true },
      orderBy: desc(orders.deliveredAt),
    });
    const pending = await this.unsettled(businessId, driverId);
    const sum = (xs: { totalCents: number }[]) => xs.reduce((s, x) => s + x.totalCents, 0);
    return {
      date: from.toISOString(),
      deliveredCount: delivered.length,
      deliveredTotalCents: sum(delivered),
      deliveryFeesCents: delivered.reduce((s, x) => s + x.deliveryFeeCents, 0),
      byMethod: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].map((m) => {
        const xs = delivered.filter((d) => d.paymentMethod === m);
        return { method: m, count: xs.length, totalCents: sum(xs) };
      }),
      cashToSettleCents: sum(pending),
      unsettledOrders: pending,
      deliveries: delivered,
    };
  }

  async mySummary(actor: Actor) {
    return this.summary(actor.businessId, actorUserId(actor)!);
  }

  /** Corte de efectivo del repartidor; registra entrada en la caja abierta (si hay POS). */
  async settle(actor: Actor, driverId: string) {
    const businessId = actor.businessId;
    const d = await this.db.query.users.findFirst({ where: and(eq(users.id, driverId), eq(users.businessId, businessId)) });
    if (!d || d.role !== 'DRIVER') throw new NotFoundException('Repartidor no encontrado');
    const result = await this.db.transaction(async (tx) => {
      const pending = await tx.query.orders.findMany({
        where: and(
          eq(orders.businessId, businessId),
          eq(orders.driverId, driverId),
          eq(orders.status, 'ENTREGADO'),
          eq(orders.paymentMethod, 'EFECTIVO'),
          isNull(orders.driverSettledAt),
        ),
        columns: { id: true, folio: true, totalCents: true },
      });
      const total = pending.reduce((s, o) => s + o.totalCents, 0);
      const now = new Date();
      const session = await tx.query.cashSessions.findFirst({
        where: and(eq(cashSessions.businessId, businessId), isNull(cashSessions.closedAt)),
        orderBy: desc(cashSessions.openedAt),
      });
      if (pending.length) {
        await tx
          .update(orders)
          .set({ driverSettledAt: now, cashSessionId: session?.id ?? null })
          .where(inArray(orders.id, pending.map((o) => o.id)));
      }
      let movementId: string | null = null;
      if (session && total > 0) {
        const [m] = await tx
          .insert(cashMovements)
          .values({
            cashSessionId: session.id,
            type: 'ENTRADA',
            amountCents: total,
            reason: `Corte de repartidor ${d.name} (${pending.length} pedidos)`,
            source: 'DRIVER_SETTLEMENT',
            refId: driverId,
            createdById: actorUserId(actor),
          })
          .returning();
        movementId = m.id;
      }
      return { driverId, driverName: d.name, ordersCount: pending.length, totalCents: total, orders: pending, settledAt: now.toISOString(), cashSessionId: session?.id ?? null, cashMovementId: movementId };
    });
    this.rt.emit([Rooms.managers(businessId), Rooms.user(driverId)], RT.ORDER_UPDATED, { driverSettlement: result });
    return result;
  }
}
