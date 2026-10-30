import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrinterSchema, PrinterDto, PrintJobKind } from '@rh/shared';
import type { PrintDocument, ShoppingListTicketData } from '@rh/printing';
import { AllowDevice, Audit, CurrentActor, Roles } from '../../common/decorators';
import { ZodPipe, zbody } from '../../common/pipes/zod.pipe';
import type { Actor } from '../../common/actor';
import { PrintingService } from './printing.service';
import { KdsService } from './kds.service';
import { ClientPlatform, listConnections } from './printing.logic';

const CreateAgentSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['agent', 'desktop', 'android']).default('agent'),
});

const PrintBlockSchema = z.object({ type: z.string() }).passthrough();
const PrintDocumentSchema = z.object({
  title: z.string().max(120),
  paperWidth: z.union([z.literal(58), z.literal(80)]),
  blocks: z.array(PrintBlockSchema).max(2000),
});
const GenericPrintSchema = z.object({
  printerId: z.string().min(1),
  kind: z.enum(['KITCHEN', 'CUSTOMER', 'BILL', 'PAYMENT', 'CASH_CUT', 'TEST', 'SHOPPING_LIST']).default('SHOPPING_LIST'),
  document: PrintDocumentSchema,
});
const ShoppingListSchema = z.object({
  printerId: z.string().min(1),
  data: z.object({
    businessName: z.string().max(120),
    createdAt: z.string().default(() => new Date().toISOString()),
    groups: z.array(z.object({
      supplierName: z.string().max(120),
      items: z.array(z.object({ name: z.string().max(120), quantity: z.string().max(20), unit: z.string().max(20) })).max(500),
    })).max(100),
  }),
});
const JobsQuery = z.object({
  status: z.enum(['PENDING', 'SENT', 'PRINTED', 'FAILED', 'CANCELLED']).optional(),
  printerId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const PrinterPatchSchema = PrinterSchema.partial();

@Controller('printing')
export class PrintingController {
  constructor(private readonly printing: PrintingService) {}

  // ------------------------------------------------------------- conexiones (APP-03)
  /** Conexiones con etiqueta y quién las atiende. ?platform=web|desktop|android marca `available`. */
  @AllowDevice()
  @Get('connections')
  connections(@Query('platform') platform?: string) {
    const p = (['web', 'desktop', 'android'] as const).find((x) => x === platform) as ClientPlatform | undefined;
    return listConnections(p);
  }

  // ------------------------------------------------------------- agentes
  @Roles('ADMIN')
  @Get('agents')
  agents(@CurrentActor() a: Actor, @Query('includeRevoked') rev?: string) {
    return this.printing.listAgents(a.businessId, rev === 'true' || rev === '1');
  }

  @Roles('ADMIN')
  @Post('agents')
  @Audit('print_agent.create', 'print_agent')
  createAgent(@CurrentActor() a: Actor, @Body(zbody(CreateAgentSchema)) dto: z.infer<typeof CreateAgentSchema>) {
    return this.printing.createAgent(a.businessId, dto);
  }

  @Roles('ADMIN')
  @Post('agents/:id/rotate-token')
  @HttpCode(200)
  @Audit('print_agent.rotate_token', 'print_agent')
  rotate(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.printing.rotateAgentToken(a.businessId, id);
  }

  @Roles('ADMIN')
  @Delete('agents/:id')
  @Audit('print_agent.revoke', 'print_agent')
  revokeAgent(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.printing.revokeAgent(a.businessId, id);
  }

  // ------------------------------------------------------------- impresoras
  /** Lista de impresoras: la necesitan también cajas/tablets (para registrarse como impresor de navegador/Bluetooth). */
  @AllowDevice()
  @Get('printers')
  printers(@CurrentActor() a: Actor) {
    return this.printing.listPrinters(a.businessId);
  }

  @Roles('ADMIN')
  @Post('printers')
  @Audit('printer.create', 'printer')
  createPrinter(@CurrentActor() a: Actor, @Body(zbody(PrinterSchema)) dto: PrinterDto) {
    return this.printing.createPrinter(a.businessId, dto);
  }

  @Roles('ADMIN')
  @Patch('printers/:id')
  @Audit('printer.update', 'printer')
  updatePrinter(@CurrentActor() a: Actor, @Param('id') id: string, @Body(new ZodPipe(PrinterPatchSchema)) dto: Partial<PrinterDto>) {
    return this.printing.updatePrinter(a.businessId, id, dto);
  }

  @Roles('ADMIN')
  @Put('printers/:id')
  @Audit('printer.update', 'printer')
  replacePrinter(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(PrinterSchema)) dto: PrinterDto) {
    return this.printing.updatePrinter(a.businessId, id, dto);
  }

  @Roles('ADMIN')
  @Delete('printers/:id')
  @Audit('printer.delete', 'printer')
  deletePrinter(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.printing.deletePrinter(a.businessId, id);
  }

  @Roles('ADMIN')
  @Post('printers/:id/test')
  @HttpCode(200)
  test(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.printing.testPrinter(a.businessId, id);
  }

  // ------------------------------------------------------------- trabajos
  @Roles('ADMIN')
  @Get('jobs')
  jobs(@CurrentActor() a: Actor, @Query(new ZodPipe(JobsQuery)) q: z.infer<typeof JobsQuery>) {
    return this.printing.listJobs(a.businessId, q);
  }

  /** Detalle con documento (vista previa / reimpresión en navegador). */
  @Roles('ADMIN', 'CASHIER')
  @Get('jobs/:id')
  job(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.printing.getJob(a.businessId, id, true);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post('jobs/:id/retry')
  @HttpCode(200)
  retry(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.printing.retryJob(a.businessId, id);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post('jobs/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.printing.cancelJob(a.businessId, id);
  }

  @Roles('ADMIN')
  @Post('print')
  @HttpCode(200)
  print(@CurrentActor() a: Actor, @Body(zbody(GenericPrintSchema)) dto: z.infer<typeof GenericPrintSchema>) {
    return this.printing.printGeneric(a.businessId, dto.printerId, dto.kind as PrintJobKind, dto.document as unknown as PrintDocument);
  }

  @Roles('ADMIN')
  @Post('print-shopping-list')
  @HttpCode(200)
  printShoppingList(@CurrentActor() a: Actor, @Body(zbody(ShoppingListSchema)) dto: z.infer<typeof ShoppingListSchema>) {
    return this.printing.printShoppingList(a.businessId, dto.printerId, dto.data as ShoppingListTicketData);
  }
}

// =====================================================================
// KDS (ORD-06)
// =====================================================================
const KdsDoneSchema = z.object({ source: z.enum(['ORDER', 'TICKET']), itemIds: z.array(z.string().min(1)).min(1).max(200) });

@Controller('kds')
export class KdsController {
  constructor(private readonly kds: KdsService) {}

  @AllowDevice('KDS')
  @Roles('ADMIN', 'AREA_LEAD', 'CASHIER')
  @Get('items')
  items(@CurrentActor() a: Actor, @Query('areaId') areaId?: string, @Query('includeDone') inc?: string) {
    return this.kds.items(a.businessId, this.kds.resolveArea(a, areaId), { includeDone: inc === 'true' || inc === '1' });
  }

  @AllowDevice('KDS')
  @Roles('ADMIN', 'AREA_LEAD')
  @Post('items/done')
  @HttpCode(200)
  done(@CurrentActor() a: Actor, @Body(zbody(KdsDoneSchema)) dto: z.infer<typeof KdsDoneSchema>, @Query('areaId') areaId?: string) {
    return this.kds.setDone(a.businessId, this.optionalArea(a, areaId), dto.source, dto.itemIds, true);
  }

  @AllowDevice('KDS')
  @Roles('ADMIN', 'AREA_LEAD')
  @Post('items/undo')
  @HttpCode(200)
  undo(@CurrentActor() a: Actor, @Body(zbody(KdsDoneSchema)) dto: z.infer<typeof KdsDoneSchema>, @Query('areaId') areaId?: string) {
    return this.kds.setDone(a.businessId, this.optionalArea(a, areaId), dto.source, dto.itemIds, false);
  }

  @AllowDevice('KDS')
  @Roles('ADMIN', 'AREA_LEAD')
  @Post('groups/:source/:id/done')
  @HttpCode(200)
  groupDone(@CurrentActor() a: Actor, @Param('source') source: string, @Param('id') id: string, @Query('areaId') areaId?: string) {
    const s = z.enum(['ORDER', 'TICKET']).parse(source.toUpperCase());
    return this.kds.groupDone(a.businessId, this.optionalArea(a, areaId), s, id);
  }

  /** Pantalla KDS: solo su área. Gerente: el área indicada o cualquiera. */
  private optionalArea(a: Actor, areaId?: string): string | null {
    if (a.kind === 'device' && a.purpose === 'KDS') return this.kds.resolveArea(a, areaId);
    return areaId ?? null;
  }
}
