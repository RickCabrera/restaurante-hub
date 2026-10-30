import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { PaymentMethodLabel } from '@rh/shared';
import { InjectDb, Db } from '../../db/db.module';
import {
  cashSessions, diningAreas, diningTables, menuCategories, payments, productModifierGroups,
  products, ticketItems, tickets, users,
} from '../../db/schema';
import { SettingsService } from '../../settings/settings.service';
import { hourInTz, startOfDayInTz } from './pos.logic';

/** Reportes POS (POS-09) y menú del punto de venta. */
@Injectable()
export class PosReportsService {
  constructor(@InjectDb() private readonly db: Db, private readonly settings: SettingsService) {}

  private async range(bid: string, q: { from?: string; to?: string }) {
    const tz = (await this.settings.getBusiness(bid)).timezone;
    const parse = (v: string, end: boolean) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const d = startOfDayInTz(tz, new Date(`${v}T12:00:00Z`));
        return end ? new Date(d.getTime() + 86400_000 - 1) : d;
      }
      return new Date(v);
    };
    const from = q.from ? parse(q.from, false) : startOfDayInTz(tz);
    const to = q.to ? parse(q.to, true) : new Date();
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) throw new BadRequestException('Rango de fechas inválido');
    return { from, to, tz };
  }

  async report(bid: string, q: { from?: string; to?: string }) {
    const { from, to, tz } = await this.range(bid, q);
    const paid = await this.db
      .select({
        t: tickets,
        waiterName: users.name,
        tableName: diningTables.name,
        diningAreaId: diningAreas.id,
        diningAreaName: diningAreas.name,
      })
      .from(tickets)
      .leftJoin(users, eq(users.id, tickets.waiterId))
      .leftJoin(diningTables, eq(diningTables.id, tickets.tableId))
      .leftJoin(diningAreas, eq(diningAreas.id, diningTables.diningAreaId))
      .where(and(eq(tickets.businessId, bid), eq(tickets.status, 'PAGADA'), gte(tickets.closedAt, from), lte(tickets.closedAt, to)));

    // Ventas netas (sin propina)
    const net = (t: typeof tickets.$inferSelect) => t.totalCents - t.tipCents;
    const agg = <K extends string>(keyOf: (r: (typeof paid)[number]) => { key: K; name: string }) => {
      const m = new Map<string, { id: string; name: string; tickets: number; salesCents: number; tipsCents: number; guests: number }>();
      for (const r of paid) {
        const k = keyOf(r);
        const cur = m.get(k.key) ?? { id: k.key, name: k.name, tickets: 0, salesCents: 0, tipsCents: 0, guests: 0 };
        cur.tickets += 1;
        cur.salesCents += net(r.t);
        cur.tipsCents += r.t.tipCents;
        cur.guests += r.t.guests;
        m.set(k.key, cur);
      }
      return [...m.values()].sort((a, b) => b.salesCents - a.salesCents);
    };
    const byWaiter = agg((r) => ({ key: r.t.waiterId ?? 'none', name: r.waiterName ?? 'Sin mesero' }));
    const byTable = agg((r) => ({
      key: r.t.tableId ?? r.t.serviceType,
      name: r.tableName ? `Mesa ${r.tableName}` : r.t.serviceType === 'PARA_LLEVAR' ? 'Para llevar' : 'Mostrador',
    }));
    const byDiningArea = agg((r) => ({ key: r.diningAreaId ?? r.t.serviceType, name: r.diningAreaName ?? (r.t.serviceType === 'PARA_LLEVAR' ? 'Para llevar' : 'Mostrador') }));

    // Pagos por método (por fecha del pago)
    const pays = await this.db
      .select({ p: payments })
      .from(payments)
      .innerJoin(tickets, eq(tickets.id, payments.ticketId))
      .where(and(eq(tickets.businessId, bid), gte(payments.createdAt, from), lte(payments.createdAt, to)));
    const paymentsByMethod = (['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'] as const).map((m) => {
      const ps = pays.filter((x) => x.p.method === m);
      return {
        method: m,
        label: PaymentMethodLabel[m],
        count: ps.length,
        amountCents: ps.reduce((s, x) => s + x.p.amountCents, 0),
        tipsCents: ps.reduce((s, x) => s + x.p.tipCents, 0),
      };
    });

    // Ventas por hora (hora local del cierre)
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, tickets: 0, salesCents: 0 }));
    for (const r of paid) {
      const h = hourInTz(tz, r.t.closedAt!);
      hourly[h].tickets += 1;
      hourly[h].salesCents += net(r.t);
    }

    // Cancelaciones
    const cancelledTickets = await this.db
      .select({ t: tickets, byName: users.name })
      .from(tickets)
      .leftJoin(users, eq(users.id, tickets.cancelledById))
      .where(and(eq(tickets.businessId, bid), eq(tickets.status, 'CANCELADA'), isNull(tickets.mergedIntoId), gte(tickets.closedAt, from), lte(tickets.closedAt, to)))
      .orderBy(asc(tickets.closedAt));
    const cancelledLines = await this.db
      .select({ i: ticketItems, folio: tickets.folio, byName: users.name })
      .from(ticketItems)
      .innerJoin(tickets, eq(tickets.id, ticketItems.ticketId))
      .leftJoin(users, eq(users.id, ticketItems.cancelledById))
      .where(and(eq(tickets.businessId, bid), isNotNull(ticketItems.cancelledAt), gte(ticketItems.cancelledAt, from), lte(ticketItems.cancelledAt, to)))
      .orderBy(asc(ticketItems.cancelledAt));

    // Descuentos y cortesías (cuentas cobradas)
    const paidIds = paid.map((r) => r.t.id);
    const discountedLines = paidIds.length
      ? await this.db
        .select({ i: ticketItems, folio: tickets.folio })
        .from(ticketItems)
        .innerJoin(tickets, eq(tickets.id, ticketItems.ticketId))
        .where(and(inArray(ticketItems.ticketId, paidIds), isNull(ticketItems.cancelledAt), sql`(${ticketItems.isCourtesy} OR ${ticketItems.discountCents} > 0)`))
      : [];

    const cuts = await this.db
      .select({ s: cashSessions, cashierName: users.name })
      .from(cashSessions)
      .leftJoin(users, eq(users.id, cashSessions.cashierId))
      .where(and(eq(cashSessions.businessId, bid), gte(cashSessions.openedAt, from), lte(cashSessions.openedAt, to)))
      .orderBy(asc(cashSessions.openedAt));

    const salesCents = paid.reduce((s, r) => s + net(r.t), 0);
    return {
      from, to,
      totals: {
        tickets: paid.length,
        guests: paid.reduce((s, r) => s + r.t.guests, 0),
        salesCents,
        tipsCents: paid.reduce((s, r) => s + r.t.tipCents, 0),
        discountsCents: paid.reduce((s, r) => s + r.t.discountCents, 0) + discountedLines.reduce((s, r) => s + r.i.discountCents, 0),
        averageTicketCents: paid.length ? Math.round(salesCents / paid.length) : 0,
        cancelledTickets: cancelledTickets.length,
        cancelledLines: cancelledLines.length,
      },
      byWaiter,
      tipsByWaiter: byWaiter.map((w) => ({ id: w.id, name: w.name, tipsCents: w.tipsCents, tickets: w.tickets })).sort((a, b) => b.tipsCents - a.tipsCents),
      byTable,
      byDiningArea,
      paymentsByMethod,
      hourly,
      cancellations: {
        tickets: cancelledTickets.map((r) => ({ id: r.t.id, folio: r.t.folio, totalCents: r.t.totalCents, reason: r.t.cancelReason, by: r.byName, at: r.t.closedAt })),
        lines: cancelledLines.map((r) => ({
          id: r.i.id, ticketId: r.i.ticketId, folio: r.folio, product: r.i.productName, quantity: r.i.quantity,
          amountCents: (r.i.unitPriceCents + r.i.modifiers.reduce((s, m) => s + m.priceCents * m.quantity, 0)) * r.i.quantity,
          reason: r.i.cancelReason, by: r.byName, at: r.i.cancelledAt,
        })),
      },
      discounts: {
        tickets: paid.filter((r) => r.t.discountCents > 0).map((r) => ({ id: r.t.id, folio: r.t.folio, discountCents: r.t.discountCents, reason: r.t.discountReason })),
        lines: discountedLines.filter((r) => !r.i.isCourtesy).map((r) => ({ id: r.i.id, folio: r.folio, product: r.i.productName, discountCents: r.i.discountCents, reason: r.i.discountReason })),
        courtesies: discountedLines.filter((r) => r.i.isCourtesy).map((r) => ({ id: r.i.id, folio: r.folio, product: r.i.productName, quantity: r.i.quantity, amountCents: r.i.discountCents, reason: r.i.discountReason })),
      },
      cashCuts: cuts.map((r) => ({
        id: r.s.id, folio: r.s.folio, cashierName: r.cashierName, openedAt: r.s.openedAt, closedAt: r.s.closedAt,
        openingCents: r.s.openingCents, expectedCents: r.s.expectedCents, countedCents: r.s.countedCents, differenceCents: r.s.differenceCents,
      })),
    };
  }

  /** Menú del POS: categorías activas con productos visibles en POS y sus grupos de modificadores. */
  async menu(bid: string) {
    const cats = await this.db.query.menuCategories.findMany({
      where: and(eq(menuCategories.businessId, bid), eq(menuCategories.active, true)),
      orderBy: [asc(menuCategories.sortOrder), asc(menuCategories.name)],
    });
    const prods = await this.db.query.products.findMany({
      where: and(eq(products.businessId, bid), eq(products.active, true), eq(products.showInPos, true)),
      orderBy: [asc(products.sortOrder), asc(products.name)],
      with: {
        modifierGroups: {
          orderBy: asc(productModifierGroups.sortOrder),
          with: { group: { with: { modifiers: { orderBy: (m, { asc: a }) => [a(m.sortOrder)] } } } },
        },
      },
    });
    return cats
      .map((c) => ({
        id: c.id,
        name: c.name,
        imageUrl: c.imageUrl,
        sortOrder: c.sortOrder,
        products: prods.filter((p) => p.categoryId === c.id).map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          priceCents: p.priceCents,
          available: p.available,
          productionAreaId: p.productionAreaId,
          modifierGroups: p.modifierGroups.map((g) => ({
            id: g.group.id,
            name: g.group.name,
            minSelect: g.group.minSelect,
            maxSelect: g.group.maxSelect,
            modifiers: g.group.modifiers.map((m) => ({ id: m.id, name: m.name, priceCents: m.priceCents, available: m.available })),
          })),
        })),
      }))
      .filter((c) => c.products.length);
  }
}

