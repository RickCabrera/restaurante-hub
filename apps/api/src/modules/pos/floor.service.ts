import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { RT } from '@rh/shared';
import { z } from 'zod';
import { InjectDb, Db, DbOrTx } from '../../db/db.module';
import { branches, diningAreas, diningTables, tickets, users } from '../../db/schema';
import { RealtimeService, Rooms } from '../../realtime/realtime.service';
import { DiningAreaSchema, LayoutSchema, TableSchema } from './dto';
import { tableStatusFor } from './pos.logic';

type Table = typeof diningTables.$inferSelect;

/** Salones y mesas (POS-02). */
@Injectable()
export class FloorService {
  constructor(@InjectDb() private readonly db: Db, private readonly rt: RealtimeService) {}

  // ------------------------------------------------------------ salones
  listAreas(bid: string) {
    return this.db.query.diningAreas.findMany({ where: eq(diningAreas.businessId, bid), orderBy: [asc(diningAreas.sortOrder), asc(diningAreas.name)] });
  }

  private async checkBranch(bid: string, branchId?: string | null) {
    if (!branchId) return;
    const b = await this.db.query.branches.findFirst({ where: and(eq(branches.id, branchId), eq(branches.businessId, bid)) });
    if (!b) throw new BadRequestException('Sucursal inválida');
  }

  async createArea(bid: string, dto: z.infer<typeof DiningAreaSchema>) {
    await this.checkBranch(bid, dto.branchId);
    const count = (await this.listAreas(bid)).length;
    const [a] = await this.db.insert(diningAreas).values({ businessId: bid, name: dto.name, branchId: dto.branchId ?? null, sortOrder: dto.sortOrder ?? count }).returning();
    this.changed(bid);
    return a;
  }

  async updateArea(bid: string, id: string, dto: Partial<z.infer<typeof DiningAreaSchema>>) {
    await this.checkBranch(bid, dto.branchId);
    const [a] = await this.db.update(diningAreas).set(dto).where(and(eq(diningAreas.id, id), eq(diningAreas.businessId, bid))).returning();
    if (!a) throw new NotFoundException('Salón no encontrado');
    this.changed(bid);
    return a;
  }

  async deleteArea(bid: string, id: string) {
    const area = await this.getArea(bid, id);
    const ts = await this.db.query.diningTables.findMany({ where: eq(diningTables.diningAreaId, area.id), columns: { id: true } });
    if (ts.length) {
      const open = await this.db.query.tickets.findFirst({
        where: and(inArray(tickets.tableId, ts.map((t) => t.id)), inArray(tickets.status, ['ABIERTA', 'POR_COBRAR'])),
      });
      if (open) throw new ConflictException('Hay cuentas abiertas en este salón');
    }
    await this.db.delete(diningAreas).where(eq(diningAreas.id, id));
    this.changed(bid);
    return { ok: true };
  }

  async reorderAreas(bid: string, ids: string[]) {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(diningAreas).set({ sortOrder: i }).where(and(eq(diningAreas.id, id), eq(diningAreas.businessId, bid)));
      }
    });
    this.changed(bid);
    return this.listAreas(bid);
  }

  private async getArea(bid: string, id: string) {
    const a = await this.db.query.diningAreas.findFirst({ where: and(eq(diningAreas.id, id), eq(diningAreas.businessId, bid)) });
    if (!a) throw new NotFoundException('Salón no encontrado');
    return a;
  }

  // ------------------------------------------------------------ mesas
  async listTables(bid: string) {
    return this.db
      .select({ table: diningTables })
      .from(diningTables)
      .innerJoin(diningAreas, eq(diningAreas.id, diningTables.diningAreaId))
      .where(eq(diningAreas.businessId, bid))
      .orderBy(asc(diningAreas.sortOrder), asc(diningTables.name))
      .then((r) => r.map((x) => x.table));
  }

  /** Mesa del negocio (lanza 404). */
  async getTable(bid: string, id: string, tx: DbOrTx = this.db): Promise<Table> {
    const r = await tx
      .select({ table: diningTables })
      .from(diningTables)
      .innerJoin(diningAreas, eq(diningAreas.id, diningTables.diningAreaId))
      .where(and(eq(diningTables.id, id), eq(diningAreas.businessId, bid)));
    if (!r[0]) throw new NotFoundException('Mesa no encontrada');
    return r[0].table;
  }

  async createTable(bid: string, dto: z.infer<typeof TableSchema>) {
    await this.getArea(bid, dto.diningAreaId);
    const [t] = await this.db.insert(diningTables).values(dto).returning();
    this.changed(bid);
    return t;
  }

  async updateTable(bid: string, id: string, dto: Partial<z.infer<typeof TableSchema>>) {
    await this.getTable(bid, id);
    if (dto.diningAreaId) await this.getArea(bid, dto.diningAreaId);
    const [t] = await this.db.update(diningTables).set(dto).where(eq(diningTables.id, id)).returning();
    this.rt.emit([Rooms.pos(bid), Rooms.managers(bid)], RT.TABLE_UPDATED, t);
    return t;
  }

  async deleteTable(bid: string, id: string) {
    const t = await this.getTable(bid, id);
    const open = await this.db.query.tickets.findFirst({ where: and(eq(tickets.tableId, t.id), inArray(tickets.status, ['ABIERTA', 'POR_COBRAR'])) });
    if (open) throw new ConflictException('La mesa tiene una cuenta abierta');
    // conserva el historial: si tiene cuentas cerradas solo se desactiva
    const any = await this.db.query.tickets.findFirst({ where: eq(tickets.tableId, t.id), columns: { id: true } });
    if (any) await this.db.update(diningTables).set({ active: false }).where(eq(diningTables.id, id));
    else await this.db.delete(diningTables).where(eq(diningTables.id, id));
    this.changed(bid);
    return { ok: true, deactivated: !!any };
  }

  async saveLayout(bid: string, items: z.infer<typeof LayoutSchema>) {
    const own = new Set((await this.listTables(bid)).map((t) => t.id));
    const bad = items.find((i) => !own.has(i.id));
    if (bad) throw new BadRequestException('Mesa inválida en el plano');
    await this.db.transaction(async (tx) => {
      for (const i of items) {
        await tx.update(diningTables).set({ posX: i.posX, posY: i.posY, ...(i.shape ? { shape: i.shape } : {}) }).where(eq(diningTables.id, i.id));
      }
    });
    this.changed(bid);
    return this.listTables(bid);
  }

  /** Recalcula el estado de la mesa según sus cuentas abiertas. */
  async refreshTableStatus(tx: DbOrTx, tableId: string | null | undefined): Promise<Table | null> {
    if (!tableId) return null;
    const open = await tx.query.tickets.findMany({
      where: and(eq(tickets.tableId, tableId), inArray(tickets.status, ['ABIERTA', 'POR_COBRAR'])),
      columns: { status: true },
    });
    const [t] = await tx.update(diningTables).set({ status: tableStatusFor(open.map((o) => o.status)) }).where(eq(diningTables.id, tableId)).returning();
    return t ?? null;
  }

  emitTable(bid: string, t: Table | null) {
    if (t) this.rt.emit([Rooms.pos(bid), Rooms.managers(bid)], RT.TABLE_UPDATED, t);
  }

  private changed(bid: string) {
    this.rt.emit([Rooms.pos(bid), Rooms.managers(bid)], RT.TABLE_UPDATED, { layoutChanged: true });
  }

  /** Plano: salones con mesas y resumen de la cuenta abierta. */
  async floor(bid: string) {
    const areasRows = await this.listAreas(bid);
    const tableRows = (await this.listTables(bid)).filter((t) => t.active);
    const open = tableRows.length
      ? await this.db
        .select({ t: tickets, waiterName: users.name })
        .from(tickets)
        .leftJoin(users, eq(users.id, tickets.waiterId))
        .where(and(eq(tickets.businessId, bid), inArray(tickets.status, ['ABIERTA', 'POR_COBRAR']), inArray(tickets.tableId, tableRows.map((t) => t.id))))
        .orderBy(asc(tickets.openedAt))
      : [];
    return areasRows.map((a) => ({
      ...a,
      tables: tableRows
        .filter((t) => t.diningAreaId === a.id)
        .map((t) => {
          const ts = open.filter((o) => o.t.tableId === t.id);
          const summary = (o: (typeof open)[number]) => ({
            id: o.t.id,
            folio: o.t.folio,
            status: o.t.status,
            totalCents: o.t.totalCents,
            paidCents: o.t.paidCents,
            guests: o.t.guests,
            waiterId: o.t.waiterId,
            waiterName: o.waiterName,
            openedAt: o.t.openedAt,
          });
          return { ...t, ticket: ts[0] ? summary(ts[0]) : null, tickets: ts.map(summary) };
        }),
    }));
  }
}
