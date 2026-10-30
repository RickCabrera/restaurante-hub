import { Module } from '@nestjs/common';
import { DeliveryEvents } from './common/delivery-events';
import { PublicBusinessResolver } from './common/public-business';
import { BranchesController } from './branches/branches.controller';
import { BranchesService, StoreHoursService } from './branches/branches.service';
import { ZonesController } from './zones/zones.controller';
import { CoverageService, ZonesService } from './zones/zones.service';
import { GeoController } from './geo/geo.controller';
import { geoFactory, GeoService } from './geo/geo.service';
import { MenuController } from './menu/menu.controller';
import { MenuService } from './menu/menu.service';
import { CustomersController } from './customers/customers.controller';
import { CustomersService } from './customers/customers.service';
import { CouponsController, PromotionsController } from './promotions/promotions.controller';
import { PricingService, PromotionsService } from './promotions/promotions.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { DriverController, DriversController } from './drivers/drivers.controller';
import { DriversService } from './drivers/drivers.service';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { PublicDeliveryController } from './public/public.controller';

/**
 * Módulo B — Delivery: sucursales/horarios, zonas, geocodificación, menú, clientes, promociones/cupones,
 * pedidos, repartidores y reportes. Ver BACKLOG.md (MENU, CLI, ZON, ORD, DRV, WEB, PRM, RPT, CFG-03).
 */
@Module({
  controllers: [
    BranchesController, ZonesController, GeoController, MenuController, CustomersController, CouponsController,
    PromotionsController, OrdersController, DriversController, DriverController, ReportsController, PublicDeliveryController,
  ],
  providers: [
    DeliveryEvents, PublicBusinessResolver, StoreHoursService, BranchesService, CoverageService, ZonesService,
    { provide: GeoService, useFactory: geoFactory },
    MenuService, CustomersService, PricingService, PromotionsService, OrdersService, DriversService, ReportsService,
  ],
  exports: [
    DeliveryEvents, StoreHoursService, BranchesService, CoverageService, GeoService, MenuService, CustomersService,
    PricingService, PromotionsService, OrdersService, ReportsService,
  ],
})
export class DeliveryModule {}
