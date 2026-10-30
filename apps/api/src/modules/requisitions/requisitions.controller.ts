import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AllowDevice, CurrentActor, RequiresModule, Roles } from '../../common/decorators';
import { zbody } from '../../common/pipes/zod.pipe';
import type { Actor } from '../../common/actor';
import { SettingsService } from '../../settings/settings.service';
import { RequisitionsService } from './requisitions.service';
import { ReportsService } from './reports.service';
import { ChatService } from './chat.service';
import {
  CancelSchema, CreateRequisitionBody, FulfillRequisitionSchema, LastQuery, PurchasedSchema, ReceiveRequisitionSchema,
  ReportQuery, ReqListQuery, RequisitionMessageBody, ReviewRequisitionSchema, TemplateListQuery, TemplateSchema, UpdateTemplateSchema,
  zq,
} from './dto';

/** REQ-01..09 · Requisiciones */
@RequiresModule('requisitions')
@Controller('requisitions')
export class RequisitionsController {
  constructor(
    private readonly svc: RequisitionsService,
    private readonly reports: ReportsService,
    private readonly chat: ChatService,
    private readonly settings: SettingsService,
  ) {}

  /** Tablet (su área) o dueña/admin/encargado con `areaId`. Idempotente por clientRequestId: 201 nueva, 200 existente/agrupada. */
  @AllowDevice('AREA')
  @Post()
  async create(
    @CurrentActor() a: Actor,
    @Body(zbody(CreateRequisitionBody)) dto: z.infer<typeof CreateRequisitionBody>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.svc.create(a, dto);
    res.status(r.created ? 201 : 200);
    res.setHeader('X-Requisition-Result', r.created ? 'created' : r.merged ? 'merged' : 'existing');
    return r.requisition;
  }

  @AllowDevice('AREA')
  @Get()
  list(@CurrentActor() a: Actor, @Query(zq(ReqListQuery)) q: z.infer<typeof ReqListQuery>) {
    return this.svc.list(a, q);
  }

  @AllowDevice('AREA')
  @Get('stats/pending')
  stats(@CurrentActor() a: Actor) {
    return this.svc.pendingStats(a);
  }

  @AllowDevice('AREA')
  @Get('last')
  last(@CurrentActor() a: Actor, @Query(zq(LastQuery)) q: z.infer<typeof LastQuery>) {
    return this.svc.last(a, q.areaId);
  }

  // ---------------------------------------------------------- lista de compras (REQ-06)
  @Roles('ADMIN')
  @Get('shopping-list')
  shoppingList(@CurrentActor() a: Actor) {
    return this.svc.shoppingList(a);
  }

  @Roles('ADMIN')
  @Get('shopping-list/print-data')
  async printData(@CurrentActor() a: Actor) {
    const l = await this.svc.shoppingList(a);
    return this.reports.toTicketData(l.businessName, l.groups, new Date(l.generatedAt));
  }

  @Roles('ADMIN')
  @Get('shopping-list.pdf')
  @Header('Content-Type', 'application/pdf')
  async shoppingPdf(@CurrentActor() a: Actor, @Res() res: Response) {
    const l = await this.svc.shoppingList(a);
    const tz = (await this.settings.getBusiness(a.businessId)).timezone;
    const pdf = await this.reports.shoppingPdf(l.businessName, tz, l.groups);
    res.setHeader('Content-Disposition', `inline; filename="lista_de_compras_${l.generatedAt.slice(0, 10)}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  }

  @Roles('ADMIN')
  @Post('shopping-list/purchased')
  @HttpCode(200)
  purchased(@CurrentActor() a: Actor, @Body(zbody(PurchasedSchema)) dto: z.infer<typeof PurchasedSchema>) {
    return this.svc.markPurchased(a, dto);
  }

  // ---------------------------------------------------------- detalle y transiciones
  @AllowDevice('AREA')
  @Get(':id')
  get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.get(a, id);
  }

  @Roles('ADMIN')
  @Post(':id/seen')
  @HttpCode(200)
  seen(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.markSeen(a, id);
  }

  @Roles('ADMIN')
  @Post(':id/review')
  @HttpCode(200)
  review(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(ReviewRequisitionSchema)) dto: z.infer<typeof ReviewRequisitionSchema>) {
    return this.svc.review(a, id, dto);
  }

  @Roles('ADMIN')
  @Post(':id/purchasing')
  @HttpCode(200)
  purchasing(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.purchasing(a, id);
  }

  @Roles('ADMIN')
  @Post(':id/fulfill')
  @HttpCode(200)
  fulfill(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(FulfillRequisitionSchema)) dto: z.infer<typeof FulfillRequisitionSchema>) {
    return this.svc.fulfill(a, id, dto);
  }

  @AllowDevice('AREA')
  @Post(':id/receive')
  @HttpCode(200)
  receive(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(ReceiveRequisitionSchema)) dto: z.infer<typeof ReceiveRequisitionSchema>) {
    return this.svc.receive(a, id, dto);
  }

  @AllowDevice('AREA')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(CancelSchema)) dto: z.infer<typeof CancelSchema>) {
    return this.svc.cancel(a, id, dto.reason);
  }

  /** Hilo de la requisición: crea la conversación si no existe. */
  @AllowDevice('AREA')
  @Post(':id/messages')
  messages(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(RequisitionMessageBody)) dto: z.infer<typeof RequisitionMessageBody>) {
    return this.chat.sendToRequisition(a, id, dto);
  }

  @AllowDevice('AREA')
  @Get(':id/conversation')
  async conversation(@CurrentActor() a: Actor, @Param('id') id: string) {
    const c = await this.chat.ensureRequisitionConversation(a, id);
    return { id: c.id, type: c.type, requisitionId: c.requisitionId, areaId: c.areaId, title: c.title };
  }
}

/** REQ-07 · Plantillas de pedido por área */
@RequiresModule('requisitions')
@Controller('requisition-templates')
export class RequisitionTemplatesController {
  constructor(private readonly svc: RequisitionsService) {}

  @AllowDevice('AREA')
  @Get()
  list(@CurrentActor() a: Actor, @Query(zq(TemplateListQuery)) q: z.infer<typeof TemplateListQuery>) {
    return this.svc.listTemplates(a, q.areaId);
  }

  @AllowDevice('AREA')
  @Post()
  create(@CurrentActor() a: Actor, @Body(zbody(TemplateSchema)) dto: z.infer<typeof TemplateSchema>) {
    return this.svc.createTemplate(a, dto);
  }

  @AllowDevice('AREA')
  @Patch(':id')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(UpdateTemplateSchema)) dto: z.infer<typeof UpdateTemplateSchema>) {
    return this.svc.updateTemplate(a, id, dto);
  }

  @AllowDevice('AREA')
  @Delete(':id')
  remove(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.deleteTemplate(a, id);
  }
}

/** RPT-01 · Reportes de requisiciones */
@RequiresModule('requisitions')
@Roles('ADMIN')
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('requisitions')
  report(@CurrentActor() a: Actor, @Query(zq(ReportQuery)) q: z.infer<typeof ReportQuery>) {
    return this.svc.requisitionsReport(a, q);
  }

  @Get('requisitions.csv')
  async csv(@CurrentActor() a: Actor, @Query(zq(ReportQuery)) q: z.infer<typeof ReportQuery>, @Res() res: Response) {
    const { filename, csv } = await this.svc.requisitionsCsv(a, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
