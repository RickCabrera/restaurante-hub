import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { RT } from '@rh/shared';
import { z } from 'zod';
import { Db, DbOrTx, InjectDb } from '../../../db/db.module';
import {
  areas, branches, menuCategories, modifierGroups, modifiers, productBranches, productModifierGroups, products,
} from '../../../db/schema';
import { RealtimeService } from '../../../realtime/realtime.service';
import {
  BranchOverrideSchema, CategorySchema, ModifierGroupPatchSchema, ModifierGroupSchema, ModifierSchema, ProductPatchSchema,
  ProductSchema,
} from '../common/dto';
import type { CatalogProduct, MenuChannel } from '../promotions/pricing';

export interface MenuModifier { id: string; name: string; priceCents: number; available: boolean; sortOrder: number }
export interface MenuModifierGroup {
  id: string; name: string; minSelect: number; maxSelect: number; sortOrder: number; modifiers: MenuModifier[];
}
export interface MenuProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  available: boolean;
  productionAreaId: string | null;
  sortOrder: number;
  modifierGroups: MenuModifierGroup[];
}
export interface MenuCategory {
  id: string; name: string; description: string | null; imageUrl: string | null; sortOrder: number; products: MenuProduct[];
}

const CHANNEL_FLAG = { web: 'showInWeb', whatsapp: 'showInWhatsapp', qr: 'showInQr', pos: 'showInPos' } as const;

@Injectable()
export class MenuService {
  constructor(@InjectDb() private readonly db: Db, private readonly rt: RealtimeService) {}

  private changed(businessId: string, what: string, id?: string) {
    this.rt.toBusiness(businessId, RT.MENU_CHANGED, { what, id: id ?? null, at: new Date().toISOString() });
  }

  // ======================================================= Menú para canales
  /**
   * Menú de venta para un canal: categorías activas con productos activos visibles en el canal,
   * precio/disponibilidad efectivos (override por sucursal) y sus modificadores.
   * Los productos agotados se incluyen con available=false (la UI los muestra deshabilitados).
   */
  async getMenu(businessId: string, opts: { channel: MenuChannel; branchId?: string | null }): Promise<MenuCategory[]> {
    const cats = await this.db.query.menuCategories.findMany({
      where: and(eq(menuCategories.businessId, businessId), eq(menuCategories.active, true)),
      orderBy: [asc(menuCategories.sortOrder), asc(menuCategories.name)],
    });
    const catalog = await this.loadProducts(businessId, opts.channel, opts.branchId ?? null);
    return cats
      .map((c) => ({
        id: c.id, name: c.name, description: c.description, imageUrl: c.imageUrl, sortOrder: c.sortOrder,
        products: catalog.filter((p) => p.categoryId === c.id),
      }))
      .filter((c) => c.products.length > 0);
  }

  private async loadProducts(businessId: string, channel: MenuChannel, branchId: string | null, onlyIds?: string[]): Promise<MenuProduct[]> {
    const flag = products[CHANNEL_FLAG[channel]];
    const conds = [eq(products.businessId, businessId), eq(products.active, true), eq(flag, true)];
    if (onlyIds) conds.push(inArray(products.id, onlyIds.length ? onlyIds : ['__none__']));
    const rows = await this.db.query.products.findMany({
      where: and(...conds),
      orderBy: [asc(products.sortOrder), asc(products.name)],
      with: {
        category: { columns: { active: true } },
        branchOverrides: branchId ? { where: eq(productBranches.branchId, branchId) } : { where: sql`false` },
        modifierGroups: {
          orderBy: asc(productModifierGroups.sortOrder),
          with: { group: { with: { modifiers: { orderBy: [asc(modifiers.sortOrder), asc(modifiers.name)] } } } },
        },
      },
    });
    return rows
      .filter((p) => p.category?.active)
      .map((p) => {
        const ov = p.branchOverrides[0];
        return {
          id: p.id,
          categoryId: p.categoryId,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          priceCents: ov?.priceCents ?? p.priceCents,
          available: p.available && (ov?.available ?? true),
          productionAreaId: p.productionAreaId,
          sortOrder: p.sortOrder,
          modifierGroups: p.modifierGroups.map((pg) => ({
            id: pg.group.id,
            name: pg.group.name,
            minSelect: pg.group.minSelect,
            maxSelect: pg.group.maxSelect,
            sortOrder: pg.sortOrder,
            modifiers: pg.group.modifiers.map((m) => ({ id: m.id, name: m.name, priceCents: m.priceCents, available: m.available, sortOrder: m.sortOrder })),
          })),
        };
      });
  }

  /** Catálogo para el cálculo de pedidos (solo productos pedidos). */
  async catalogFor(businessId: string, channel: MenuChannel, branchId: string | null, productIds: string[]): Promise<Map<string, CatalogProduct>> {
    const ps = await this.loadProducts(businessId, channel, branchId, [...new Set(productIds)]);
    return new Map(
      ps.map((p) => [p.id, {
        id: p.id, name: p.name, categoryId: p.categoryId, priceCents: p.priceCents, available: p.available, visible: true,
        productionAreaId: p.productionAreaId,
        groups: p.modifierGroups.map((g) => ({ id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, modifiers: g.modifiers })),
      }]),
    );
  }

  // ======================================================= Categorías
  listCategories(businessId: string) {
    return this.db.query.menuCategories.findMany({
      where: eq(menuCategories.businessId, businessId),
      orderBy: [asc(menuCategories.sortOrder), asc(menuCategories.name)],
    });
  }

  private async category(businessId: string, id: string) {
    const c = await this.db.query.menuCategories.findFirst({ where: and(eq(menuCategories.id, id), eq(menuCategories.businessId, businessId)) });
    if (!c) throw new NotFoundException('Categoría no encontrada');
    return c;
  }

  async createCategory(businessId: string, dto: z.infer<typeof CategorySchema>) {
    const sortOrder = dto.sortOrder ?? (await this.nextSort(this.db, menuCategories, eq(menuCategories.businessId, businessId)));
    const [c] = await this.db.insert(menuCategories).values({ ...dto, businessId, sortOrder }).returning();
    this.changed(businessId, 'category', c.id);
    return c;
  }

  async updateCategory(businessId: string, id: string, dto: Partial<z.infer<typeof CategorySchema>>) {
    await this.category(businessId, id);
    const [c] = await this.db.update(menuCategories).set(dto).where(eq(menuCategories.id, id)).returning();
    this.changed(businessId, 'category', id);
    return c;
  }

  async deleteCategory(businessId: string, id: string) {
    await this.category(businessId, id);
    const used = await this.db.query.products.findFirst({ where: eq(products.categoryId, id), columns: { id: true } });
    if (used) throw new BadRequestException('La categoría tiene productos; muévelos o desactívala');
    await this.db.delete(menuCategories).where(eq(menuCategories.id, id));
    this.changed(businessId, 'category', id);
    return { ok: true };
  }

  async reorderCategories(businessId: string, ids: string[]) {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(menuCategories).set({ sortOrder: i + 1 }).where(and(eq(menuCategories.id, id), eq(menuCategories.businessId, businessId)));
      }
    });
    this.changed(businessId, 'category');
    return this.listCategories(businessId);
  }

  // ======================================================= Productos
  async listProducts(businessId: string, categoryId?: string) {
    const rows = await this.db.query.products.findMany({
      where: categoryId ? and(eq(products.businessId, businessId), eq(products.categoryId, categoryId)) : eq(products.businessId, businessId),
      orderBy: [asc(products.sortOrder), asc(products.name)],
      with: { modifierGroups: { orderBy: asc(productModifierGroups.sortOrder) }, branchOverrides: true },
    });
    return rows.map((p) => this.shapeProduct(p));
  }

  private shapeProduct(p: any) {
    const { modifierGroups: mg, branchOverrides, ...rest } = p;
    return {
      ...rest,
      modifierGroupIds: (mg ?? []).map((x: { groupId: string }) => x.groupId),
      branchOverrides: (branchOverrides ?? []).map((o: any) => ({ branchId: o.branchId, priceCents: o.priceCents, available: o.available })),
    };
  }

  async getProduct(businessId: string, id: string) {
    const p = await this.db.query.products.findFirst({
      where: and(eq(products.id, id), eq(products.businessId, businessId)),
      with: { modifierGroups: { orderBy: asc(productModifierGroups.sortOrder) }, branchOverrides: true },
    });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return this.shapeProduct(p);
  }

  private async checkRefs(tx: DbOrTx, businessId: string, dto: { categoryId?: string; productionAreaId?: string | null; modifierGroupIds?: string[] }) {
    if (dto.categoryId) {
      const c = await tx.query.menuCategories.findFirst({ where: and(eq(menuCategories.id, dto.categoryId), eq(menuCategories.businessId, businessId)) });
      if (!c) throw new BadRequestException('La categoría no existe');
    }
    if (dto.productionAreaId) {
      const a = await tx.query.areas.findFirst({ where: and(eq(areas.id, dto.productionAreaId), eq(areas.businessId, businessId)) });
      if (!a) throw new BadRequestException('El área de producción no existe');
    }
    if (dto.modifierGroupIds?.length) {
      const gs = await tx.query.modifierGroups.findMany({ where: and(inArray(modifierGroups.id, dto.modifierGroupIds), eq(modifierGroups.businessId, businessId)) });
      if (gs.length !== new Set(dto.modifierGroupIds).size) throw new BadRequestException('Algún grupo de modificadores no existe');
    }
  }

  private async setProductGroups(tx: DbOrTx, productId: string, groupIds: string[]) {
    await tx.delete(productModifierGroups).where(eq(productModifierGroups.productId, productId));
    const uniq = [...new Set(groupIds)];
    if (uniq.length) await tx.insert(productModifierGroups).values(uniq.map((groupId, i) => ({ productId, groupId, sortOrder: i + 1 })));
  }

  async createProduct(businessId: string, dto: z.infer<typeof ProductSchema>) {
    const id = await this.db.transaction(async (tx) => {
      await this.checkRefs(tx, businessId, dto);
      const { modifierGroupIds, ...data } = dto;
      const sortOrder = dto.sortOrder ?? (await this.nextSort(tx, products, eq(products.categoryId, dto.categoryId)));
      const [p] = await tx.insert(products).values({ ...data, businessId, sortOrder }).returning();
      if (modifierGroupIds) await this.setProductGroups(tx, p.id, modifierGroupIds);
      return p.id;
    });
    this.changed(businessId, 'product', id);
    return this.getProduct(businessId, id);
  }

  async updateProduct(businessId: string, id: string, dto: z.infer<typeof ProductPatchSchema>) {
    await this.getProduct(businessId, id);
    await this.db.transaction(async (tx) => {
      await this.checkRefs(tx, businessId, dto);
      const { modifierGroupIds, ...data } = dto;
      if (Object.keys(data).length) await tx.update(products).set(data).where(eq(products.id, id));
      if (modifierGroupIds) await this.setProductGroups(tx, id, modifierGroupIds);
    });
    this.changed(businessId, 'product', id);
    return this.getProduct(businessId, id);
  }

  async deleteProduct(businessId: string, id: string) {
    await this.getProduct(businessId, id);
    try {
      await this.db.delete(products).where(eq(products.id, id));
    } catch {
      // Tiene pedidos históricos: baja lógica
      await this.db.update(products).set({ active: false }).where(eq(products.id, id));
    }
    this.changed(businessId, 'product', id);
    return { ok: true };
  }

  async setProductAvailability(businessId: string, id: string, available: boolean) {
    await this.getProduct(businessId, id);
    await this.db.update(products).set({ available }).where(eq(products.id, id));
    this.changed(businessId, 'product.availability', id);
    return this.getProduct(businessId, id);
  }

  async reorderProducts(businessId: string, ids: string[]) {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(products).set({ sortOrder: i + 1 }).where(and(eq(products.id, id), eq(products.businessId, businessId)));
      }
    });
    this.changed(businessId, 'product');
    return { ok: true };
  }

  async setBranchOverride(businessId: string, productId: string, branchId: string, dto: z.infer<typeof BranchOverrideSchema>) {
    await this.getProduct(businessId, productId);
    const b = await this.db.query.branches.findFirst({ where: and(eq(branches.id, branchId), eq(branches.businessId, businessId)) });
    if (!b) throw new BadRequestException('La sucursal no existe');
    const priceCents = dto.priceCents ?? null;
    const available = dto.available ?? null;
    if (priceCents == null && available == null) {
      await this.db.delete(productBranches).where(and(eq(productBranches.productId, productId), eq(productBranches.branchId, branchId)));
    } else {
      await this.db
        .insert(productBranches)
        .values({ productId, branchId, priceCents, available })
        .onConflictDoUpdate({ target: [productBranches.productId, productBranches.branchId], set: { priceCents, available } });
    }
    this.changed(businessId, 'product.branch', productId);
    return this.getProduct(businessId, productId);
  }

  // ======================================================= Modificadores
  listGroups(businessId: string) {
    return this.db.query.modifierGroups.findMany({
      where: eq(modifierGroups.businessId, businessId),
      orderBy: [asc(modifierGroups.sortOrder), asc(modifierGroups.name)],
      with: { modifiers: { orderBy: [asc(modifiers.sortOrder), asc(modifiers.name)] } },
    });
  }

  async getGroup(businessId: string, id: string) {
    const g = await this.db.query.modifierGroups.findFirst({
      where: and(eq(modifierGroups.id, id), eq(modifierGroups.businessId, businessId)),
      with: { modifiers: { orderBy: [asc(modifiers.sortOrder), asc(modifiers.name)] } },
    });
    if (!g) throw new NotFoundException('Grupo de modificadores no encontrado');
    return g;
  }

  async createGroup(businessId: string, dto: z.infer<typeof ModifierGroupSchema>) {
    const id = await this.db.transaction(async (tx) => {
      const { modifiers: mods, ...data } = dto;
      const sortOrder = dto.sortOrder ?? (await this.nextSort(tx, modifierGroups, eq(modifierGroups.businessId, businessId)));
      const [g] = await tx.insert(modifierGroups).values({ ...data, businessId, sortOrder }).returning();
      if (mods?.length) await tx.insert(modifiers).values(mods.map((m, i) => ({ ...m, groupId: g.id, sortOrder: m.sortOrder ?? i + 1 })));
      return g.id;
    });
    this.changed(businessId, 'modifier_group', id);
    return this.getGroup(businessId, id);
  }

  async updateGroup(businessId: string, id: string, dto: z.infer<typeof ModifierGroupPatchSchema>) {
    const cur = await this.getGroup(businessId, id);
    const min = dto.minSelect ?? cur.minSelect;
    const max = dto.maxSelect ?? cur.maxSelect;
    if (min > max) throw new BadRequestException('El mínimo no puede ser mayor que el máximo');
    await this.db.update(modifierGroups).set(dto).where(eq(modifierGroups.id, id));
    this.changed(businessId, 'modifier_group', id);
    return this.getGroup(businessId, id);
  }

  async deleteGroup(businessId: string, id: string) {
    await this.getGroup(businessId, id);
    await this.db.delete(modifierGroups).where(eq(modifierGroups.id, id));
    this.changed(businessId, 'modifier_group', id);
    return { ok: true };
  }

  async reorderGroups(businessId: string, ids: string[]) {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(modifierGroups).set({ sortOrder: i + 1 }).where(and(eq(modifierGroups.id, id), eq(modifierGroups.businessId, businessId)));
      }
    });
    this.changed(businessId, 'modifier_group');
    return this.listGroups(businessId);
  }

  async addModifier(businessId: string, groupId: string, dto: z.infer<typeof ModifierSchema>) {
    await this.getGroup(businessId, groupId);
    const sortOrder = dto.sortOrder ?? (await this.nextSort(this.db, modifiers, eq(modifiers.groupId, groupId)));
    const [m] = await this.db.insert(modifiers).values({ ...dto, groupId, sortOrder }).returning();
    this.changed(businessId, 'modifier', m.id);
    return m;
  }

  private async modifierOf(businessId: string, groupId: string, id: string) {
    await this.getGroup(businessId, groupId);
    const m = await this.db.query.modifiers.findFirst({ where: and(eq(modifiers.id, id), eq(modifiers.groupId, groupId)) });
    if (!m) throw new NotFoundException('Opción no encontrada');
    return m;
  }

  async updateModifier(businessId: string, groupId: string, id: string, dto: Partial<z.infer<typeof ModifierSchema>>) {
    await this.modifierOf(businessId, groupId, id);
    const [m] = await this.db.update(modifiers).set(dto).where(eq(modifiers.id, id)).returning();
    this.changed(businessId, dto.available !== undefined ? 'modifier.availability' : 'modifier', id);
    return m;
  }

  async deleteModifier(businessId: string, groupId: string, id: string) {
    await this.modifierOf(businessId, groupId, id);
    await this.db.delete(modifiers).where(eq(modifiers.id, id));
    this.changed(businessId, 'modifier', id);
    return { ok: true };
  }

  async reorderModifiers(businessId: string, groupId: string, ids: string[]) {
    await this.getGroup(businessId, groupId);
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(modifiers).set({ sortOrder: i + 1 }).where(and(eq(modifiers.id, id), eq(modifiers.groupId, groupId)));
      }
    });
    this.changed(businessId, 'modifier');
    return this.getGroup(businessId, groupId);
  }

  private async nextSort(tx: DbOrTx, table: any, where: any): Promise<number> {
    const r = await tx.select({ m: sql<number>`coalesce(max(${table.sortOrder}), 0)` }).from(table).where(where);
    return Number(r[0]?.m ?? 0) + 1;
  }
}
