import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { OrderChannel, QuoteOrderDto } from '@rh/shared';
import { randomInt } from 'node:crypto';
import { Db, DbOrTx, InjectDb } from '../../../db/db.module';
import { branches, couponUses, coupons, customers, orders, promotions } from '../../../db/schema';
import { JobsService } from '../../../jobs/jobs.service';
import { SettingsService } from '../../../settings/settings.service';
import { CouponPatchSchema, CouponSchema, PromotionPatchSchema, PromotionSchema } from '../common/dto';
import { DeliveryEvents } from '../common/delivery-events';
import { localParts } from '../common/tz';
import { storeStatus } from '../branches/store-hours';
import { CoverageService } from '../zones/zones.service';
import { CoverageResult } from '../zones/coverage';
import { GeoService } from '../geo/geo.service';
import { MenuService } from '../menu/menu.service';
import { normalizePhone } from '../../../whatsapp/client/whatsapp.client';
import { computeQuote, CouponRule, menuChannelOf, PromotionRule, QuoteResult } from './pricing';

export type QuoteInput = QuoteOrderDto & { channel: OrderChannel };

/** Resultado interno: incluye datos resueltos que el pedido necesita guardar. */
export interface InternalQuote extends QuoteResult {
  resolved: {
    lat: number | null;
    lng: number | null;
    addressText: string | null;
    neighborhood: string | null;
    postalCode: string | null;
    coverage: CoverageResult | null;
    customerId: string | null;
  };
}

@Injectable()
export class PricingService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly menu: MenuService,
    private readonly coverage: CoverageService,
    private readonly geo: GeoService,
    private readonly settings: SettingsService,
  ) {}

  /** Cotización pública (sin datos internos). */
  async quote(businessId: string, dto: QuoteInput, now = new Date()): Promise<QuoteResult> {
    const { resolved: _r, ...q } = await this.quoteInternal(businessId, dto, now);
    return { ...q, lines: q.lines.map(({ productionAreaId: _p, ...l }) => l) as QuoteResult['lines'] };
  }

  async quoteInternal(businessId: string, dto: QuoteInput, now = new Date(), tx: DbOrTx = this.db): Promise<InternalQuote> {
    const business = await this.settings.getBusiness(businessId);
    const tz = business.timezone;

    // ---------- Ubicación ----------
    let lat = dto.address?.lat ?? null;
    let lng = dto.address?.lng ?? null;
    let addressText = dto.address?.text?.trim() ?? null;
    let neighborhood: string | null = null;
    let postalCode: string | null = null;
    if (dto.type === 'DOMICILIO' && dto.address && (lat == null || lng == null)) {
      const g = await this.geo.geocode(dto.address.text).catch(() => null);
      if (g) {
        lat = g.lat;
        lng = g.lng;
        neighborhood = g.neighborhood ?? null;
        postalCode = g.postalCode ?? null;
      }
    }
    const coverage = dto.type === 'DOMICILIO' && lat != null && lng != null ? await this.coverage.resolve(businessId, lat, lng) : null;

    // ---------- Sucursal ----------
    const allBranches = await tx.query.branches.findMany({
      where: and(eq(branches.businessId, businessId), eq(branches.active, true)),
      orderBy: asc(branches.createdAt),
    });
    let branch = coverage ? allBranches.find((b) => b.id === coverage.branchId) : undefined;
    if (!branch && dto.branchId) branch = allBranches.find((b) => b.id === dto.branchId);
    if (!branch && !(dto.type === 'DOMICILIO' && lat != null)) {
      branch = allBranches.find((b) => (dto.type === 'PASAR_A_RECOGER' ? b.acceptsPickup : b.acceptsDelivery)) ?? allBranches[0];
    }
    const store = branch ? storeStatus(branch, now, tz) : { open: true, message: '' };

    // ---------- Catálogo y promociones ----------
    const channel = menuChannelOf(dto.channel);
    const catalog = await this.menu.catalogFor(businessId, channel, branch?.id ?? null, dto.lines.map((l) => l.productId));
    const promos = (await tx.query.promotions.findMany({ where: and(eq(promotions.businessId, businessId), eq(promotions.active, true)), orderBy: asc(promotions.createdAt) })) as PromotionRule[];

    // ---------- Cliente y cupón ----------
    const phone = dto.customerPhone ? normalizePhone(dto.customerPhone) : null;
    const customer = phone ? await tx.query.customers.findFirst({ where: and(eq(customers.businessId, businessId), eq(customers.phone, phone)) }) : undefined;
    let coupon: CouponRule | null = null;
    let couponCustomerUses = 0;
    if (dto.couponCode?.trim()) {
      const c = await tx.query.coupons.findFirst({ where: and(eq(coupons.businessId, businessId), eq(coupons.code, dto.couponCode.trim().toUpperCase())) });
      coupon = (c as CouponRule | undefined) ?? null;
      if (c && customer) {
        const r = await tx.select({ n: sql<number>`count(*)::int` }).from(couponUses).where(and(eq(couponUses.couponId, c.id), eq(couponUses.customerId, customer.id)));
        couponCustomerUses = r[0]?.n ?? 0;
      }
    }

    const lp = localParts(now, tz);
    const result = computeQuote({
      channel: dto.channel,
      type: dto.type,
      lines: dto.lines,
      catalog,
      promotions: promos,
      couponCode: dto.couponCode,
      coupon,
      couponCustomerUses,
      customerId: customer?.id ?? null,
      hasCustomerPhone: !!phone,
      branch: branch ? { id: branch.id, acceptsDelivery: branch.acceptsDelivery, acceptsPickup: branch.acceptsPickup, prepMinutes: branch.prepMinutes } : null,
      hasLocation: lat != null && lng != null,
      coverage,
      store,
      now,
      local: { weekday: lp.weekday, minutes: lp.minutes },
    });
    if (dto.type === 'DOMICILIO' && dto.address && lat == null) {
      const i = result.errors.findIndex((e) => e.code === 'ADDRESS_REQUIRED');
      if (i >= 0) result.errors[i] = { code: 'ADDRESS_NOT_FOUND', message: 'No encontramos tu dirección; revisa calle, número y colonia o comparte tu ubicación' };
    }
    if (result.branchId == null && dto.type === 'DOMICILIO' && !coverage && allBranches[0] && lat == null) {
      result.branchId = allBranches[0].id;
    }
    return {
      ...result,
      resolved: { lat, lng, addressText, neighborhood, postalCode, coverage, customerId: customer?.id ?? null },
    };
  }
}

@Injectable()
export class PromotionsService implements OnModuleInit {
  private readonly log = new Logger('Promotions');

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly settings: SettingsService,
    private readonly jobs: JobsService,
    private readonly events: DeliveryEvents,
  ) {}

  onModuleInit() {
    this.jobs.register<{ orderId: string }>('delivery.loyalty', (d) => this.loyaltyCheck(d.orderId).then(() => undefined));
  }

  // ---------------- cupones
  async listCoupons(businessId: string) {
    return this.db.query.coupons.findMany({ where: eq(coupons.businessId, businessId), orderBy: desc(coupons.createdAt) });
  }

  async getCoupon(businessId: string, id: string) {
    const c = await this.db.query.coupons.findFirst({ where: and(eq(coupons.id, id), eq(coupons.businessId, businessId)) });
    if (!c) throw new NotFoundException('Cupón no encontrado');
    return c;
  }

  async createCoupon(businessId: string, dto: z.infer<typeof CouponSchema>) {
    if (dto.customerId) {
      const cu = await this.db.query.customers.findFirst({ where: and(eq(customers.id, dto.customerId), eq(customers.businessId, businessId)) });
      if (!cu) throw new BadRequestException('El cliente no existe');
    }
    try {
      const [c] = await this.db.insert(coupons).values({ ...dto, businessId }).returning();
      return c;
    } catch (e) {
      if (String((e as Error).message).includes('duplicate') || (e as { code?: string }).code === '23505') {
        throw new ConflictException(`Ya existe un cupón con el código ${dto.code}`);
      }
      throw e;
    }
  }

  async updateCoupon(businessId: string, id: string, dto: z.infer<typeof CouponPatchSchema>) {
    const cur = await this.getCoupon(businessId, id);
    if ((dto.discountType ?? cur.discountType) === 'PERCENT' && (dto.value ?? cur.value) > 100) throw new BadRequestException('El porcentaje debe ser de 0 a 100');
    const [c] = await this.db.update(coupons).set(dto).where(eq(coupons.id, id)).returning();
    return c;
  }

  async deleteCoupon(businessId: string, id: string) {
    const c = await this.getCoupon(businessId, id);
    if (c.usesCount > 0) {
      await this.db.update(coupons).set({ active: false }).where(eq(coupons.id, id));
      return { ok: true, deactivated: true };
    }
    await this.db.delete(coupons).where(eq(coupons.id, id));
    return { ok: true, deactivated: false };
  }

  // ---------------- promociones
  listPromotions(businessId: string) {
    return this.db.query.promotions.findMany({ where: eq(promotions.businessId, businessId), orderBy: desc(promotions.createdAt) });
  }

  async getPromotion(businessId: string, id: string) {
    const p = await this.db.query.promotions.findFirst({ where: and(eq(promotions.id, id), eq(promotions.businessId, businessId)) });
    if (!p) throw new NotFoundException('Promoción no encontrada');
    return p;
  }

  async createPromotion(businessId: string, dto: z.infer<typeof PromotionSchema>) {
    const [p] = await this.db.insert(promotions).values({ ...dto, businessId }).returning();
    return p;
  }

  async updatePromotion(businessId: string, id: string, dto: z.infer<typeof PromotionPatchSchema>) {
    const cur = await this.getPromotion(businessId, id);
    const merged = { ...cur, ...dto };
    if (merged.kind === 'BUY_X_GET_Y' && !(merged.buyQty && merged.getQty && merged.getQty < merged.buyQty)) {
      throw new BadRequestException('2x1/3x2 requiere buyQty y getQty (getQty menor que buyQty)');
    }
    const [p] = await this.db.update(promotions).set(dto).where(eq(promotions.id, id)).returning();
    return p;
  }

  async deletePromotion(businessId: string, id: string) {
    await this.getPromotion(businessId, id);
    await this.db.delete(promotions).where(eq(promotions.id, id));
    return { ok: true };
  }

  // ---------------- fidelización (PRM-03)
  /**
   * Tras entregar un pedido: si el cliente completó un múltiplo de N pedidos entregados,
   * genera un cupón personal de un solo uso FIEL-XXXX y lo envía por WhatsApp (vía DeliveryEvents → bot).
   */
  async loyaltyCheck(orderId: string): Promise<string | null> {
    const o = await this.db.query.orders.findFirst({ where: eq(orders.id, orderId) });
    if (!o || !['ENTREGADO', 'RECOGIDO'].includes(o.status)) return null;
    const s = await this.settings.getSettings(o.businessId);
    const l = s.loyalty;
    if (!l?.enabled || !(l.everyOrders > 0) || !(l.value > 0)) return null;
    const r = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.customerId, o.customerId), inArray(orders.status, ['ENTREGADO', 'RECOGIDO'])));
    const delivered = r[0]?.n ?? 0;
    if (delivered === 0 || delivered % l.everyOrders !== 0) return null;
    const customer = await this.db.query.customers.findFirst({ where: eq(customers.id, o.customerId) });
    if (!customer) return null;

    const description = l.discountType === 'PERCENT' ? `${l.value}% de descuento por tu lealtad` : `$${(l.value / 100).toFixed(2)} de descuento por tu lealtad`;
    let code = '';
    for (let i = 0; i < 5; i++) {
      code = `FIEL-${randomCode(4)}`;
      const [c] = await this.db
        .insert(coupons)
        .values({
          businessId: o.businessId, code, description, discountType: l.discountType, value: l.value,
          maxUses: 1, maxUsesPerCustomer: 1, customerId: customer.id,
          endsAt: new Date(Date.now() + 60 * 24 * 3600_000),
        })
        .onConflictDoNothing()
        .returning();
      if (c) break;
      code = '';
    }
    if (!code) return null;
    this.log.log(`Cupón de lealtad ${code} para cliente ${customer.id}`);
    await this.events.emit('loyalty.coupon', { businessId: o.businessId, customerId: customer.id, phone: customer.phone, name: customer.name, code, description });
    return code;
  }
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(n: number) {
  return Array.from({ length: n }, () => ALPHABET[randomInt(0, ALPHABET.length)]).join('');
}
