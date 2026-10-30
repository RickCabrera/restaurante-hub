import { Body, Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Public } from '../../../common/decorators';
import { zbody } from '../../../common/pipes/zod.pipe';
import { GeoQuerySchema, LatLngQuerySchema, PublicCreateOrderSchema, PublicMenuQuerySchema, QuoteSchema } from '../common/dto';
import { PublicBusinessResolver } from '../common/public-business';
import { BranchesService } from '../branches/branches.service';
import { CoverageService } from '../zones/zones.service';
import { GeoService } from '../geo/geo.service';
import { MenuService } from '../menu/menu.service';
import { PricingService } from '../promotions/promotions.service';
import { OrdersService } from '../orders/orders.service';

/** Endpoints públicos del menú web /pedir y seguimiento /pedido/:token (WEB-01..03). */
@Public()
@Controller('public/:slug')
export class PublicDeliveryController {
  constructor(
    private readonly resolver: PublicBusinessResolver,
    private readonly menu: MenuService,
    private readonly branches: BranchesService,
    private readonly coverage: CoverageService,
    private readonly geo: GeoService,
    private readonly pricing: PricingService,
    private readonly orders: OrdersService,
  ) {}

  @Get('menu')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  async menu_(@Param('slug') slug: string, @Query(zbody(PublicMenuQuerySchema)) q: z.infer<typeof PublicMenuQuerySchema>) {
    const { business: b, settings: s } = await this.resolver.resolve(slug);
    const branches = await this.branches.list(b.id, { activeOnly: true });
    const branchId = q.branchId && branches.some((x) => x.id === q.branchId) ? q.branchId : branches[0]?.id ?? null;
    const categories = await this.menu.getMenu(b.id, { channel: q.channel, branchId });
    return {
      business: {
        name: b.name,
        slug: b.slug,
        logoUrl: b.logoUrl,
        primaryColor: b.primaryColor,
        accentColor: b.accentColor,
        phone: b.phone,
        address: b.address,
        currency: b.currency,
        timezone: b.timezone,
        paymentMethods: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'],
        transferInfo: s.transferInfo ?? null,
        privacyNoticeUrl: s.privacyNoticeUrl ?? null,
      },
      branches: branches.map((x) => ({
        id: x.id,
        name: x.name,
        address: x.address,
        phone: x.phone,
        lat: x.lat,
        lng: x.lng,
        acceptsDelivery: x.acceptsDelivery,
        acceptsPickup: x.acceptsPickup,
        prepMinutes: x.prepMinutes,
        isOpen: x.status.open,
        statusMessage: x.status.message,
        nextOpeningText: x.status.nextOpeningText,
        nextOpeningAt: x.status.nextOpeningAt,
        hoursText: x.status.hoursText,
        hours: x.hours,
      })),
      branchId,
      channel: q.channel,
      categories,
      generatedAt: new Date().toISOString(),
    };
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('geo/autocomplete')
  async autocomplete(@Param('slug') slug: string, @Query(zbody(GeoQuerySchema)) q: z.infer<typeof GeoQuerySchema>) {
    await this.resolver.resolve(slug);
    const bias = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined;
    return { suggestions: await this.geo.autocomplete(q.q, bias) };
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('geo/geocode')
  async geocode(@Param('slug') slug: string, @Query(zbody(GeoQuerySchema)) q: z.infer<typeof GeoQuerySchema>) {
    await this.resolver.resolve(slug);
    return { result: await this.geo.geocode(q.q) };
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('geo/reverse')
  async reverse(@Param('slug') slug: string, @Query(zbody(LatLngQuerySchema)) q: z.infer<typeof LatLngQuerySchema>) {
    await this.resolver.resolve(slug);
    return { result: await this.geo.reverse(q.lat, q.lng) };
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('coverage')
  async coverage_(@Param('slug') slug: string, @Query(zbody(LatLngQuerySchema)) q: z.infer<typeof LatLngQuerySchema>) {
    const { business } = await this.resolver.resolve(slug);
    const c = await this.coverage.resolve(business.id, q.lat, q.lng);
    return c
      ? { covered: true, zone: { id: c.zone.id, name: c.zone.name }, branchId: c.branchId, branchName: c.branch.name, feeCents: c.feeCents, minOrderCents: c.minOrderCents, freeFromCents: c.freeFromCents, etaMinutes: c.etaMinutes }
      : { covered: false, message: 'Lo sentimos, tu ubicación está fuera de nuestra zona de reparto. Puedes pasar a recoger tu pedido.' };
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('orders/quote')
  @HttpCode(200)
  async quote(@Param('slug') slug: string, @Body(zbody(QuoteSchema)) dto: z.infer<typeof QuoteSchema>) {
    const { business } = await this.resolver.resolve(slug);
    return this.pricing.quote(business.id, { ...dto, channel: 'WEB' });
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('orders')
  async create(@Param('slug') slug: string, @Body(zbody(PublicCreateOrderSchema)) dto: z.infer<typeof PublicCreateOrderSchema>) {
    const { business } = await this.resolver.resolve(slug);
    const o = await this.orders.create(business.id, { ...dto, channel: 'WEB' }, { channel: 'WEB', isPublic: true });
    return this.orders.tracking(o.publicToken, business.id);
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('orders/:token')
  async track(@Param('slug') slug: string, @Param('token') token: string) {
    const { business } = await this.resolver.resolve(slug);
    return this.orders.tracking(token, business.id);
  }
}
