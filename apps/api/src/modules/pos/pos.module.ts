import { Module } from '@nestjs/common';
import { PosCashController, PosFloorController, PosTicketsController } from './pos.controller';
import { FloorService } from './floor.service';
import { TicketsService } from './tickets.service';
import { CashService } from './cash.service';
import { PosReportsService } from './reports.service';
import { PosStaffGuard } from './pos.common';

/**
 * Módulo C — Punto de venta (opcional, `settings.modules.pos`).
 * Mesas, cuentas, cobro, caja y cortes. Usa PrintingService/KdsService (globales).
 * CashService se exporta para integrar cortes de repartidor desde Delivery.
 */
@Module({
  controllers: [PosFloorController, PosTicketsController, PosCashController],
  providers: [FloorService, TicketsService, CashService, PosReportsService, PosStaffGuard],
  exports: [CashService],
})
export class PosModule {}
