import { Module } from '@nestjs/common';
import { AreasController, AuditLogsController, DevicesController, UsersController } from './admin.controller';
import { SuppliersController, SuppliesController, SupplyCategoriesController, TabletController } from './catalog.controller';
import { ReportsController, RequisitionsController, RequisitionTemplatesController } from './requisitions.controller';
import { ChatController } from './chat.controller';
import { UsersService } from './users.service';
import { AreasService } from './areas.service';
import { CatalogService } from './catalog.service';
import { RequisitionsService } from './requisitions.service';
import { ChatService } from './chat.service';
import { ReportsService } from './reports.service';

/**
 * Módulo A — Requisiciones internas (ver BACKLOG.md F1):
 * usuarios/personal, áreas y tablets, catálogo de insumos, requisiciones, lista de compras,
 * plantillas, chat interno, bitácora y reportes.
 */
@Module({
  controllers: [
    UsersController, AreasController, DevicesController, AuditLogsController,
    SupplyCategoriesController, SuppliersController, SuppliesController, TabletController,
    RequisitionsController, RequisitionTemplatesController, ReportsController, ChatController,
  ],
  providers: [UsersService, AreasService, CatalogService, RequisitionsService, ChatService, ReportsService],
  exports: [RequisitionsService, CatalogService, ChatService],
})
export class RequisitionsModule {}
