import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { buildCashCutTicket } from '@rh/printing';
import { z } from 'zod';
import { InjectDb, Db, DbOrTx } from '../../db/db.module';
import { branches, cashMovements, cashSessions, payments, ticketItems, tickets, users } from '../../db/schema';
import type { Actor } from '../../common/actor';
import { AuditService } from '../../common/services/audit.service';
import { RealtimeService, Rooms } from '../../realtime/realtime.service';
import { SettingsService } from '../../settings/settings.service';
import { PrintingService } from '../printing/printing.service';
import { paper } from '../printing/printing.logic';
import { CloseCashSchema, OpenCashSchema } from './dto';
import { hasRole, staffOf } from './pos.common';
import { computeCashSummary, startOfDayInTz } from './pos.logic';

type Session = typeof cashSessions.$inferSelect;

/** Evento local (no existe en RT de @rh/shared): la caja cambió. */
export const POS_CASH_UPDATED = 'pos.cash.updated';

/** Caja y cortes X / Z (POS-07). */
@Injectable()
export class CashService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly printing: PrintingService,
    private readonly audit: AuditService,
    private readonly rt: RealtimeService,
  ) {}

  async open(actor: Actor, dto: z.infer<typeof OpenCashSchema>) {
    const staff = staffOf(actor);
    const bid = actor.businessId;
    if (dto.branchId) {
      const b = await this.db.query.branches.findFirst({ where: and(eq(branches.id, dto.branchId), eq(branches.businessId, bid)) });
      if (!b) throw new BadRequestException('Sucursal inválida');
    }
    const s = await this.db.transaction(async (tx) => {
      // serializa aperturas del mismo cajero
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'cash:' + staff.userId}))`);
      const cur = await this.openSessionOf(tx, bid, staff.userId);
      if (cur) throw new ConflictException(`Ya tienes la caja ${cur.folio} abierta`);
      const folio = await this.settings.nextFolio(tx, bid, 'CAJA');
      const [row] = await tx
        .insert(cashSessions)
        .values({ businessId: bid, branchId: dto.branchId ?? null, folio, cashierId: staff.userId, openingCents: dto.openingCents })
        .returning();
      return row;
    });
    await this.audit.record(actor, { businessId: bid, action: 'cash.open', entity: 'cash_session', entityId: s.id, data: { openingCents: s.openingCents } });
    this.emit(bid, s);
    return this.withSummary(s);
  }

  openSessionOf(tx: DbOrTx, bid: string, cashierId: string) {
    return tx.query.cashSessions.findFirst({
      where: and(eq(cashSessions.businessId, bid), eq(cashSessions.cashierId, cashierId), isNull(cashSessions.closedAt)),
      orderBy: desc(cashSessions.openedAt),
    });
  }

  /**
   * Caja para registrar un cobro: la del cajero que cobra; si no tiene (p. ej. gerente),
   * la caja abierta más reciente del negocio. Sin caja → 409.
   */
  async sessionForPayment(tx: DbOrTx, bid: string, staffUserId: string): Promise<Session> {
    const own = await this.openSessionOf(tx, bid, staffUserId);
    if (own) return own;
    const any = await tx.query.cashSessions.findFirst({
      where: and(eq(cashSessions.businessId, bid), isNull(cashSessions.closedAt)),
      orderBy: desc(cashSessions.openedAt),
    });
    if (!any) throw new ConflictException('Abre la caja primero');
    return any;
  }

  async current(actor: Actor) {
    const staff = staffOf(actor);
    const s = await this.openSessionOf(this.db, actor.businessId, staff.userId);
    return s ? this.withSummary(s) : null;
  }

  async get(bid: string, id: string): Promise<Session> {
    const s = await this.db.query.cashSessions.findFirst({ where: and(eq(cashSessions.id, id), eq(cashSessions.businessId, bid)) });
    if (!s) throw new NotFoundException('Caja no encontrada');
    return s;
  }

  /** El cajero opera su propia caja; gerentes cualquiera. */
  private assertCanOperate(actor: Actor, s: Session) {
    const staff = staffOf(actor);
    if (s.cashierId !== staff.userId && !hasRole(actor, 'ADMIN')) throw new ForbiddenException('Esta caja es de otro cajero');
  }

  async addMovement(actor: Actor, id: string, dto: { type: 'ENTRADA' | 'SALIDA'; amountCents: number; reason: string }) {
    const s = await this.get(actor.businessId, id);
    this.assertCanOperate(actor, s);
    if (s.closedAt) throw new ConflictException('La caja ya está cerrada');
    const staff = staffOf(actor);
    const [m] = await this.db
      .insert(cashMovements)
      .values({ cashSessionId: s.id, type: dto.type, amountCents: dto.amountCents, reason: dto.reason, source: 'MANUAL', createdById: staff.userId })
      .returning();
    await this.audit.record(actor, { businessId: actor.businessId, action: `cash.${dto.type.toLowerCase()}`, entity: 'cash_session', entityId: s.id, data: dto });
    this.emit(actor.businessId, s);
    return m;
  }

  /** Resumen de la caja: ventas por método, propinas, movimientos, efectivo esperado. */
  async summary(bid: string, sessionOrId: string | Session) {
    const s = typeof sessionOrId === 'string' ? await this.get(bid, sessionOrId) : sessionOrId;
    const pays = await this.db.query.payments.findMany({ where: eq(payments.cashSessionId, s.id) });
    const movs = await this.db.query.cashMovements.findMany({ where: eq(cashMovements.cashSessionId, s.id), orderBy: asc(cashMovements.createdAt) });
    const paidTickets = await this.db.query.tickets.findMany({
      where: and(eq(tickets.businessId, bid), eq(tickets.cashSessionId, s.id), eq(tickets.status, 'PAGADA')),
      columns: { id: true, tipCents: true, discountCents: true },
    });
    const until = s.closedAt ?? new Date();
    const cancelled = await this.db.query.tickets.findMany({
      where: and(
        eq(tickets.businessId, bid), eq(tickets.status, 'CANCELADA'), isNull(tickets.mergedIntoId),
        gte(tickets.closedAt, s.openedAt), lte(tickets.closedAt, until),
      ),
      columns: { id: true },
    });
    const cancelledLines = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(ticketItems)
      .innerJoin(tickets, eq(tickets.id, ticketItems.ticketId))
      .where(and(eq(tickets.businessId, bid), gte(ticketItems.cancelledAt, s.openedAt), lte(ticketItems.cancelledAt, until)));
    const base = computeCashSummary({
      openingCents: s.openingCents,
      payments: pays.map((p) => ({ method: p.method, amountCents: p.amountCents, tipCents: p.tipCents })),
      movements: movs.map((m) => ({ type: m.type, amountCents: m.amountCents, reason: m.reason, source: m.source })),
    });
    return {
      ...base,
      /** propinas de las cuentas cobradas en esta caja (sugeridas + capturadas en pagos) */
      tipsCents: paidTickets.reduce((a, t) => a + t.tipCents, 0),
      discountsCents: paidTickets.reduce((a, t) => a + t.discountCents, 0),
      movements: movs,
      ticketsCount: paidTickets.length,
      cancelledCount: cancelled.length,
      cancelledLinesCount: cancelledLines[0]?.n ?? 0,
      countedCents: s.countedCents,
      differenceCents: s.closedAt ? s.differenceCents : null,
    };
  }

  private async withSummary(s: Session) {
    const cashier = await this.db.query.users.findFirst({ where: eq(users.id, s.cashierId), columns: { name: true } });
    return { ...s, cashierName: cashier?.name ?? null, summary: await this.summary(s.businessId, s) };
  }

  async detail(bid: string, id: string) {
    return this.withSummary(await this.get(bid, id));
  }

  async cutX(actor: Actor, id: string) {
    const s = await this.get(actor.businessId, id);
    this.assertCanOperate(actor, s);
    const jobs = await this.printCut(s, 'X');
    return { session: await this.withSummary(s), printJobs: jobs.length };
  }

  async close(actor: Actor, id: string, dto: z.infer<typeof CloseCashSchema>) {
    const bid = actor.businessId;
    const s0 = await this.get(bid, id);
    this.assertCanOperate(actor, s0);
    if (s0.closedAt) throw new ConflictException('La caja ya está cerrada');
    const sum = await this.summary(bid, s0);
    const [s] = await this.db
      .update(cashSessions)
      .set({
        closedAt: new Date(),
        countedCents: dto.countedCents,
        expectedCents: sum.expectedCashCents,
        differenceCents: dto.countedCents - sum.expectedCashCents,
        notes: dto.notes ?? null,
      })
      .where(and(eq(cashSessions.id, id), isNull(cashSessions.closedAt)))
      .returning();
    if (!s) throw new ConflictException('La caja ya está cerrada');
    // Aviso (no bloquea): cuentas que siguen abiertas
    const open = await this.db.query.tickets.findMany({
      where: and(eq(tickets.businessId, bid), inArray(tickets.status, ['ABIERTA', 'POR_COBRAR'])),
      columns: { id: true, folio: true, totalCents: true, status: true },
    });
    await this.audit.record(actor, {
      businessId: bid, action: 'cash.close', entity: 'cash_session', entityId: s.id,
      data: { countedCents: s.countedCents, expectedCents: s.expectedCents, differenceCents: s.differenceCents },
    });
    const jobs = await this.printCut(s, 'Z');
    this.emit(bid, s);
    return {
      session: await this.withSummary(s),
      printJobs: jobs.length,
      warnings: open.length ? [`Quedan ${open.length} cuenta(s) abierta(s)`] : [],
      openTickets: open,
    };
  }

  private async printCut(s: Session, kind: 'X' | 'Z') {
    const sum = await this.summary(s.businessId, s);
    const business = await this.printing.businessInfo(s.businessId);
    const cashier = await this.db.query.users.findFirst({ where: eq(users.id, s.cashierId), columns: { name: true } });
    const label = (src: string, reason: string) =>
      src === 'DRIVER_SETTLEMENT' ? `Repartidor: ${reason}` : src === 'DELIVERY_CASH' ? `Delivery: ${reason}` : reason;
    return this.printing.printToBillPrinters(s.businessId, 'CASH_CUT', (p) => buildCashCutTicket({
      business,
      kind,
      sessionFolio: s.folio,
      cashierName: cashier?.name ?? '',
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
      openingCents: s.openingCents,
      salesByMethod: sum.salesByMethod.map((m) => ({ label: m.label, amountCents: m.amountCents + m.tipsCents, count: m.count })),
      tipsCents: sum.tipsCents,
      movements: sum.movements.map((m) => ({ label: label(m.source, m.reason), amountCents: m.type === 'ENTRADA' ? m.amountCents : -m.amountCents })),
      expectedCashCents: sum.expectedCashCents,
      countedCashCents: kind === 'Z' ? s.countedCents : null,
      differenceCents: kind === 'Z' ? s.differenceCents : null,
      ticketsCount: sum.ticketsCount,
      cancelledCount: sum.cancelledCount,
    }, paper(p)));
  }

  async list(bid: string, q: { from?: string; to?: string }) {
    const tz = (await this.settings.getBusiness(bid)).timezone;
    const from = q.from ? new Date(q.from) : new Date(startOfDayInTz(tz).getTime() - 30 * 86400_000);
    const to = q.to ? new Date(q.to.length <= 10 ? `${q.to}T23:59:59.999` : q.to) : new Date();
    if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new BadRequestException('Rango de fechas inválido');
    const rows = await this.db
      .select({ s: cashSessions, cashierName: users.name })
      .from(cashSessions)
      .leftJoin(users, eq(users.id, cashSessions.cashierId))
      .where(and(eq(cashSessions.businessId, bid), gte(cashSessions.openedAt, from), lte(cashSessions.openedAt, to)))
      .orderBy(desc(cashSessions.openedAt))
      .limit(500);
    return rows.map((r) => ({ ...r.s, cashierName: r.cashierName }));
  }

  private emit(bid: string, s: Session) {
    const payload = { id: s.id, folio: s.folio, cashierId: s.cashierId, openedAt: s.openedAt, closedAt: s.closedAt };
    this.rt.emit([Rooms.pos(bid), Rooms.managers(bid)], POS_CASH_UPDATED, payload);
  }
}

