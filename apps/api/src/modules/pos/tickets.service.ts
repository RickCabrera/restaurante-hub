import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { CartLineInput, PaymentMethodLabel, RT, TicketStatus } from '@rh/shared';
import { BillTicketData, TicketLine, buildBillTicket, buildKitchenTicket } from '@rh/printing';
import { z } from 'zod';
import { InjectDb, Db, DbOrTx } from '../../db/db.module';
import { diningTables, payments, products, ticketItems, tickets } from '../../db/schema';
import type { Actor } from '../../common/actor';
import { AuditService } from '../../common/services/audit.service';
import { RealtimeService, Rooms } from '../../realtime/realtime.service';
import { SettingsService } from '../../settings/settings.service';
import { PrintingService } from '../printing/printing.service';
import { KdsService, serviceLabelForTicket } from '../printing/kds.service';
import { PrinterRow, paper, routeKitchenItems } from '../printing/printing.logic';
import { CashService } from './cash.service';
import { FloorService } from './floor.service';
import {
  DiscountDto, LineDiscountDto, OpenTicketDto, PatchLineSchema, PatchTicketSchema, SplitSchema, TicketsQuery, TipSchema,
} from './dto';
import { hasRole, requireRole, staffOf } from './pos.common';
import {
  PaymentInput, computeTicketTotals, discountNeedsAdmin, lineGrossCents, partitionForSplit, planPayments, resolveModifiers,
  splitEqual, startOfDayInTz, suggestedTips,
} from './pos.logic';

type Ticket = typeof tickets.$inferSelect;
type Item = typeof ticketItems.$inferSelect;
type Payment = typeof payments.$inferSelect;

const OPEN: TicketStatus[] = ['ABIERTA', 'POR_COBRAR'];

/** Cuentas del punto de venta (POS-03..06). */
@Injectable()
export class TicketsService {
  private readonly log = new Logger('PosTickets');

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly printing: PrintingService,
    private readonly kds: KdsService,
    private readonly floor: FloorService,
    private readonly cash: CashService,
    private readonly audit: AuditService,
    private readonly rt: RealtimeService,
  ) {}

  // =====================================================================
  // Lectura
  // =====================================================================

  async detail(bid: string, id: string, tx: DbOrTx = this.db) {
    const t = await tx.query.tickets.findFirst({
      where: and(eq(tickets.id, id), eq(tickets.businessId, bid)),
      with: {
        items: { orderBy: (i, { asc: a }) => [a(i.createdAt), a(i.id)] },
        payments: { orderBy: (p, { asc: a }) => [a(p.createdAt)] },
        table: { with: { diningArea: { columns: { id: true, name: true } } } },
        waiter: { columns: { id: true, name: true } },
      },
    });
    if (!t) throw new NotFoundException('Cuenta no encontrada');
    const s = await this.settings.getSettings(bid);
    const net = t.subtotalCents - t.discountCents;
    const active = t.items.filter((i) => !i.cancelledAt);
    return {
      ...t,
      tableName: t.table?.name ?? null,
      diningAreaName: t.table?.diningArea?.name ?? null,
      tableLabel: serviceLabelForTicket({ ...t, tableName: t.table?.name }),
      waiterName: t.waiter?.name ?? null,
      remainingCents: Math.max(0, t.totalCents - t.paidCents),
      unsentCount: active.filter((i) => !i.sentAt).length,
      suggestedTips: suggestedTips(net, s.tips ?? []),
    };
  }

  async list(bid: string, q: z.infer<typeof TicketsQuery>, actor: Actor) {
    const conds = [eq(tickets.businessId, bid)];
    const tz = (await this.settings.getBusiness(bid)).timezone;
    const today = startOfDayInTz(tz);
    switch (q.status) {
      case 'open': conds.push(inArray(tickets.status, OPEN)); break;
      case 'today': conds.push(or(inArray(tickets.status, OPEN), gte(tickets.openedAt, today))!); break;
      case 'paid': conds.push(eq(tickets.status, 'PAGADA'), gte(tickets.closedAt, today)); break;
      case 'cancelled': conds.push(eq(tickets.status, 'CANCELADA'), gte(tickets.closedAt, today)); break;
      case 'all': conds.push(gte(tickets.openedAt, new Date(today.getTime() - 7 * 86400_000))); break;
    }
    if (q.tableId) conds.push(eq(tickets.tableId, q.tableId));
    if (q.mine === 'true' || q.mine === '1') conds.push(eq(tickets.waiterId, staffOf(actor).userId));
    const rows = await this.db.query.tickets.findMany({
      where: and(...conds),
      with: { table: { columns: { id: true, name: true } }, waiter: { columns: { id: true, name: true } } },
      orderBy: [desc(tickets.openedAt)],
      limit: 300,
    });
    return rows.map((t) => ({
      ...t,
      tableName: t.table?.name ?? null,
      tableLabel: serviceLabelForTicket({ ...t, tableName: t.table?.name }),
      waiterName: t.waiter?.name ?? null,
      remainingCents: Math.max(0, t.totalCents - t.paidCents),
    }));
  }

  // =====================================================================
  // Helpers de escritura
  // =====================================================================

  private async lock(tx: DbOrTx, bid: string, id: string): Promise<Ticket> {
    const [t] = await tx.select().from(tickets).where(and(eq(tickets.id, id), eq(tickets.businessId, bid))).for('update');
    if (!t) throw new NotFoundException('Cuenta no encontrada');
    return t;
  }

  private assertOpen(t: Ticket) {
    if (!OPEN.includes(t.status)) {
      throw new ConflictException(t.status === 'PAGADA' ? 'La cuenta ya está pagada' : 'La cuenta está cancelada');
    }
  }

  /** Recalcula renglones y totales con los helpers de dinero compartidos. */
  async recalc(tx: DbOrTx, ticketId: string): Promise<Ticket> {
    const [t] = await tx.select().from(tickets).where(eq(tickets.id, ticketId));
    const items = await tx.select().from(ticketItems).where(eq(ticketItems.ticketId, ticketId));
    const pays = await tx.select().from(payments).where(eq(payments.ticketId, ticketId));
    const r = computeTicketTotals({
      lines: items,
      discountType: t.discountType,
      discountValue: t.discountValue,
      tipPercent: t.tipPercent,
      tipFixedCents: t.tipFixedCents,
      paymentTipsCents: pays.reduce((s, p) => s + p.tipCents, 0),
      paidAmountCents: pays.reduce((s, p) => s + p.amountCents, 0),
    });
    for (const [i, it] of items.entries()) {
      const c = r.lines[i];
      if (it.cancelledAt) continue;
      if (c.discountCents !== it.discountCents || c.totalCents !== it.totalCents) {
        await tx.update(ticketItems).set({ discountCents: c.discountCents, totalCents: c.totalCents }).where(eq(ticketItems.id, it.id));
      }
    }
    const [u] = await tx
      .update(tickets)
      .set({
        subtotalCents: r.subtotalCents,
        discountCents: r.discountCents,
        tipCents: r.tipCents,
        totalCents: r.totalCents,
        paidCents: r.paidCents,
      })
      .where(eq(tickets.id, ticketId))
      .returning();
    return u;
  }

  /** Emite la cuenta completa y el estado de mesas (fuera de la transacción). */
  private async publish(bid: string, ticketIds: (string | null | undefined)[], tableIds: (string | null | undefined)[] = []) {
    const out: Awaited<ReturnType<TicketsService['detail']>>[] = [];
    for (const id of new Set(ticketIds.filter((x): x is string => !!x))) {
      const d = await this.detail(bid, id);
      out.push(d);
      this.rt.emit([Rooms.pos(bid), Rooms.managers(bid)], RT.TICKET_UPDATED, d);
    }
    const ids = [...new Set(tableIds.filter((x): x is string => !!x))];
    if (ids.length) {
      const ts = await this.db.query.diningTables.findMany({ where: inArray(diningTables.id, ids) });
      for (const t of ts) this.floor.emitTable(bid, t);
    }
    return out;
  }

  // =====================================================================
  // Abrir cuenta / editar
  // =====================================================================

  async open(actor: Actor, dto: OpenTicketDto) {
    const bid = actor.businessId;
    const staff = staffOf(actor);
    const id = await this.db.transaction(async (tx) => {
      let tableId: string | null = null;
      if (dto.tableId) {
        const table = await this.floor.getTable(bid, dto.tableId, tx);
        const [locked] = await tx.select().from(diningTables).where(eq(diningTables.id, table.id)).for('update');
        if (!locked.active) throw new BadRequestException('La mesa está desactivada');
        const busy = await tx.query.tickets.findFirst({ where: and(eq(tickets.tableId, table.id), inArray(tickets.status, OPEN)) });
        if (busy || locked.status !== 'LIBRE') throw new ConflictException(`La mesa ${table.name} ya tiene una cuenta abierta`);
        tableId = table.id;
      }
      const folio = await this.settings.nextFolio(tx, bid, 'C');
      const [t] = await tx
        .insert(tickets)
        .values({
          businessId: bid,
          folio,
          tableId,
          serviceType: tableId ? 'MESA' : dto.serviceType!,
          label: dto.label ?? null,
          guests: dto.guests,
          notes: dto.notes ?? null,
          waiterId: staff.userId,
        })
        .returning();
      await this.floor.refreshTableStatus(tx, tableId);
      return t.id;
    });
    const [d] = await this.publish(bid, [id], [dto.tableId]);
    return d;
  }

  async patch(actor: Actor, id: string, dto: z.infer<typeof PatchTicketSchema>) {
    const bid = actor.businessId;
    await this.db.transaction(async (tx) => {
      const t = await this.lock(tx, bid, id);
      this.assertOpen(t);
      await tx.update(tickets).set(dto).where(eq(tickets.id, id));
    });
    return (await this.publish(bid, [id]))[0];
  }

  /** Precio en servidor desde productos/modificadores (igual que delivery). */
  private async priceLines(tx: DbOrTx, bid: string, lines: CartLineInput[]) {
    const ids = [...new Set(lines.map((l) => l.productId))];
    const prods = await tx.query.products.findMany({
      where: and(eq(products.businessId, bid), inArray(products.id, ids)),
      with: { modifierGroups: { with: { group: { with: { modifiers: true } } } } },
    });
    return lines.map((l) => {
      const p = prods.find((x) => x.id === l.productId);
      if (!p || !p.active) throw new BadRequestException('Producto no encontrado');
      if (!p.showInPos) throw new BadRequestException(`${p.name} no se vende en el punto de venta`);
      if (!p.available) throw new BadRequestException(`${p.name} está agotado`);
      const groups = p.modifierGroups.map((g) => g.group);
      const mods = resolveModifiers(p.name, groups, l.modifiers);
      if (!mods.ok) throw new BadRequestException(mods.error);
      const unit = p.priceCents;
      const line = {
        productId: p.id,
        productName: p.name,
        productionAreaId: p.productionAreaId,
        unitPriceCents: unit,
        quantity: l.quantity,
        modifiers: mods.modifiers,
        note: l.note?.trim() || null,
      };
      return { ...line, totalCents: lineGrossCents(line) };
    });
  }

  async addLines(actor: Actor, id: string, lines: CartLineInput[]) {
    const bid = actor.businessId;
    const t0 = await this.db.transaction(async (tx) => {
      const t = await this.lock(tx, bid, id);
      this.assertOpen(t);
      const priced = await this.priceLines(tx, bid, lines);
      await tx.insert(ticketItems).values(priced.map((p) => ({ ...p, ticketId: t.id })));
      // agregar productos regresa la cuenta a ABIERTA
      if (t.status === 'POR_COBRAR') await tx.update(tickets).set({ status: 'ABIERTA' }).where(eq(tickets.id, t.id));
      await this.recalc(tx, t.id);
      await this.floor.refreshTableStatus(tx, t.tableId);
      return t;
    });
    return (await this.publish(bid, [id], [t0.tableId]))[0];
  }

  private async lockLine(tx: DbOrTx, t: Ticket, lineId: string): Promise<Item> {
    const [it] = await tx.select().from(ticketItems).where(and(eq(ticketItems.id, lineId), eq(ticketItems.ticketId, t.id))).for('update');
    if (!it) throw new NotFoundException('Renglón no encontrado');
    if (it.cancelledAt) throw new ConflictException('El renglón ya está cancelado');
    return it;
  }

  async patchLine(actor: Actor, id: string, lineId: string, dto: z.infer<typeof PatchLineSchema>) {
    const bid = actor.businessId;
    await this.db.transaction(async (tx) => {
      const t = await this.lock(tx, bid, id);
      this.assertOpen(t);
      const it = await this.lockLine(tx, t, lineId);
      if (it.sentAt) throw new ConflictException('El producto ya se envió a cocina; cancélalo y agrégalo de nuevo');
      await tx.update(ticketItems).set({
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
      }).where(eq(ticketItems.id, it.id));
      await this.recalc(tx, t.id);
    });
    return (await this.publish(bid, [id]))[0];
  }

  /**
   * Cancela un renglón. Sin enviar: se elimina. Enviado: requiere CASHIER/ADMIN,
   * queda registrado con motivo y se avisa a cocina.
   */
  async cancelLine(actor: Actor, id: string, lineId: string, reason: string) {
    const bid = actor.businessId;
    const staff = staffOf(actor);
    const r = await this.db.transaction(async (tx) => {
      const t = await this.lock(tx, bid, id);
      this.assertOpen(t);
      const it = await this.lockLine(tx, t, lineId);
      if (!it.sentAt) {
        await tx.delete(ticketItems).where(eq(ticketItems.id, it.id));
      } else {
        requireRole(actor, ['CASHIER', 'ADMIN'], 'Solo caja o gerencia puede cancelar productos ya enviados a cocina');
        await tx.update(ticketItems).set({ cancelledAt: new Date(), cancelReason: reason, cancelledById: staff.userId, totalCents: 0, discountCents: 0 }).where(eq(ticketItems.id, it.id));
      }
      await this.recalc(tx, t.id);
      return { t, it };
    });
    if (r.it.sentAt) {
      await this.audit.record(actor, { businessId: bid, action: 'pos.line.cancel', entity: 'pos_ticket', entityId: id, data: { lineId, product: r.it.productName, quantity: r.it.quantity, totalCents: r.it.totalCents, reason } });
      await this.printCancellation(r.t, [r.it], reason, staff.name).catch((e) => this.log.warn(e.message));
    }
    return (await this.publish(bid, [id]))[0];
  }

  // =====================================================================
  // Cocina
  // =====================================================================

  private kitchenLabel(t: Ticket, tableName?: string | null) {
    return serviceLabelForTicket({ ...t, tableName }).toUpperCase();
  }

  private async tableName(t: Ticket) {
    if (!t.tableId) return null;
    return (await this.db.query.diningTables.findFirst({ where: eq(diningTables.id, t.tableId), columns: { name: true } }))?.name ?? null;
  }

  async send(actor: Actor, id: string) {
    const bid = actor.businessId;
    const staff = staffOf(actor);
    const r = await this.db.transaction(async (tx) => {
      const t = await this.lock(tx, bid, id);
      this.assertOpen(t);
      const items = await tx.select().from(ticketItems).where(and(eq(ticketItems.ticketId, t.id), isNull(ticketItems.cancelledAt)));
      const unsent = items.filter((i) => !i.sentAt);
      if (!unsent.length) throw new ConflictException('No hay productos nuevos por enviar');
      const isAddition = items.some((i) => i.sentAt);
      const now = new Date();
      await tx.update(ticketItems).set({ sentAt: now }).where(inArray(ticketItems.id, unsent.map((i) => i.id)));
      return { t, unsent, isAddition, now };
    });
    const { jobs, areaIds } = await this.printing.printKitchen({
      businessId: bid,
      folio: r.t.folio,
      serviceLabel: this.kitchenLabel(r.t, await this.tableName(r.t)),
      createdAt: r.now,
      waiterName: staff.name,
      notes: r.t.notes,
      isAddition: r.isAddition,
      items: r.unsent.map((i) => ({ productionAreaId: i.productionAreaId, quantity: i.quantity, name: i.productName, modifiers: i.modifiers, note: i.note })),
      refs: { ticketId: r.t.id },
    });
    this.kds.notifyKds(bid, areaIds, { source: 'TICKET', id: r.t.id });
    const [d] = await this.publish(bid, [id]);
    return { ...d, sentCount: r.unsent.length, printJobs: jobs.length, isAddition: r.isAddition };
  }

  /** Aviso a cocina de productos cancelados ya enviados. */
  private async printCancellation(t: Ticket, items: Item[], reason: string, by: string) {
    const ps = await this.printing.activePrinters(t.businessId);
    const label = this.kitchenLabel(t, await this.tableName(t));
    for (const g of routeKitchenItems(items, ps as PrinterRow[])) {
      const doc = buildKitchenTicket({
        folio: t.folio,
        areaName: 'CANCELADO',
        createdAt: new Date().toISOString(),
        serviceLabel: label,
        waiterName: by,
        lines: g.items.map((i) => ({ quantity: i.quantity, name: `NO PREPARAR: ${i.productName}`, modifiers: i.modifiers, note: i.note })),
        notes: `Motivo: ${reason}`,
        urgent: true,
      }, paper(g.printer));
      await this.printing.enqueue(t.businessId, g.printer.id, 'KITCHEN', doc, { ticketId: t.id });
    }
    const areaIds = [...new Set(items.map((i) => i.productionAreaId).filter((x): x is string => !!x))];
    this.kds.notifyKds(t.businessId, areaIds, { source: 'TICKET', id: t.id, cancelled: items.map((i) => i.id) });
  }

  // =====================================================================
  // Descuentos, cortesías y propinas (POS-04)
  // =====================================================================

  async discount(actor: Actor, id: string, dto: DiscountDto) {
    const bid = actor.businessId;
    await this.db.transaction(async (tx) => {
      const t = await this.lock(tx, bid, id);
      this.assertOpen(t);
      if (dto.value > 0 && discountNeedsAdmin(dto.type, dto.value, t.subtotalCents) && !hasRole(actor, 'ADMIN')) {
        throw new ForbiddenException('Descuentos mayores a 20 % requieren autorización de gerencia');
      }
      await tx.update(tickets).set(dto.value > 0
        ? { discountType: dto.type, discountValue: dto.value, discountReason: dto.reason ?? null }
        : { discountType: null, discountValue: null, discountReason: null }).where(eq(tickets.id, id));
      const u = await this.recalc(tx, id);
      if (u.paidCents > u.totalCents) throw new ConflictException('El descuento deja la cuenta por debajo de lo ya pagado');
    });
    await this.audit.record(actor, { businessId: bid, action: dto.value > 0 ? 'pos.ticket.discount' : 'pos.ticket.discount_remove', entity: 'pos_ticket', entityId: id, data: dto });
    return (await this.publish(bid, [id]))[0];
  }

  async lineDiscount(actor: Actor, id: string, lineId: string, dto: LineDiscountDto) {
    const bid = actor.businessId;
    await this.db.transaction(async (tx) => {
      const t = await this.lock(tx, bid, id);
      this.assertOpen(t);
      const it = await this.lockLine(tx, t, lineId);
      const gross = lineGrossCents(it);
      if (!dto.isCourtesy && dto.value > 0 && discountNeedsAdmin(dto.type, dto.value, gross) && !hasRole(actor, 'ADMIN')) {
        throw new ForbiddenException('Descuentos mayores a 20 % requieren autorización de gerencia');
      }
      const clear = !dto.isCourtesy && dto.value === 0;
      await tx.update(ticketItems).set({
        isCourtesy: dto.isCourtesy,
        discountType: dto.isCourtesy || clear ? null : dto.type,
        discountValue: dto.isCourtesy || clear ? null : dto.value,
        discountReason: clear ? null : dto.reason ?? null,
      }).where(eq(ticketItems.id, it.id));
      const u = await this.recalc(tx, id);
      if (u.paidCents > u.totalCents) throw new ConflictException('El descuento deja la cuenta por debajo de lo ya pagado');
    });
    await this.audit.record(actor, {
      businessId: bid,
      action: dto.isCourtesy ? 'pos.line.courtesy' : dto.value > 0 ? 'pos.line.discount' : 'pos.line.discount_remove',
      entity: 'pos_ticket', entityId: id, data: { lineId, ...dto },
    });
    return (await this.publish(bid, [id]))[0];
  }

  async tip(actor: Actor, id: string, dto: z.infer<typeof TipSchema>) {
    const bid = actor.businessId;
    await this.db.transaction(async (tx) => {
      const t = await this.lock(tx, bid, id);
      this.assertOpen(t);
      await tx.update(tickets).set({
        tipPercent: dto.percent ?? null,
        tipFixedCents: dto.percent === undefined ? dto.amountCents ?? null : null,
      }).where(eq(tickets.id, id));
      const u = await this.recalc(tx, id);
      if (u.paidCents > u.totalCents) throw new ConflictException('La propina no puede ser menor a lo ya pagado');
    });
    return (await this.publish(bid, [id]))[0];
  }

  // =====================================================================
  // Cuenta y cobro (POS-06)
  // =====================================================================

  async requestBill(actor: Actor, id: string) {
    const bid = actor.businessId;
    const t = await this.db.transaction(async (tx) => {
      const t0 = await this.lock(tx, bid, id);
      this.assertOpen(t0);
      const active = await tx.select({ id: ticketItems.id }).from(ticketItems).where(and(eq(ticketItems.ticketId, id), isNull(ticketItems.cancelledAt)));
      if (!active.length) throw new ConflictException('La cuenta no tiene productos');
      const [u] = await tx.update(tickets).set({ status: 'POR_COBRAR' }).where(eq(tickets.id, id)).returning();
      await this.floor.refreshTableStatus(tx, u.tableId);
      return u;
    });
    const jobs = await this.printBill(bid, id).catch((e) => { this.log.warn(e.message); return []; });
    const [d] = await this.publish(bid, [id], [t.tableId]);
    return { ...d, printJobs: jobs.length };
  }

  async pay(actor: Actor, id: string, inputs: PaymentInput[]) {
    const bid = actor.businessId;
    const staff = staffOf(actor);
    const r = await this.db.transaction(async (tx) => {
      const t = await this.lock(tx, bid, id);
      this.assertOpen(t);
      const session = await this.cash.sessionForPayment(tx, bid, staff.userId);
      const cur = await this.recalc(tx, id);
      const remaining = Math.max(0, cur.totalCents - cur.paidCents);
      const created: Payment[] = [];
      let changeCents = 0;
      if (remaining > 0) {
        const plan = planPayments(remaining, inputs);
        if (!plan.ok) throw new BadRequestException(plan.error);
        for (const p of plan.payments) {
          const [row] = await tx.insert(payments).values({ ...p, ticketId: id, cashSessionId: session.id, createdById: staff.userId }).returning();
          created.push(row);
        }
        changeCents = plan.changeCents;
      }
      const u = await this.recalc(tx, id);
      let status = u.status;
      if (u.paidCents >= u.totalCents) {
        status = 'PAGADA';
        await tx.update(tickets).set({ status, closedAt: new Date(), cashSessionId: session.id }).where(eq(tickets.id, id));
        await this.floor.refreshTableStatus(tx, u.tableId);
      }
      return { t: u, status, created, changeCents, session };
    });
    const hasCash = r.created.some((p) => p.method === 'EFECTIVO');
    const jobs = await this.printBill(bid, id, { openDrawer: hasCash }).catch((e) => { this.log.warn(e.message); return []; });
    const [d] = await this.publish(bid, [id], [r.t.tableId]);
    return {
      ...d,
      paidNow: r.created,
      changeCents: r.changeCents,
      isPaid: r.status === 'PAGADA',
      cashSessionId: r.session.id,
      printJobs: jobs.length,
    };
  }

  async cancel(actor: Actor, id: string, reason: string) {
    const bid = actor.businessId;
    const staff = staffOf(actor);
    const r = await this.db.transaction(async (tx) => {
      const t = await this.lock(tx, bid, id);
      this.assertOpen(t);
      const pays = await tx.select({ id: payments.id }).from(payments).where(eq(payments.ticketId, id));
      if (pays.length) throw new ConflictException('La cuenta tiene pagos registrados; no se puede cancelar');
      const pendingKitchen = await tx.select().from(ticketItems).where(and(
        eq(ticketItems.ticketId, id), isNull(ticketItems.cancelledAt), isNotNull(ticketItems.sentAt), isNull(ticketItems.kdsDoneAt),
      ));
      const [u] = await tx.update(tickets).set({ status: 'CANCELADA', cancelReason: reason, cancelledById: staff.userId, closedAt: new Date() }).where(eq(tickets.id, id)).returning();
      await this.floor.refreshTableStatus(tx, u.tableId);
      return { t: u, pendingKitchen };
    });
    await this.audit.record(actor, { businessId: bid, action: 'pos.ticket.cancel', entity: 'pos_ticket', entityId: id, data: { reason, totalCents: r.t.totalCents, folio: r.t.folio } });
    if (r.pendingKitchen.length) await this.printCancellation(r.t, r.pendingKitchen, reason, staff.name).catch((e) => this.log.warn(e.message));
    return (await this.publish(bid, [id], [r.t.tableId]))[0];
  }

  async print(actor: Actor, id: string, kind: 'bill' | 'kitchen') {
    const bid = actor.businessId;
    const t = await this.detail(bid, id);
    if (kind === 'bill') return { printJobs: (await this.printBill(bid, id)).length };
    const sent = t.items.filter((i) => i.sentAt && !i.cancelledAt);
    if (!sent.length) throw new ConflictException('No hay productos enviados a cocina');
    const { jobs } = await this.printing.printKitchen({
      businessId: bid,
      folio: t.folio,
      serviceLabel: t.tableLabel.toUpperCase(),
      createdAt: new Date(),
      waiterName: t.waiterName,
      notes: t.notes,
      isReprint: true,
      items: sent.map((i) => ({ productionAreaId: i.productionAreaId, quantity: i.quantity, name: i.productName, modifiers: i.modifiers, note: i.note })),
      refs: { ticketId: id },
    });
    return { printJobs: jobs.length };
  }

  /** Pre-cuenta (con propinas sugeridas) o comprobante de pago; abre cajón si se pide y la impresora lo tiene. */
  async printBill(bid: string, id: string, opts: { openDrawer?: boolean } = {}) {
    const t = await this.detail(bid, id);
    const business = await this.printing.businessInfo(bid);
    const isPaid = t.status === 'PAGADA';
    const lines: TicketLine[] = t.items.filter((i) => !i.cancelledAt).map((i) => ({
      quantity: i.quantity,
      name: i.isCourtesy ? `${i.productName} (cortesía)` : i.productName,
      modifiers: i.modifiers.map((m) => ({ name: m.name, quantity: m.quantity, priceCents: m.priceCents })),
      note: i.note,
      totalCents: i.totalCents,
    }));
    const data: BillTicketData = {
      business,
      folio: t.folio,
      createdAt: (t.closedAt ?? new Date()).toISOString(),
      tableLabel: t.tableLabel,
      waiterName: t.waiterName,
      guests: t.guests,
      lines,
      subtotalCents: t.subtotalCents,
      discountCents: t.discountCents,
      tipCents: t.tipCents,
      totalCents: t.totalCents,
      payments: t.payments.map((p) => ({
        label: PaymentMethodLabel[p.method] + (p.reference ? ` (${p.reference})` : ''),
        amountCents: p.amountCents + p.tipCents,
        receivedCents: p.receivedCents,
        changeCents: p.changeCents,
      })),
      suggestedTips: isPaid || t.tipCents ? [] : t.suggestedTips,
      isPaid,
    };
    return this.printing.printToBillPrinters(
      bid,
      t.payments.length ? 'PAYMENT' : 'BILL',
      (p) => buildBillTicket(data, paper(p), !!opts.openDrawer && p.openDrawer),
      { ticketId: id },
    );
  }

  // =====================================================================
  // Dividir, juntar y mover (POS-05)
  // =====================================================================

  async split(actor: Actor, id: string, dto: z.infer<typeof SplitSchema>) {
    const bid = actor.businessId;
    if (dto.mode === 'equal') {
      const t = await this.detail(bid, id);
      if (!OPEN.includes(t.status)) throw new ConflictException('La cuenta no está abierta');
      return {
        mode: 'equal' as const,
        ticketId: id,
        totalCents: t.totalCents,
        paidCents: t.paidCents,
        remainingCents: t.remainingCents,
        parts: splitEqual(t.remainingCents, dto.parts),
      };
    }
    const staff = staffOf(actor);
    const r = await this.db.transaction(async (tx) => {
      const t = await this.lock(tx, bid, id);
      this.assertOpen(t);
      const items = await tx.select().from(ticketItems).where(and(eq(ticketItems.ticketId, id), isNull(ticketItems.cancelledAt)));
      const part = partitionForSplit(items, dto.lineIds);
      if (!part.ok) throw new BadRequestException(part.error);
      const moving = part.moving;
      const paid = await tx.select({ id: payments.id }).from(payments).where(eq(payments.ticketId, id));
      if (paid.length) throw new ConflictException('La cuenta ya tiene pagos; divídela en partes iguales');
      const folio = await this.settings.nextFolio(tx, bid, 'C');
      const [child] = await tx.insert(tickets).values({
        businessId: bid,
        folio,
        tableId: t.tableId,
        serviceType: t.serviceType,
        label: t.label,
        guests: 1,
        waiterId: t.waiterId ?? staff.userId,
        parentId: t.id,
        status: t.status,
        notes: t.notes,
      }).returning();
      await tx.update(ticketItems).set({ ticketId: child.id }).where(inArray(ticketItems.id, moving.map((m) => m.id)));
      await this.recalc(tx, t.id);
      await this.recalc(tx, child.id);
      await this.floor.refreshTableStatus(tx, t.tableId);
      return { t, child };
    });
    await this.audit.record(actor, { businessId: bid, action: 'pos.ticket.split', entity: 'pos_ticket', entityId: id, data: { newTicketId: r.child.id, lineIds: dto.lineIds } });
    const [orig, child] = await this.publish(bid, [id, r.child.id], [r.t.tableId]);
    return { mode: 'lines' as const, ticket: orig, newTicket: child };
  }

  async merge(actor: Actor, id: string, sourceTicketId: string) {
    const bid = actor.businessId;
    if (id === sourceTicketId) throw new BadRequestException('Elige otra cuenta para juntar');
    const r = await this.db.transaction(async (tx) => {
      // bloqueo en orden fijo para evitar interbloqueos
      const [a, b] = [id, sourceTicketId].sort();
      const la = await this.lock(tx, bid, a);
      const lb = await this.lock(tx, bid, b);
      const target = la.id === id ? la : lb;
      const source = la.id === id ? lb : la;
      this.assertOpen(target);
      this.assertOpen(source);
      const paid = await tx.select({ id: payments.id }).from(payments).where(eq(payments.ticketId, source.id));
      if (paid.length) throw new ConflictException('La cuenta a juntar ya tiene pagos');
      await tx.update(ticketItems).set({ ticketId: target.id }).where(eq(ticketItems.ticketId, source.id));
      await tx.update(tickets).set({ guests: target.guests + source.guests, status: 'ABIERTA' }).where(eq(tickets.id, target.id));
      await tx.update(tickets).set({
        status: 'CANCELADA', mergedIntoId: target.id, cancelReason: `Unida a la cuenta ${target.folio}`, closedAt: new Date(),
        subtotalCents: 0, discountCents: 0, tipCents: 0, totalCents: 0,
      }).where(eq(tickets.id, source.id));
      await this.recalc(tx, target.id);
      await this.floor.refreshTableStatus(tx, source.tableId);
      await this.floor.refreshTableStatus(tx, target.tableId);
      return { target, source };
    });
    await this.audit.record(actor, { businessId: bid, action: 'pos.ticket.merge', entity: 'pos_ticket', entityId: id, data: { sourceTicketId, sourceFolio: r.source.folio } });
    const [d] = await this.publish(bid, [id, sourceTicketId], [r.source.tableId, r.target.tableId]);
    return d;
  }

  async move(actor: Actor, id: string, tableId: string) {
    const bid = actor.businessId;
    const r = await this.db.transaction(async (tx) => {
      const t = await this.lock(tx, bid, id);
      this.assertOpen(t);
      if (t.tableId === tableId) throw new BadRequestException('La cuenta ya está en esa mesa');
      const table = await this.floor.getTable(bid, tableId, tx);
      const [locked] = await tx.select().from(diningTables).where(eq(diningTables.id, table.id)).for('update');
      if (!locked.active) throw new BadRequestException('La mesa está desactivada');
      const busy = await tx.query.tickets.findFirst({ where: and(eq(tickets.tableId, table.id), inArray(tickets.status, OPEN)) });
      if (busy) throw new ConflictException(`La mesa ${table.name} está ocupada; usa "juntar cuentas"`);
      await tx.update(tickets).set({ tableId: table.id, serviceType: 'MESA' }).where(eq(tickets.id, id));
      await this.floor.refreshTableStatus(tx, t.tableId);
      await this.floor.refreshTableStatus(tx, table.id);
      return { from: t.tableId, to: table.id };
    });
    await this.audit.record(actor, { businessId: bid, action: 'pos.ticket.move', entity: 'pos_ticket', entityId: id, data: r });
    return (await this.publish(bid, [id], [r.from, r.to]))[0];
  }
}

