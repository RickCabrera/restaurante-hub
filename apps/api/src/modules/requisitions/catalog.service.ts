import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import Papa from 'papaparse';
import { and, asc, count, eq, ilike, inArray, sql, SQL } from 'drizzle-orm';
import { RT } from '@rh/shared';
import type { UnitCode } from '@rh/shared';
import { InjectDb, Db, DbOrTx } from '../../db/db.module';
import { areas, requisitionItems, supplies, supplyAreas, supplyCategories, suppliers } from '../../db/schema';
import type { Actor } from '../../common/actor';
import { AuditService } from '../../common/services/audit.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { etagOf, normalizeKey, parseSupplyCsvRow } from './requisitions.logic';
import type { CreateSupplyDto, UpdateSupplyDto } from './dto';

type SupplyRow = typeof supplies.$inferSelect;

export interface SupplyView extends SupplyRow {
  areaIds: string[];
  category: { id: string; name: string; icon: string } | null;
  supplier: { id: string; name: string } | null;
}

export interface TabletSupply {
  id: string;
  categoryId: string;
  name: string;
  unit: UnitCode;
  step: number;
  maxPerOrder: number | null;
  icon: string | null;
  imageUrl: string | null;
  autoApprove: boolean;
  sortOrder: number;
}

export interface TabletCatalog {
  area: { id: string; name: string; color: string; icon: string; orderWindow: Record<string, { until: string }> };
  categories: { id: string; name: string; icon: string; sortOrder: number }[];
  supplies: TabletSupply[];
}

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  createdCategories: string[];
  createdSuppliers: string[];
  errors: { row: number; name: string | null; error: string }[];
  dryRun: boolean;
}

@Injectable()
export class CatalogService {
  constructor(@InjectDb() private readonly db: Db, private readonly audit: AuditService, private readonly rt: RealtimeService) {}

  private changed(bid: string, kind: string, id?: string) {
    this.rt.toBusiness(bid, RT.CATALOG_CHANGED, { kind, id: id ?? null, at: new Date().toISOString() });
  }

  // -------------------------------------------------------------- categorías
  listCategories(actor: Actor) {
    return this.db.query.supplyCategories.findMany({
      where: eq(supplyCategories.businessId, actor.businessId),
      orderBy: [asc(supplyCategories.sortOrder), asc(supplyCategories.name)],
    });
  }

  async createCategory(actor: Actor, dto: { name: string; icon: string }) {
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${supplyCategories.sortOrder}), 0)` })
      .from(supplyCategories)
      .where(eq(supplyCategories.businessId, actor.businessId));
    const [c] = await this.db.insert(supplyCategories).values({ ...dto, businessId: actor.businessId, sortOrder: Number(max) + 1 }).returning();
    this.changed(actor.businessId, 'category', c.id);
    return c;
  }

  async updateCategory(actor: Actor, id: string, dto: { name?: string; icon?: string }) {
    const [c] = await this.db
      .update(supplyCategories)
      .set(dto)
      .where(and(eq(supplyCategories.id, id), eq(supplyCategories.businessId, actor.businessId)))
      .returning();
    if (!c) throw new NotFoundException('Categoría no encontrada');
    this.changed(actor.businessId, 'category', id);
    return c;
  }

  async deleteCategory(actor: Actor, id: string) {
    const [{ n }] = await this.db.select({ n: count() }).from(supplies).where(eq(supplies.categoryId, id));
    if (n > 0) throw new ConflictException('La categoría tiene insumos; muévelos antes de borrarla');
    const r = await this.db
      .delete(supplyCategories)
      .where(and(eq(supplyCategories.id, id), eq(supplyCategories.businessId, actor.businessId)))
      .returning();
    if (!r.length) throw new NotFoundException('Categoría no encontrada');
    this.changed(actor.businessId, 'category', id);
    return { ok: true };
  }

  async reorderCategories(actor: Actor, ids: string[]) {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(supplyCategories).set({ sortOrder: i + 1 }).where(and(eq(supplyCategories.id, id), eq(supplyCategories.businessId, actor.businessId)));
      }
    });
    this.changed(actor.businessId, 'category');
    return this.listCategories(actor);
  }

  // -------------------------------------------------------------- proveedores
  async listSuppliers(actor: Actor) {
    const rows = await this.db.query.suppliers.findMany({ where: eq(suppliers.businessId, actor.businessId), orderBy: [asc(suppliers.name)] });
    const counts = await this.db
      .select({ supplierId: supplies.supplierId, n: count() })
      .from(supplies)
      .where(eq(supplies.businessId, actor.businessId))
      .groupBy(supplies.supplierId);
    return rows.map((s) => ({ ...s, supplyCount: counts.find((c) => c.supplierId === s.id)?.n ?? 0 }));
  }

  async getSupplier(actor: Actor, id: string) {
    const s = await this.db.query.suppliers.findFirst({ where: and(eq(suppliers.id, id), eq(suppliers.businessId, actor.businessId)) });
    if (!s) throw new NotFoundException('Proveedor no encontrado');
    const items = await this.db.query.supplies.findMany({
      where: and(eq(supplies.supplierId, id), eq(supplies.businessId, actor.businessId)),
      columns: { id: true, name: true, unit: true, active: true },
      orderBy: [asc(supplies.name)],
    });
    return { ...s, supplies: items };
  }

  async createSupplier(actor: Actor, dto: typeof suppliers.$inferInsert extends infer T ? Omit<T, 'businessId' | 'id'> : never) {
    const [s] = await this.db.insert(suppliers).values({ ...dto, businessId: actor.businessId }).returning();
    return s;
  }

  async updateSupplier(actor: Actor, id: string, dto: Partial<Omit<typeof suppliers.$inferInsert, 'businessId' | 'id'>>) {
    const [s] = await this.db.update(suppliers).set(dto).where(and(eq(suppliers.id, id), eq(suppliers.businessId, actor.businessId))).returning();
    if (!s) throw new NotFoundException('Proveedor no encontrado');
    return s;
  }

  async deleteSupplier(actor: Actor, id: string) {
    const r = await this.db.delete(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.businessId, actor.businessId))).returning();
    if (!r.length) throw new NotFoundException('Proveedor no encontrado');
    return { ok: true };
  }

  // -------------------------------------------------------------- insumos
  async listSupplies(actor: Actor, q: { categoryId?: string; areaId?: string; supplierId?: string; active?: boolean; q?: string }): Promise<SupplyView[]> {
    const conds: SQL[] = [eq(supplies.businessId, actor.businessId)];
    if (q.categoryId) conds.push(eq(supplies.categoryId, q.categoryId));
    if (q.supplierId) conds.push(eq(supplies.supplierId, q.supplierId));
    if (q.active !== undefined) conds.push(eq(supplies.active, q.active));
    if (q.q) conds.push(ilike(supplies.name, `%${q.q}%`));
    if (q.areaId) {
      conds.push(inArray(supplies.id, this.db.select({ id: supplyAreas.supplyId }).from(supplyAreas).where(eq(supplyAreas.areaId, q.areaId))));
    }
    const rows = await this.db.query.supplies.findMany({
      where: and(...conds),
      with: { areas: true, category: true, supplier: true },
      orderBy: [asc(supplies.sortOrder), asc(supplies.name)],
    });
    const list = rows.map((r) => this.toView(r));
    if (q.areaId) {
      const order = (s: (typeof rows)[number]) => s.areas.find((a) => a.areaId === q.areaId)?.sortOrder ?? 0;
      const byId = new Map(rows.map((r) => [r.id, order(r)]));
      list.sort((a, b) => (byId.get(a.id)! - byId.get(b.id)!) || a.name.localeCompare(b.name, 'es'));
    }
    return list;
  }

  private toView(
    r: SupplyRow & {
      areas: { areaId: string }[];
      category: { id: string; name: string; icon: string } | null;
      supplier: { id: string; name: string } | null;
    },
  ): SupplyView {
    const { areas: a, category, supplier, ...rest } = r;
    return {
      ...rest,
      areaIds: a.map((x) => x.areaId),
      category: category ? { id: category.id, name: category.name, icon: category.icon } : null,
      supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
    };
  }

  async getSupply(actor: Actor, id: string): Promise<SupplyView> {
    const r = await this.db.query.supplies.findFirst({
      where: and(eq(supplies.id, id), eq(supplies.businessId, actor.businessId)),
      with: { areas: true, category: true, supplier: true },
    });
    if (!r) throw new NotFoundException('Insumo no encontrado');
    return this.toView(r);
  }

  private async validateRefs(db: DbOrTx, bid: string, refs: { categoryId?: string; supplierId?: string | null; areaIds?: string[] }) {
    if (refs.categoryId) {
      const c = await db.select({ id: supplyCategories.id }).from(supplyCategories).where(and(eq(supplyCategories.id, refs.categoryId), eq(supplyCategories.businessId, bid)));
      if (!c.length) throw new BadRequestException('La categoría no existe');
    }
    if (refs.supplierId) {
      const s = await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, refs.supplierId), eq(suppliers.businessId, bid)));
      if (!s.length) throw new BadRequestException('El proveedor no existe');
    }
    if (refs.areaIds?.length) {
      const uniq = [...new Set(refs.areaIds)];
      const a = await db.select({ id: areas.id }).from(areas).where(and(eq(areas.businessId, bid), inArray(areas.id, uniq)));
      if (a.length !== uniq.length) throw new BadRequestException('Una de las áreas no existe');
    }
  }

  private async nextAreaOrder(db: DbOrTx, areaIds: string[]) {
    if (!areaIds.length) return new Map<string, number>();
    const rows = await db
      .select({ areaId: supplyAreas.areaId, max: sql<number>`coalesce(max(${supplyAreas.sortOrder}), 0)` })
      .from(supplyAreas)
      .where(inArray(supplyAreas.areaId, areaIds))
      .groupBy(supplyAreas.areaId);
    return new Map(areaIds.map((a) => [a, Number(rows.find((r) => r.areaId === a)?.max ?? 0) + 1]));
  }

  async createSupply(actor: Actor, dto: CreateSupplyDto) {
    const id = await this.db.transaction(async (tx) => {
      await this.validateRefs(tx, actor.businessId, dto);
      return this.insertSupply(tx, actor.businessId, dto);
    });
    this.changed(actor.businessId, 'supply', id);
    return this.getSupply(actor, id);
  }

  private async insertSupply(tx: DbOrTx, bid: string, dto: CreateSupplyDto) {
    const { areaIds, ...data } = dto;
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${supplies.sortOrder}), 0)` }).from(supplies).where(eq(supplies.businessId, bid));
    const [s] = await tx.insert(supplies).values({ ...data, businessId: bid, sortOrder: Number(max) + 1 }).returning();
    const uniq = [...new Set(areaIds)];
    const next = await this.nextAreaOrder(tx, uniq);
    if (uniq.length) await tx.insert(supplyAreas).values(uniq.map((areaId) => ({ supplyId: s.id, areaId, sortOrder: next.get(areaId) ?? 0 })));
    return s.id;
  }

  async updateSupply(actor: Actor, id: string, dto: UpdateSupplyDto) {
    await this.getSupply(actor, id);
    await this.db.transaction(async (tx) => {
      await this.validateRefs(tx, actor.businessId, dto);
      const { areaIds, ...data } = dto;
      if (Object.keys(data).length) await tx.update(supplies).set(data).where(eq(supplies.id, id));
      if (areaIds) await this.setSupplyAreas(tx, id, areaIds);
    });
    this.changed(actor.businessId, 'supply', id);
    return this.getSupply(actor, id);
  }

  /** Reemplaza las áreas conservando el orden de las que ya estaban. */
  private async setSupplyAreas(tx: DbOrTx, supplyId: string, areaIds: string[]) {
    const uniq = [...new Set(areaIds)];
    const current = await tx.select().from(supplyAreas).where(eq(supplyAreas.supplyId, supplyId));
    const remove = current.filter((c) => !uniq.includes(c.areaId)).map((c) => c.areaId);
    const add = uniq.filter((a) => !current.some((c) => c.areaId === a));
    if (remove.length) await tx.delete(supplyAreas).where(and(eq(supplyAreas.supplyId, supplyId), inArray(supplyAreas.areaId, remove)));
    if (add.length) {
      const next = await this.nextAreaOrder(tx, add);
      await tx.insert(supplyAreas).values(add.map((areaId) => ({ supplyId, areaId, sortOrder: next.get(areaId) ?? 0 })));
    }
  }

  /** Borra el insumo; si ya se usó en requisiciones solo se desactiva. */
  async deleteSupply(actor: Actor, id: string) {
    await this.getSupply(actor, id);
    const [{ n }] = await this.db.select({ n: count() }).from(requisitionItems).where(eq(requisitionItems.supplyId, id));
    if (n > 0) await this.db.update(supplies).set({ active: false }).where(eq(supplies.id, id));
    else await this.db.delete(supplies).where(eq(supplies.id, id));
    this.changed(actor.businessId, 'supply', id);
    return { ok: true, deactivated: n > 0 };
  }

  async reorderSupplies(actor: Actor, areaId: string, ids: string[]) {
    await this.validateRefs(this.db, actor.businessId, { areaIds: [areaId] });
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(supplyAreas).set({ sortOrder: i + 1 }).where(and(eq(supplyAreas.areaId, areaId), eq(supplyAreas.supplyId, id)));
      }
    });
    this.changed(actor.businessId, 'supply');
    return { ok: true };
  }

  async bulkAssign(actor: Actor, dto: { supplyIds: string[]; areaIds: string[]; mode: 'add' | 'remove' | 'set' }) {
    const supplyIds = [...new Set(dto.supplyIds)];
    const owned = await this.db.select({ id: supplies.id }).from(supplies).where(and(eq(supplies.businessId, actor.businessId), inArray(supplies.id, supplyIds)));
    if (owned.length !== supplyIds.length) throw new BadRequestException('Uno de los insumos no existe');
    await this.db.transaction(async (tx) => {
      await this.validateRefs(tx, actor.businessId, { areaIds: dto.areaIds });
      if (dto.mode === 'remove') {
        await tx.delete(supplyAreas).where(and(inArray(supplyAreas.supplyId, supplyIds), inArray(supplyAreas.areaId, dto.areaIds)));
        return;
      }
      if (dto.mode === 'set') {
        for (const sid of supplyIds) await this.setSupplyAreas(tx, sid, dto.areaIds);
        return;
      }
      const next = await this.nextAreaOrder(tx, dto.areaIds);
      const values = dto.areaIds.flatMap((areaId) =>
        supplyIds.map((supplyId, i) => ({ supplyId, areaId, sortOrder: (next.get(areaId) ?? 0) + i })),
      );
      await tx.insert(supplyAreas).values(values).onConflictDoNothing();
    });
    this.changed(actor.businessId, 'supply');
    return { ok: true, supplies: supplyIds.length, areas: dto.areaIds.length };
  }

  // -------------------------------------------------------------- tablet
  async tabletCatalog(businessId: string, areaId: string): Promise<{ etag: string; body: TabletCatalog }> {
    const area = await this.db.query.areas.findFirst({ where: and(eq(areas.id, areaId), eq(areas.businessId, businessId)) });
    if (!area) throw new NotFoundException('Área no encontrada');
    const rows = await this.db
      .select({
        id: supplies.id, categoryId: supplies.categoryId, name: supplies.name, unit: supplies.unit, step: supplies.step,
        maxPerOrder: supplies.maxPerOrder, icon: supplies.icon, imageUrl: supplies.imageUrl, autoApprove: supplies.autoApprove,
        sortOrder: supplyAreas.sortOrder,
      })
      .from(supplyAreas)
      .innerJoin(supplies, eq(supplies.id, supplyAreas.supplyId))
      .where(and(eq(supplyAreas.areaId, areaId), eq(supplies.businessId, businessId), eq(supplies.active, true)))
      .orderBy(asc(supplyAreas.sortOrder), asc(supplies.name));
    const catIds = [...new Set(rows.map((r) => r.categoryId))];
    const cats = catIds.length
      ? await this.db
          .select({ id: supplyCategories.id, name: supplyCategories.name, icon: supplyCategories.icon, sortOrder: supplyCategories.sortOrder })
          .from(supplyCategories)
          .where(inArray(supplyCategories.id, catIds))
          .orderBy(asc(supplyCategories.sortOrder), asc(supplyCategories.name))
      : [];
    const body: TabletCatalog = {
      area: { id: area.id, name: area.name, color: area.color, icon: area.icon, orderWindow: area.orderWindow },
      categories: cats,
      supplies: rows,
    };
    return { etag: etagOf(body), body };
  }

  // -------------------------------------------------------------- importación CSV
  async importCsv(actor: Actor, csv: string, dryRun = false): Promise<ImportResult> {
    const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ''), {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => normalizeKey(h).replace(/ /g, '_'),
    });
    const fields = parsed.meta.fields ?? [];
    for (const req of ['nombre', 'categoria', 'unidad']) {
      if (!fields.includes(req)) throw new BadRequestException(`Falta la columna «${req}» en el archivo`);
    }
    if (parsed.data.length > 2000) throw new BadRequestException('Máximo 2000 filas por importación');

    const bid = actor.businessId;
    const areaRows = await this.db.select({ id: areas.id, name: areas.name }).from(areas).where(eq(areas.businessId, bid));
    const areasByName = new Map(areaRows.map((a) => [normalizeKey(a.name), a.id]));
    const result: ImportResult = { total: parsed.data.length, created: 0, updated: 0, createdCategories: [], createdSuppliers: [], errors: [], dryRun };

    await this.db.transaction(async (tx) => {
      const cats = new Map((await tx.select().from(supplyCategories).where(eq(supplyCategories.businessId, bid))).map((c) => [normalizeKey(c.name), c.id]));
      const sups = new Map((await tx.select().from(suppliers).where(eq(suppliers.businessId, bid))).map((s) => [normalizeKey(s.name), s.id]));
      const existing = new Map(
        (await tx.select({ id: supplies.id, name: supplies.name }).from(supplies).where(eq(supplies.businessId, bid))).map((s) => [normalizeKey(s.name), s.id]),
      );
      let catOrder = cats.size;

      for (const [i, raw] of parsed.data.entries()) {
        const rowNum = i + 2; // +1 encabezado, +1 base 1
        const r = parseSupplyCsvRow(raw, areasByName);
        if (!r.ok) {
          result.errors.push({ row: rowNum, name: raw.nombre?.trim() || null, error: r.error });
          continue;
        }
        const v = r.value;
        const ck = normalizeKey(v.categoryName);
        let categoryId = cats.get(ck);
        if (!categoryId) {
          const [c] = await tx.insert(supplyCategories).values({ businessId: bid, name: v.categoryName, sortOrder: ++catOrder }).returning();
          categoryId = c.id;
          cats.set(ck, c.id);
          result.createdCategories.push(v.categoryName);
        }
        let supplierId: string | null = null;
        if (v.supplierName) {
          const sk = normalizeKey(v.supplierName);
          supplierId = sups.get(sk) ?? null;
          if (!supplierId) {
            const [s] = await tx.insert(suppliers).values({ businessId: bid, name: v.supplierName }).returning();
            supplierId = s.id;
            sups.set(sk, s.id);
            result.createdSuppliers.push(v.supplierName);
          }
        }
        const nk = normalizeKey(v.name);
        const dto: CreateSupplyDto = {
          name: v.name, categoryId, unit: v.unit, step: v.step, supplierId, autoApprove: v.autoApprove, active: true,
          icon: v.icon, areaIds: v.areaIds,
        };
        const exId = existing.get(nk);
        if (exId) {
          const { areaIds, ...data } = dto;
          await tx.update(supplies).set(data).where(eq(supplies.id, exId));
          if (areaIds.length) await this.setSupplyAreas(tx, exId, areaIds);
          result.updated++;
        } else {
          const id = await this.insertSupply(tx, bid, dto);
          existing.set(nk, id);
          result.created++;
        }
      }
      if (dryRun) tx.rollback();
    }).catch((e: unknown) => {
      if (dryRun && (e as Error)?.message?.toLowerCase().includes('rollback')) return;
      throw e;
    });

    if (!dryRun && (result.created || result.updated)) {
      await this.audit.record(actor, { businessId: bid, action: 'supply.import', entity: 'supply', data: { created: result.created, updated: result.updated, errors: result.errors.length } });
      this.changed(bid, 'supply');
    }
    return result;
  }
}
