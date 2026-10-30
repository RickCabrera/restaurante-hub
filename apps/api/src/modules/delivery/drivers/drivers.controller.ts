import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Audit, CurrentActor, RequiresModule, Roles } from '../../../common/decorators';
import type { Actor } from '../../../common/actor';
import { OrdersService } from '../orders/orders.service';
import { DriversService } from './drivers.service';

@RequiresModule('delivery')
@Controller('drivers')
export class DriversController {
  constructor(private readonly svc: DriversService) {}

  @Roles('ADMIN', 'CASHIER')
  @Get()
  list(@CurrentActor() a: Actor) {
    return this.svc.list(a.businessId);
  }

  @Roles('ADMIN', 'CASHIER')
  @Get(':id/summary')
  summary(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.summary(a.businessId, id);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post(':id/settle')
  @HttpCode(200)
  @Audit('driver.settle', 'app_user')
  settle(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.settle(a, id);
  }
}

/** Vista del repartidor (/repartidor). */
@RequiresModule('delivery')
@Roles('DRIVER')
@Controller('driver')
export class DriverController {
  constructor(private readonly svc: DriversService, private readonly orders: OrdersService) {}

  @Get('orders')
  orders_(@CurrentActor() a: Actor) {
    return this.svc.myOrders(a);
  }

  @Get('summary')
  summary(@CurrentActor() a: Actor) {
    return this.svc.mySummary(a);
  }

  @Post('orders/:id/dispatch')
  @HttpCode(200)
  @Audit('order.dispatch', 'delivery_order')
  dispatch(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.orders.driverDispatch(a, id);
  }

  @Post('orders/:id/delivered')
  @HttpCode(200)
  @Audit('order.delivered', 'delivery_order')
  delivered(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.orders.driverDelivered(a, id);
  }
}
