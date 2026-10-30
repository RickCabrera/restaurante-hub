import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Audit, CurrentActor, RequiresModule, Roles } from '../../../common/decorators';
import { zbody } from '../../../common/pipes/zod.pipe';
import type { Actor } from '../../../common/actor';
import { CouponPatchSchema, CouponSchema, PromotionPatchSchema, PromotionSchema } from '../common/dto';
import { PromotionsService } from './promotions.service';

@RequiresModule('delivery')
@Roles('ADMIN')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly svc: PromotionsService) {}

  @Get()
  list(@CurrentActor() a: Actor) {
    return this.svc.listCoupons(a.businessId);
  }

  @Get(':id')
  get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.getCoupon(a.businessId, id);
  }

  @Post()
  @Audit('coupon.create', 'coupon')
  create(@CurrentActor() a: Actor, @Body(zbody(CouponSchema)) dto: z.infer<typeof CouponSchema>) {
    return this.svc.createCoupon(a.businessId, dto);
  }

  @Patch(':id')
  @Audit('coupon.update', 'coupon')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(CouponPatchSchema)) dto: z.infer<typeof CouponPatchSchema>) {
    return this.svc.updateCoupon(a.businessId, id, dto);
  }

  @Delete(':id')
  @Audit('coupon.delete', 'coupon')
  remove(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.deleteCoupon(a.businessId, id);
  }
}

@RequiresModule('delivery')
@Roles('ADMIN')
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly svc: PromotionsService) {}

  @Get()
  list(@CurrentActor() a: Actor) {
    return this.svc.listPromotions(a.businessId);
  }

  @Get(':id')
  get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.getPromotion(a.businessId, id);
  }

  @Post()
  @Audit('promotion.create', 'promotion')
  create(@CurrentActor() a: Actor, @Body(zbody(PromotionSchema)) dto: z.infer<typeof PromotionSchema>) {
    return this.svc.createPromotion(a.businessId, dto);
  }

  @Patch(':id')
  @Audit('promotion.update', 'promotion')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(PromotionPatchSchema)) dto: z.infer<typeof PromotionPatchSchema>) {
    return this.svc.updatePromotion(a.businessId, id, dto);
  }

  @Delete(':id')
  @Audit('promotion.delete', 'promotion')
  remove(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.deletePromotion(a.businessId, id);
  }
}
