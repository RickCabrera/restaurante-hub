import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, gte, lt, sql, SQL } from 'drizzle-orm';
import { formatMoney } from '@rh/shared';
import { Db, InjectDb } from '../../../db/db.module';
import { deliveryZones, orderItems, orders, requisitions } from '../../../db/schema';
import { NotificationsService } from '../../../notifications/notifications.service';
import { SettingsService } from '../../../settings/settings.service';
import { addDays, localParts, zonedTimeToUtc } from '../common/tz';
import { CHANNEL_LABEL, TYPE_LABEL } from '../orders/order-view';

const VALID = sql`${orders.status} not in ('RECHAZADO','CANCELADO')`;

export interface SalesReport {
  from: string;
  to: string;
  timezone: string;
  totals: { salesCents: number; ordersCount: number; avgTicketCents: number; discountCents: number; deliveryFeesCents: number; cancelledCount: number; rejectedCount: number };
  byDay: { date: string; ordersCount: number; salesCents: number }[];
  byChannel: { channel: string; label: string; ordersCount: number; salesCents: number }[];
  byType: { type: string; label: string; ordersCount: number; salesCents: number }[];
  byPaymentMethod: { method: string; ordersCount: number; salesCents: number }[];
  topProducts: { productId: string; name: string; quantity: number; salesCents: number }[];
  byZone: { zoneId: string | null; name: string; ordersCount: number; salesCents: number }[];
  customers: { newCount: number; returningCount: number };
  times: { avgPrepMinutes: number | null; avgDeliveryMinutes: number | null; avgTotalMinutes: number | null };
}

@Injectable()
export class ReportsService {
  private readonly log = new Logger('Reports');
  /** businessId:YYYY-MM-DD ya enviados (en memoria) */
  private readonly sent = new Set<string>();

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Rango por defecto: últimos 7 días locales (incluye hoy). `to` es exclusivo. */
  async range(businessId: string, from?: Date, to?: Date) {
    const b = await this.settings.getBusiness(businessId);
    const today = localParts(new Date(), b.timezone).date;
    const f = from ?? zonedTimeToUtc(addDays(today, -6), 0, b.timezone);
    const t = to ?? zonedTimeToUtc(addDays(today, 1), 0, b.timezone);
    return { from: f, to: t, tz: b.timezone };
  }

  async sales(businessId: string, opts: { from?: Date; to?: Date; branchId?: string }): Promise<SalesReport> {
    const { from, to, tz } = await this.range(businessId, opts.from, opts.to);
    const conds: SQL[] = [eq(orders.businessId, businessId), gte(orders.createdAt, from), lt(orders.createdAt, to)];
    if (opts.branchId) conds.push(eq(orders.branchId, opts.branchId));
    const base = and(...conds)!;
    const valid = and(base, VALID)!;

    const [tot] = await this.db
      .select({
        sales: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${VALID}),0)::int`,
        count: sql<number>`(count(*) filter (where ${VALID}))::int`,
        discount: sql<number>`coalesce(sum(${orders.discountCents}) filter (where ${VALID}),0)::int`,
        fees: sql<number>`coalesce(sum(${orders.deliveryFeeCents}) filter (where ${VALID}),0)::int`,
        cancelled: sql<number>`(count(*) filter (where ${orders.status} = 'CANCELADO'))::int`,
        rejected: sql<number>`(count(*) filter (where ${orders.status} = 'RECHAZADO'))::int`,
        prep: sql<number | null>`avg(extract(epoch from (${orders.readyAt} - ${orders.acceptedAt})) / 60) filter (where ${orders.readyAt} is not null and ${orders.acceptedAt} is not null)`,
        deliv: sql<number | null>`avg(extract(epoch from (${orders.deliveredAt} - ${orders.dispatchedAt})) / 60) filter (where ${orders.deliveredAt} is not null and ${orders.dispatchedAt} is not null)`,
        total: sql<number | null>`avg(extract(epoch from (${orders.deliveredAt} - ${orders.createdAt})) / 60) filter (where ${orders.deliveredAt} is not null)`,
      })
      .from(orders)
      .where(base);

    const day = sql<string>`to_char(${orders.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;
    const byDay = await this.db
      .select({ date: day, ordersCount: sql<number>`count(*)::int`, salesCents: sql<number>`coalesce(sum(${orders.totalCents}),0)::int` })
      .from(orders)
      .where(valid)
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    const grp = async <K extends SQL | typeof orders.channel | typeof orders.type | typeof orders.paymentMethod>(col: K) =>
      this.db
        .select({ key: sql<string>`${col}`, ordersCount: sql<number>`count(*)::int`, salesCents: sql<number>`coalesce(sum(${orders.totalCents}),0)::int` })
        .from(orders)
        .where(valid)
        .groupBy(col)
        .orderBy(sql`2 desc`);

    const [ch, ty, pm] = await Promise.all([grp(orders.channel), grp(orders.type), grp(orders.paymentMethod)]);

    const top = await this.db
      .select({
        productId: orderItems.productId,
        name: sql<string>`max(${orderItems.productName})`,
        quantity: sql<number>`sum(${orderItems.quantity})::int`,
        salesCents: sql<number>`sum(${orderItems.totalCents})::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(valid)
      .groupBy(orderItems.productId)
      .orderBy(sql`3 desc`)
      .limit(15);

    const zones = await this.db
      .select({
        zoneId: orders.zoneId,
        name: sql<string>`coalesce(max(${deliveryZones.name}), case when ${orders.zoneId} is null then 'Sin zona (recoger/mostrador)' else 'Zona eliminada' end)`,
        ordersCount: sql<number>`count(*)::int`,
        salesCents: sql<number>`coalesce(sum(${orders.totalCents}),0)::int`,
      })
      .from(orders)
      .leftJoin(deliveryZones, eq(deliveryZones.id, orders.zoneId))
      .where(valid)
      .groupBy(orders.zoneId)
      .orderBy(sql`3 desc`);

    // Nuevos = clientes cuyo primer pedido válido cae en el rango
    const cust = await this.db.execute(sql`
      with c as (
        select distinct customer_id from delivery_order
        where business_id = ${businessId} and created_at >= ${from} and created_at < ${to}
          and status not in ('RECHAZADO','CANCELADO') ${opts.branchId ? sql`and branch_id = ${opts.branchId}` : sql``}
      )
      select
        count(*) filter (where not exists (
          select 1 from delivery_order o2 where o2.customer_id = c.customer_id and o2.created_at < ${from}
            and o2.status not in ('RECHAZADO','CANCELADO')))::int as new_count,
        count(*) filter (where exists (
          select 1 from delivery_order o2 where o2.customer_id = c.customer_id and o2.created_at < ${from}
            and o2.status not in ('RECHAZADO','CANCELADO')))::int as returning_count
      from c`);
    const cr = (cust.rows[0] ?? {}) as { new_count?: number; returning_count?: number };

    const round = (n: number | null | undefined) => (n == null ? null : Math.round(Number(n) * 10) / 10);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: tz,
      totals: {
        salesCents: tot.sales,
        ordersCount: tot.count,
        avgTicketCents: tot.count ? Math.round(tot.sales / tot.count) : 0,
        discountCents: tot.discount,
        deliveryFeesCents: tot.fees,
        cancelledCount: tot.cancelled,
        rejectedCount: tot.rejected,
      },
      byDay,
      byChannel: ch.map((r) => ({ channel: r.key, label: CHANNEL_LABEL[r.key as keyof typeof CHANNEL_LABEL] ?? r.key, ordersCount: r.ordersCount, salesCents: r.salesCents })),
      byType: ty.map((r) => ({ type: r.key, label: TYPE_LABEL[r.key as keyof typeof TYPE_LABEL] ?? r.key, ordersCount: r.ordersCount, salesCents: r.salesCents })),
      byPaymentMethod: pm.map((r) => ({ method: r.key, ordersCount: r.ordersCount, salesCents: r.salesCents })),
      topProducts: top,
      byZone: zones,
      customers: { newCount: Number(cr.new_count ?? 0), returningCount: Number(cr.returning_count ?? 0) },
      times: { avgPrepMinutes: round(tot.prep), avgDeliveryMinutes: round(tot.deliv), avgTotalMinutes: round(tot.total) },
    };
  }

  /** CSV (una fila por pedido) con BOM para Excel. */
  async salesCsv(businessId: string, opts: { from?: Date; to?: Date; branchId?: string }): Promise<string> {
    const { from, to, tz } = await this.range(businessId, opts.from, opts.to);
    const conds: SQL[] = [eq(orders.businessId, businessId), gte(orders.createdAt, from), lt(orders.createdAt, to)];
    if (opts.branchId) conds.push(eq(orders.branchId, opts.branchId));
    const rows = await this.db.query.orders.findMany({ where: and(...conds), orderBy: orders.createdAt });
    const head = ['Folio', 'Fecha', 'Hora', 'Canal', 'Tipo', 'Estado', 'Cliente', 'Teléfono', 'Subtotal', 'Descuento', 'Envío', 'Total', 'Pago', 'Pagado', 'Cupón', 'Zona'];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const m = (c: number) => (c / 100).toFixed(2);
    const lines = rows.map((o) => {
      const lp = localParts(o.createdAt, tz);
      return [o.folio, lp.date, lp.hhmm, CHANNEL_LABEL[o.channel], TYPE_LABEL[o.type], o.status, o.customerName, o.customerPhone, m(o.subtotalCents), m(o.discountCents), m(o.deliveryFeeCents), m(o.totalCents), o.paymentMethod, o.paid ? 'Sí' : 'No', o.couponCode ?? '', o.zoneId ?? '']
        .map(esc)
        .join(',');
    });
    return '﻿' + [head.join(','), ...lines].join('\n');
  }

  // ---------------- RPT-03 resumen diario
  @Cron('*/15 * * * *')
  async dailySummaryTick(now = new Date()) {
    let all: { id: string; timezone: string; settings: { dailySummaryHour?: number | null; modules?: { delivery?: boolean } } }[] = [];
    try {
      all = await this.db.query.businesses.findMany({ columns: { id: true, timezone: true, settings: true } });
    } catch (e) {
      this.log.debug(`dailySummaryTick: ${(e as Error).message}`);
      return;
    }
    for (const b of all) {
      const hour = b.settings?.dailySummaryHour;
      if (hour == null) continue;
      const lp = localParts(now, b.timezone);
      if (lp.hour !== hour) continue;
      const key = `${b.id}:${lp.date}`;
      if (this.sent.has(key)) continue;
      this.sent.add(key);
      try {
        await this.sendDailySummary(b.id, lp.date, b.timezone);
      } catch (e) {
        this.sent.delete(key);
        this.log.warn(`Resumen diario ${b.id}: ${(e as Error).message}`);
      }
    }
  }

  async sendDailySummary(businessId: string, date: string, tz: string) {
    const from = zonedTimeToUtc(date, 0, tz);
    const to = zonedTimeToUtc(addDays(date, 1), 0, tz);
    const r = await this.sales(businessId, { from, to });
    const req = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(requisitions)
      .where(and(eq(requisitions.businessId, businessId), gte(requisitions.createdAt, from), lt(requisitions.createdAt, to)));
    const reqCount = req[0]?.n ?? 0;
    const top = r.topProducts[0];
    const channels = r.byChannel.map((c) => `${c.label} ${c.ordersCount}`).join(', ') || 'sin pedidos';
    const body = [
      `Ventas: ${formatMoney(r.totals.salesCents)} en ${r.totals.ordersCount} pedidos (ticket promedio ${formatMoney(r.totals.avgTicketCents)}).`,
      `Canales: ${channels}.`,
      r.totals.cancelledCount + r.totals.rejectedCount ? `Cancelados/rechazados: ${r.totals.cancelledCount + r.totals.rejectedCount}.` : '',
      top ? `Más vendido: ${top.name} (${top.quantity}).` : '',
      `Requisiciones del día: ${reqCount}.`,
    ].filter(Boolean).join(' ');
    await this.notifications.notifyManagers(businessId, {
      type: 'DAILY_SUMMARY',
      title: `Resumen del día ${date}`,
      body,
      link: `/admin/reportes?from=${date}&to=${date}`,
      data: { date, salesCents: r.totals.salesCents, ordersCount: r.totals.ordersCount, requisitionsCount: reqCount },
    });
    return { body, reqCount, report: r };
  }

  /** Para pruebas */
  resetSent() {
    this.sent.clear();
  }
}

