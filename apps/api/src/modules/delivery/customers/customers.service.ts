import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Db, DbOrTx, InjectDb } from '../../../db/db.module';
import { addresses, customers, orders } from '../../../db/schema';
import { normalizePhone } from '../../../whatsapp/client/whatsapp.client';
import { AddressPatchSchema, AddressSchema, CustomerPatchSchema } from '../common/dto';

export type Customer = typeof customers.$inferSelect;
export type Address = typeof addresses.$inferSelect;

/** Normaliza teléfono para identificar clientes: 10 dígitos MX → 52XXXXXXXXXX; 521XXXXXXXXXX → 52XXXXXXXXXX. */
export const normalizeCustomerPhone = normalizePhone;

@Injectable()
export class CustomersService {
  constructor(@InjectDb() private readonly db: Db) {}

  async findByPhone(businessId: string, phone: string, tx: DbOrTx = this.db): Promise<Customer | null> {
    const p = normalizePhone(phone);
    if (!p) return null;
    return (await tx.query.customers.findFirst({ where: and(eq(customers.businessId, businessId), eq(customers.phone, p)) })) ?? null;
  }

  /** Crea o actualiza (nombre) un cliente por teléfono. */
  async upsertByPhone(businessId: string, phone: string, name?: string | null, tx: DbOrTx = this.db): Promise<Customer> {
    const p = normalizePhone(phone);
    const cleanName = name?.trim() || null;
    const [c] = await tx
      .insert(customers)
      .values({ businessId, phone: p, name: cleanName })
      .onConflictDoUpdate({
        target: [customers.businessId, customers.phone],
        set: cleanName ? { name: cleanName } : { phone: p },
      })
      .returning();
    return c;
  }

  async list(businessId: string, opts: { q?: string; limit: number; offset: number }) {
    const conds = [eq(customers.businessId, businessId)];
    if (opts.q) {
      const digits = opts.q.replace(/\D/g, '');
      const ors = [ilike(customers.name, `%${opts.q}%`)];
      if (digits.length >= 3) ors.push(ilike(customers.phone, `%${digits}%`));
      conds.push(or(...ors)!);
    }
    const where = and(...conds);
    const [rows, total] = await Promise.all([
      this.db.query.customers.findMany({
        where,
        orderBy: [sql`${customers.lastOrderAt} desc nulls last`, desc(customers.createdAt)],
        limit: opts.limit,
        offset: opts.offset,
      }),
      this.db.select({ n: sql<number>`count(*)::int` }).from(customers).where(where),
    ]);
    return { items: rows, total: total[0]?.n ?? 0 };
  }

  async get(businessId: string, id: string) {
    const c = await this.db.query.customers.findFirst({
      where: and(eq(customers.id, id), eq(customers.businessId, businessId)),
      with: { addresses: { orderBy: [sql`${addresses.lastUsedAt} desc nulls last`, desc(addresses.createdAt)] } },
    });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    const recent = await this.db.query.orders.findMany({
      where: and(eq(orders.customerId, id), eq(orders.businessId, businessId)),
      orderBy: desc(orders.createdAt),
      limit: 20,
      columns: { id: true, folio: true, status: true, channel: true, type: true, totalCents: true, createdAt: true, paymentMethod: true },
    });
    const statsRow = await this.db
      .select({
        delivered: sql<number>`count(*) filter (where ${orders.status} in ('ENTREGADO','RECOGIDO'))::int`,
        cancelled: sql<number>`count(*) filter (where ${orders.status} in ('CANCELADO','RECHAZADO'))::int`,
        spent: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} in ('ENTREGADO','RECOGIDO')),0)::int`,
        first: sql<Date | null>`min(${orders.createdAt})`,
      })
      .from(orders)
      .where(eq(orders.customerId, id));
    const st = statsRow[0];
    return {
      ...c,
      recentOrders: recent,
      stats: {
        ordersCount: c.ordersCount,
        deliveredCount: st?.delivered ?? 0,
        cancelledCount: st?.cancelled ?? 0,
        totalSpentCents: c.totalSpentCents,
        avgTicketCents: st?.delivered ? Math.round((st.spent ?? 0) / st.delivered) : 0,
        firstOrderAt: st?.first ?? null,
        lastOrderAt: c.lastOrderAt,
      },
    };
  }

  async update(businessId: string, id: string, dto: z.infer<typeof CustomerPatchSchema>) {
    await this.ensure(businessId, id);
    const [c] = await this.db.update(customers).set(dto).where(eq(customers.id, id)).returning();
    return c;
  }

  private async ensure(businessId: string, id: string) {
    const c = await this.db.query.customers.findFirst({ where: and(eq(customers.id, id), eq(customers.businessId, businessId)), columns: { id: true } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
  }

  async listAddresses(businessId: string, customerId: string) {
    await this.ensure(businessId, customerId);
    return this.db.query.addresses.findMany({
      where: eq(addresses.customerId, customerId),
      orderBy: [sql`${addresses.lastUsedAt} desc nulls last`, asc(addresses.createdAt)],
    });
  }

  async addAddress(businessId: string, customerId: string, dto: z.infer<typeof AddressSchema>) {
    await this.ensure(businessId, customerId);
    const [a] = await this.db
      .insert(addresses)
      .values({ ...dto, customerId, validated: dto.validated ?? (dto.lat != null && dto.lng != null) })
      .returning();
    return a;
  }

  async updateAddress(businessId: string, customerId: string, id: string, dto: z.infer<typeof AddressPatchSchema>) {
    await this.ensure(businessId, customerId);
    const [a] = await this.db.update(addresses).set(dto).where(and(eq(addresses.id, id), eq(addresses.customerId, customerId))).returning();
    if (!a) throw new NotFoundException('Dirección no encontrada');
    return a;
  }

  async deleteAddress(businessId: string, customerId: string, id: string) {
    await this.ensure(businessId, customerId);
    await this.db.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.customerId, customerId)));
    return { ok: true };
  }

  /**
   * Guarda o refresca la dirección usada en un pedido. Reutiliza por id o por texto+coordenadas iguales.
   */
  async saveOrderAddress(
    tx: DbOrTx,
    customerId: string,
    a: { id?: string; text: string; references?: string | null; lat?: number | null; lng?: number | null; label?: string | null; neighborhood?: string | null; postalCode?: string | null },
  ): Promise<Address> {
    const now = new Date();
    let existing: Address | undefined;
    if (a.id) existing = await tx.query.addresses.findFirst({ where: and(eq(addresses.id, a.id), eq(addresses.customerId, customerId)) });
    if (!existing) {
      const same = await tx.query.addresses.findMany({ where: and(eq(addresses.customerId, customerId), eq(addresses.text, a.text.trim())) });
      existing = same.find((x) => (a.lat == null || x.lat == null) || (Math.abs((x.lat ?? 0) - a.lat) < 1e-4 && Math.abs((x.lng ?? 0) - (a.lng ?? 0)) < 1e-4));
    }
    if (existing) {
      const [u] = await tx
        .update(addresses)
        .set({
          lastUsedAt: now,
          references: a.references ?? existing.references,
          lat: a.lat ?? existing.lat,
          lng: a.lng ?? existing.lng,
          label: a.label ?? existing.label,
          validated: existing.validated || (a.lat != null && a.lng != null),
        })
        .where(eq(addresses.id, existing.id))
        .returning();
      return u;
    }
    const [n] = await tx
      .insert(addresses)
      .values({
        customerId,
        text: a.text.trim(),
        references: a.references ?? null,
        lat: a.lat ?? null,
        lng: a.lng ?? null,
        label: a.label ?? null,
        neighborhood: a.neighborhood ?? null,
        postalCode: a.postalCode ?? null,
        validated: a.lat != null && a.lng != null,
        lastUsedAt: now,
      })
      .returning();
    return n;
  }
}
