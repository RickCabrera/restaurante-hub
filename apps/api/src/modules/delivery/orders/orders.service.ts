import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, SQL } from 'drizzle-orm';
import {
  canTransitionOrder, CreateOrderDto, formatMoney, ORDER_ACTIVE_STATUSES, OrderChannel, OrderStatus, OrderStatusLabel, RT,
} from '@rh/shared';
import { z } from 'zod';
import { Db, InjectDb } from '../../../db/db.module';
import { couponUses, coupons, customers, orders, orderItems, users } from '../../../db/schema';
import { RealtimeService, Rooms } from '../../../realtime/realtime.service';
import { NotificationsService } from '../../../notifications/notifications.service';
import { SettingsService } from '../../../settings/settings.service';
import { JobsService } from '../../../jobs/jobs.service';
import { loadEnv } from '../../../config/env';
import { randomToken } from '../../../common/utils/crypto';
import type { Actor } from '../../../common/actor';
import { actorUserId } from '../../../common/actor';
import { OrderPrinter } from '../../printing/order-printer.port';
import { normalizePhone } from '../../../whatsapp/client/whatsapp.client';
import { CustomersService } from '../customers/customers.service';
import { PricingService } from '../promotions/promotions.service';
import { DeliveryEvents, OrderEventInfo } from '../common/delivery-events';
import { OrderListSchema } from '../common/dto';
import { OrderRow, OrderView, toOrderView, toTracking, TrackingView } from './order-view';

export interface OrderSource {
  channel: OrderChannel;
  /** quien capturó (manual) */
  actor?: Actor | null;
  /** creado por el bot de WhatsApp (no requiere aviso de privacidad web) */
  fromBot?: boolean;
  /** endpoint público: exige aviso de privacidad para clientes nuevos */
  isPublic?: boolean;
}

const TS_FIELD: Partial<Record<OrderStatus, keyof OrderRow>> = {
  ACEPTADO: 'acceptedAt',
  EN_PREPARACION: 'preparingAt',
  LISTO: 'readyAt',
  EN_CAMINO: 'dispatchedAt',
  ENTREGADO: 'deliveredAt',
  RECOGIDO: 'deliveredAt',
  RECHAZADO: 'cancelledAt',
  CANCELADO: 'cancelledAt',
};

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly log = new Logger('Orders');
  private readonly env = loadEnv();

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly pricing: PricingService,
    private readonly customers: CustomersService,
    private readonly settings: SettingsService,
    private readonly rt: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
    private readonly events: DeliveryEvents,
    @Optional() private readonly printer?: OrderPrinter,
  ) {}

  onModuleInit() {
    // Seguimiento público en tiempo real: socket anónimo se une a order:<token>
    this.rt.handle('order.watch', async (socket, _actor, payload: { publicToken?: string }) => {
      const token = String(payload?.publicToken ?? '');
      if (!token || token.length < 10) throw new Error('Pedido no encontrado');
      const tracking = await this.tracking(token);
      await socket.join(Rooms.order(token));
      return tracking;
    });
    this.rt.handle('order.unwatch', async (socket, _actor, payload: { publicToken?: string }) => {
      if (payload?.publicToken) await socket.leave(Rooms.order(String(payload.publicToken)));
      return true;
    });
  }

  // ===================================================================== lectura
  async findRow(businessId: string, id: string) {
    const o = await this.db.query.orders.findFirst({ where: and(eq(orders.id, id), eq(orders.businessId, businessId)) });
    if (!o) throw new NotFoundException('Pedido no encontrado');
    return o;
  }

  async get(businessId: string, id: string): Promise<OrderView> {
    const o = await this.db.query.orders.findFirst({
      where: and(eq(orders.id, id), eq(orders.businessId, businessId)),
      with: {
        items: true,
        driver: { columns: { id: true, name: true, phone: true } },
        branch: { columns: { name: true } },
        customer: { columns: { ordersCount: true } },
      },
    });
    if (!o) throw new NotFoundException('Pedido no encontrado');
    return toOrderView(o, this.env.APP_URL);
  }

  async list(businessId: string, q: z.infer<typeof OrderListSchema>) {
    const conds: SQL[] = [eq(orders.businessId, businessId)];
    const statuses = q.status?.split(',').map((s) => s.trim()).filter(Boolean) as OrderStatus[] | undefined;
    if (statuses?.length) conds.push(inArray(orders.status, statuses));
    if (q.active === '1' || q.active === 'true') conds.push(inArray(orders.status, ORDER_ACTIVE_STATUSES));
    if (q.channel) conds.push(eq(orders.channel, q.channel));
    if (q.type) conds.push(eq(orders.type, q.type));
    if (q.from) conds.push(gte(orders.createdAt, q.from));
    if (q.to) conds.push(lte(orders.createdAt, q.to));
    if (q.driverId) conds.push(eq(orders.driverId, q.driverId));
    if (q.branchId) conds.push(eq(orders.branchId, q.branchId));
    if (q.q) {
      const digits = q.q.replace(/\D/g, '');
      const ors: SQL[] = [ilike(orders.folio, `%${q.q}%`), ilike(orders.customerName, `%${q.q}%`)];
      if (digits.length >= 3) ors.push(ilike(orders.customerPhone, `%${digits}%`));
      conds.push(or(...ors)!);
    }
    const where = and(...conds);
    const [rows, total] = await Promise.all([
      this.db.query.orders.findMany({
        where,
        orderBy: desc(orders.createdAt),
        limit: q.limit,
        offset: q.offset,
        with: {
          items: true,
          driver: { columns: { id: true, name: true, phone: true } },
          branch: { columns: { name: true } },
          customer: { columns: { ordersCount: true } },
        },
      }),
      this.db.select({ n: sql<number>`count(*)::int` }).from(orders).where(where),
    ]);
    return { items: rows.map((o) => toOrderView(o, this.env.APP_URL)), total: total[0]?.n ?? 0 };
  }

  async tracking(publicToken: string, businessId?: string): Promise<TrackingView> {
    const o = await this.db.query.orders.findFirst({
      where: businessId ? and(eq(orders.publicToken, publicToken), eq(orders.businessId, businessId)) : eq(orders.publicToken, publicToken),
      with: { items: true, driver: { columns: { name: true } }, branch: { columns: { name: true, address: true, phone: true } } },
    });
    if (!o) throw new NotFoundException('Pedido no encontrado');
    const b = await this.settings.getBusiness(o.businessId);
    return toTracking(o, { name: b.name, phone: b.phone, logoUrl: b.logoUrl, primaryColor: b.primaryColor, accentColor: b.accentColor, slug: b.slug });
  }

  // ===================================================================== crear
  async create(businessId: string, dto: CreateOrderDto, source: OrderSource): Promise<OrderView> {
    const channel = source.channel;
    const phone = normalizePhone(dto.customer.phone);
    if (phone.length < 12) throw new BadRequestException('Teléfono inválido: usa 10 dígitos');
    if (dto.type === 'DOMICILIO' && !dto.address) throw new BadRequestException('Indica la dirección de entrega');

    const s = await this.settings.getSettings(businessId);
    const existing = await this.customers.findByPhone(businessId, phone);
    if (source.isPublic && s.privacyNoticeUrl && !existing?.acceptedPrivacyAt && !dto.acceptPrivacy) {
      throw new BadRequestException('Debes aceptar el aviso de privacidad para continuar');
    }

    const quote = await this.pricing.quoteInternal(businessId, { ...dto, channel, customerPhone: phone });
    if (!quote.canOrder) {
      throw new UnprocessableEntityException({
        message: quote.errors[0]?.message ?? 'No es posible crear el pedido',
        errors: quote.errors,
        quote: { ...quote, resolved: undefined },
      });
    }
    if (dto.paymentMethod === 'EFECTIVO' && dto.cashGivenCents != null && dto.cashGivenCents > 0 && dto.cashGivenCents < quote.totalCents) {
      throw new BadRequestException(`El monto con el que pagas debe ser al menos ${formatMoney(quote.totalCents)}`);
    }
    if (!quote.branchId) throw new BadRequestException('No hay una sucursal disponible');

    const order = await this.db.transaction(async (tx) => {
      const customer = await this.customers.upsertByPhone(businessId, phone, dto.customer.name, tx);
      if (dto.acceptPrivacy && !customer.acceptedPrivacyAt) {
        await tx.update(customers).set({ acceptedPrivacyAt: new Date() }).where(eq(customers.id, customer.id));
      }
      if (dto.type === 'DOMICILIO' && dto.address) {
        await this.customers.saveOrderAddress(tx, customer.id, {
          id: dto.address.id,
          text: quote.resolved.addressText ?? dto.address.text,
          references: dto.address.references ?? null,
          lat: quote.resolved.lat,
          lng: quote.resolved.lng,
          label: dto.address.label ?? null,
          neighborhood: quote.resolved.neighborhood,
          postalCode: quote.resolved.postalCode,
        });
      }
      const folio = await this.settings.nextFolio(tx, businessId, 'P');
      const [o] = await tx
        .insert(orders)
        .values({
          businessId,
          branchId: quote.branchId!,
          folio,
          publicToken: randomToken(18),
          channel,
          type: dto.type,
          customerId: customer.id,
          customerName: dto.customer.name.trim(),
          customerPhone: phone,
          addressText: dto.type === 'DOMICILIO' ? quote.resolved.addressText : null,
          addressRefs: dto.type === 'DOMICILIO' ? dto.address?.references ?? null : null,
          lat: dto.type === 'DOMICILIO' ? quote.resolved.lat : null,
          lng: dto.type === 'DOMICILIO' ? quote.resolved.lng : null,
          zoneId: quote.zone?.id ?? null,
          subtotalCents: quote.subtotalCents,
          discountCents: quote.discountCents,
          deliveryFeeCents: quote.deliveryFeeCents,
          totalCents: quote.totalCents,
          couponCode: quote.coupon?.code ?? null,
          promotionIds: quote.appliedPromotions.map((p) => p.id),
          paymentMethod: dto.paymentMethod,
          cashGivenCents: dto.paymentMethod === 'EFECTIVO' ? dto.cashGivenCents ?? null : null,
          notes: dto.notes?.trim() || null,
          estimatedMinutes: quote.estimatedMinutes,
        })
        .returning();
      await tx.insert(orderItems).values(
        quote.lines.map((l) => ({
          orderId: o.id,
          productId: l.productId,
          productName: l.name,
          productionAreaId: l.productionAreaId,
          unitPriceCents: l.unitPriceCents,
          quantity: l.quantity,
          totalCents: l.totalCents,
          note: l.note,
          modifiers: l.modifiers,
        })),
      );
      if (quote.coupon) {
        // Incremento atómico respetando maxUses (evita sobreuso concurrente)
        const upd = await tx
          .update(coupons)
          .set({ usesCount: sql`${coupons.usesCount} + 1` })
          .where(and(eq(coupons.id, quote.coupon.id), or(isNull(coupons.maxUses), sql`${coupons.usesCount} < ${coupons.maxUses}`)))
          .returning({ id: coupons.id });
        if (!upd.length) throw new ConflictException(`El cupón ${quote.coupon.code} ya se agotó`);
        await tx.insert(couponUses).values({ couponId: quote.coupon.id, customerId: customer.id, orderId: o.id, discountCents: quote.coupon.discountCents });
      }
      await tx
        .update(customers)
        .set({
          ordersCount: sql`${customers.ordersCount} + 1`,
          totalSpentCents: sql`${customers.totalSpentCents} + ${quote.totalCents}`,
          lastOrderAt: new Date(),
        })
        .where(eq(customers.id, customer.id));
      return o;
    });

    const view = await this.get(businessId, order.id);
    this.rt.emit([Rooms.managers(businessId), Rooms.pos(businessId)], RT.ORDER_CREATED, view);
    void this.notifications
      .notifyManagers(businessId, {
        type: 'ORDER_NEW',
        title: 'Nuevo pedido',
        body: `Nuevo pedido ${view.folio} · ${view.channelLabel} · ${formatMoney(view.totalCents)}`,
        link: `/admin/pedidos/${view.id}`,
        data: { orderId: view.id, folio: view.folio },
        urgent: true,
      })
      .catch((e) => this.log.warn(`notify ORDER_NEW: ${(e as Error).message}`));
    if (this.printOn(s) === 'create') await this.print(view.id, {});
    await this.events.emit('order.created', { order: this.info(view), sessionToken: dto.sessionToken ?? null, fromBot: !!source.fromBot });
    return view;
  }

  private printOn(s: unknown): 'create' | 'accept' {
    return (s as { printOn?: string }).printOn === 'create' ? 'create' : 'accept';
  }

  private async print(orderId: string, opts: { reprint?: boolean }) {
    if (!this.printer) return false;
    try {
      await this.printer.printOrder(orderId, opts);
      return true;
    } catch (e) {
      this.log.warn(`Impresión del pedido ${orderId} falló: ${(e as Error).message}`);
      return false;
    }
  }

  // ===================================================================== transiciones
  private async transition(
    businessId: string,
    id: string,
    to: OrderStatus,
    extra: Partial<typeof orders.$inferInsert> = {},
    check?: (o: OrderRow) => void,
  ): Promise<OrderView> {
    const cur = await this.findRow(businessId, id);
    check?.(cur);
    if (!canTransitionOrder(cur.status, to, cur.type)) {
      throw new ConflictException(`No se puede pasar el pedido ${cur.folio} de "${OrderStatusLabel[cur.status]}" a "${OrderStatusLabel[to]}"`);
    }
    const tsField = TS_FIELD[to];
    const set: Partial<typeof orders.$inferInsert> = { ...extra, status: to };
    if (tsField) (set as Record<string, unknown>)[tsField] = new Date();
    // Si se salta EN_PREPARACION (ACEPTADO→LISTO) o LISTO→ENTREGADO, completa timestamps intermedios no definidos
    if (to === 'LISTO' && !cur.preparingAt) set.preparingAt = new Date();
    const updated = await this.db.transaction(async (tx) => {
      const [u] = await tx
        .update(orders)
        .set(set)
        .where(and(eq(orders.id, id), eq(orders.status, cur.status)))
        .returning();
      if (!u) return null;
      if ((to === 'CANCELADO' || to === 'RECHAZADO') && cur.status !== to) {
        // Revierte estadísticas y uso de cupón
        await tx
          .update(customers)
          .set({
            ordersCount: sql`greatest(${customers.ordersCount} - 1, 0)`,
            totalSpentCents: sql`greatest(${customers.totalSpentCents} - ${cur.totalCents}, 0)`,
          })
          .where(eq(customers.id, cur.customerId));
        const use = await tx.query.couponUses.findFirst({ where: eq(couponUses.orderId, id) });
        if (use) {
          await tx.delete(couponUses).where(eq(couponUses.id, use.id));
          await tx.update(coupons).set({ usesCount: sql`greatest(${coupons.usesCount} - 1, 0)` }).where(eq(coupons.id, use.couponId));
        }
      }
      return u;
    });
    if (!updated) throw new ConflictException('El pedido cambió mientras lo actualizabas; recarga e intenta de nuevo');
    const view = await this.afterChange(businessId, id, cur.driverId);
    await this.events.emit('order.status', { order: this.info(view), previous: cur.status });
    if (to === 'ENTREGADO' || to === 'RECOGIDO') {
      await this.jobs.add('delivery.loyalty', { orderId: id }, { jobId: `loyalty-${id}` }).catch(() => undefined);
    }
    return view;
  }

  async accept(businessId: string, id: string, estimatedMinutes?: number) {
    const view = await this.transition(businessId, id, 'ACEPTADO', estimatedMinutes ? { estimatedMinutes } : {});
    const s = await this.settings.getSettings(businessId);
    if (this.printOn(s) === 'accept') await this.print(id, {});
    return view;
  }

  reject(businessId: string, id: string, reason: string) {
    return this.transition(businessId, id, 'RECHAZADO', { rejectReason: reason });
  }

  cancel(businessId: string, id: string, reason: string) {
    return this.transition(businessId, id, 'CANCELADO', { cancelReason: reason });
  }

  async setStatus(businessId: string, id: string, status: OrderStatus) {
    if (status === 'ACEPTADO') return this.accept(businessId, id);
    const extra: Partial<typeof orders.$inferInsert> = {};
    if (status === 'ENTREGADO' || status === 'RECOGIDO') {
      const cur = await this.findRow(businessId, id);
      if (cur.paymentMethod !== 'TRANSFERENCIA') extra.paid = true;
    }
    return this.transition(businessId, id, status, extra);
  }

  // ---------------- repartidor
  async assignDriver(businessId: string, id: string, driverId: string | null) {
    const cur = await this.findRow(businessId, id);
    if (cur.type !== 'DOMICILIO') throw new BadRequestException('Solo los pedidos a domicilio llevan repartidor');
    if (!ORDER_ACTIVE_STATUSES.includes(cur.status)) throw new ConflictException('El pedido ya está cerrado');
    if (driverId) {
      const d = await this.db.query.users.findFirst({ where: and(eq(users.id, driverId), eq(users.businessId, businessId)) });
      if (!d || d.role !== 'DRIVER' || !d.active) throw new BadRequestException('El repartidor no existe o está inactivo');
    }
    await this.db.update(orders).set({ driverId }).where(eq(orders.id, id));
    return this.afterChange(businessId, id, cur.driverId);
  }

  async driverDispatch(actor: Actor, id: string) {
    const uid = this.driverId(actor);
    const cur = await this.findRow(actor.businessId, id);
    if (cur.driverId !== uid) throw new ForbiddenException('Este pedido no está asignado a ti');
    if (cur.status === 'ACEPTADO' || cur.status === 'EN_PREPARACION') {
      // El repartidor sale con el pedido: márcalo listo primero
      await this.transition(actor.businessId, id, 'LISTO');
    }
    return this.transition(actor.businessId, id, 'EN_CAMINO');
  }

  async driverDelivered(actor: Actor, id: string) {
    const uid = this.driverId(actor);
    const cur = await this.findRow(actor.businessId, id);
    if (cur.driverId !== uid) throw new ForbiddenException('Este pedido no está asignado a ti');
    return this.transition(actor.businessId, id, 'ENTREGADO', cur.paymentMethod !== 'TRANSFERENCIA' ? { paid: true } : {});
  }

  private driverId(actor: Actor): string {
    const uid = actorUserId(actor);
    if (!uid) throw new ForbiddenException('Solo repartidores');
    return uid;
  }

  async setPaid(businessId: string, id: string, paid: boolean) {
    await this.findRow(businessId, id);
    await this.db.update(orders).set({ paid }).where(eq(orders.id, id));
    return this.afterChange(businessId, id, null);
  }

  async reprint(businessId: string, id: string) {
    await this.findRow(businessId, id);
    if (!this.printer) throw new ConflictException('La impresión no está configurada');
    const ok = await this.print(id, { reprint: true });
    if (!ok) throw new ConflictException('No se pudo enviar a impresión; revisa las impresoras');
    return { ok: true };
  }

  /** Emite actualizaciones en tiempo real tras cualquier cambio. */
  private async afterChange(businessId: string, id: string, previousDriverId: string | null): Promise<OrderView> {
    const view = await this.get(businessId, id);
    const rooms = [Rooms.managers(businessId), Rooms.pos(businessId)];
    if (view.driverId) rooms.push(Rooms.user(view.driverId));
    if (previousDriverId && previousDriverId !== view.driverId) rooms.push(Rooms.user(previousDriverId));
    this.rt.emit(rooms, RT.ORDER_UPDATED, view);
    try {
      this.rt.emit(Rooms.order(view.publicToken), RT.ORDER_UPDATED, await this.tracking(view.publicToken));
    } catch {
      /* noop */
    }
    return view;
  }

  info(v: OrderView): OrderEventInfo {
    return {
      id: v.id, businessId: v.businessId, folio: v.folio, publicToken: v.publicToken, channel: v.channel, type: v.type, status: v.status,
      customerId: v.customerId, customerName: v.customerName, customerPhone: v.customerPhone, totalCents: v.totalCents,
      estimatedMinutes: v.estimatedMinutes, rejectReason: v.rejectReason, cancelReason: v.cancelReason, driverName: v.driver?.name ?? null,
    };
  }

  /** Último pedido del cliente (para "repetir pedido" del bot). */
  async lastOrderOf(businessId: string, customerId: string) {
    return (
      (await this.db.query.orders.findFirst({
        where: and(eq(orders.businessId, businessId), eq(orders.customerId, customerId)),
        orderBy: desc(orders.createdAt),
        with: { items: true },
      })) ?? null
    );
  }
}
