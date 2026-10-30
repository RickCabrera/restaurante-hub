import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AllowDevice, Audit, CurrentActor, RequiresModule, Roles } from '../../../common/decorators';
import { zbody } from '../../../common/pipes/zod.pipe';
import type { Actor } from '../../../common/actor';
import {
  AcceptSchema, AssignDriverSchema, ManagerCreateOrderSchema, ManagerQuoteSchema, OrderListSchema, PaidSchema, ReasonSchema, StatusSchema,
} from '../common/dto';
import { PricingService } from '../promotions/promotions.service';
import { OrdersService } from './orders.service';

@RequiresModule('delivery')
@Roles('ADMIN', 'CASHIER')
@Controller('orders')
export class OrdersController {
  constructor(private readonly svc: OrdersService, private readonly pricing: PricingService) {}

  @AllowDevice('POS')
  @Get()
  list(@CurrentActor() a: Actor, @Query(zbody(OrderListSchema)) q: z.infer<typeof OrderListSchema>) {
    return this.svc.list(a.businessId, q);
  }

  /** Cotizar en captura manual */
  @Post('quote')
  @HttpCode(200)
  quote(@CurrentActor() a: Actor, @Body(zbody(ManagerQuoteSchema)) dto: z.infer<typeof ManagerQuoteSchema>) {
    return this.pricing.quote(a.businessId, dto);
  }

  /** Captura manual (teléfono / mostrador) */
  @Post()
  @Audit('order.create', 'delivery_order')
  create(@CurrentActor() a: Actor, @Body(zbody(ManagerCreateOrderSchema)) dto: z.infer<typeof ManagerCreateOrderSchema>) {
    return this.svc.create(a.businessId, dto, { channel: dto.channel, actor: a });
  }

  @AllowDevice('POS')
  @Get(':id')
  get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.get(a.businessId, id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  @Audit('order.accept', 'delivery_order')
  accept(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(AcceptSchema)) dto: z.infer<typeof AcceptSchema>) {
    return this.svc.accept(a.businessId, id, dto.estimatedMinutes);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Audit('order.reject', 'delivery_order')
  reject(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(ReasonSchema)) dto: z.infer<typeof ReasonSchema>) {
    return this.svc.reject(a.businessId, id, dto.reason);
  }

  @Post(':id/status')
  @HttpCode(200)
  @Audit('order.status', 'delivery_order')
  status(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(StatusSchema)) dto: z.infer<typeof StatusSchema>) {
    return this.svc.setStatus(a.businessId, id, dto.status);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Audit('order.cancel', 'delivery_order')
  cancel(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(ReasonSchema)) dto: z.infer<typeof ReasonSchema>) {
    return this.svc.cancel(a.businessId, id, dto.reason);
  }

  @Post(':id/assign-driver')
  @HttpCode(200)
  @Audit('order.assign_driver', 'delivery_order')
  assign(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(AssignDriverSchema)) dto: z.infer<typeof AssignDriverSchema>) {
    return this.svc.assignDriver(a.businessId, id, dto.driverId);
  }

  @Post(':id/reprint')
  @HttpCode(200)
  @Audit('order.reprint', 'delivery_order')
  reprint(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.reprint(a.businessId, id);
  }

  @Patch(':id/paid')
  @Audit('order.paid', 'delivery_order')
  paid(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(PaidSchema)) dto: z.infer<typeof PaidSchema>) {
    return this.svc.setPaid(a.businessId, id, dto.paid);
  }
}
