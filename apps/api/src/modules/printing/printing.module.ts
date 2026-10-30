import { Global, Module } from '@nestjs/common';
import { OrderPrinter } from './order-printer.port';
import { PrintingService } from './printing.service';
import { KdsService } from './kds.service';
import { KdsController, PrintingController } from './printing.controller';

/**
 * Impresión (PRN-01..04) y monitor de cocina (ORD-06).
 * Global: Delivery inyecta `OrderPrinter`; POS usa `PrintingService` y `KdsService`.
 */
@Global()
@Module({
  controllers: [PrintingController, KdsController],
  providers: [PrintingService, KdsService, { provide: OrderPrinter, useExisting: PrintingService }],
  exports: [PrintingService, KdsService, OrderPrinter],
})
export class PrintingModule {}
