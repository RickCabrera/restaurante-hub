import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { AddTicketLinesSchema, CashMovementSchema, PayTicketSchema } from '@rh/shared';
import { Audit, CurrentActor, Roles } from '../../common/decorators';
import { ZodPipe, zbody } from '../../common/pipes/zod.pipe';
import type { Actor } from '../../common/actor';
import {
  CloseCashSchema, DiningAreaSchema, DiscountSchema, LayoutSchema, LineDiscountSchema, MergeSchema, MoveSchema,
  OpenCashSchema, OpenTicketSchema, PatchLineSchema, PatchTicketSchema, PrintTicketSchema, RangeQuery, ReasonSchema,
  ReorderSchema, SplitSchema, TablePatchSchema, TableSchema, TicketsQuery, TipSchema,
} from './dto';
import { PosController, PosReadWithoutPin } from './pos.common';
import { FloorService } from './floor.service';
import { TicketsService } from './tickets.service';
import { CashService } from './cash.service';
import { PosReportsService } from './reports.service';
import type { PaymentInput } from './pos.logic';

const STAFF = ['WAITER', 'CASHIER', 'ADMIN'] as const;
const CASH = ['CASHIER', 'ADMIN'] as const;

// =====================================================================
// Salones, mesas, plano y menú (POS-02)
// =====================================================================
@Controller('pos')
@PosController()
export class PosFloorController {
  constructor(private readonly floor: FloorService, private readonly reports: PosReportsService) {}

  @Roles(...STAFF)
  @PosReadWithoutPin()
  @Get('floor')
  floorPlan(@CurrentActor() a: Actor) {
    return this.floor.floor(a.businessId);
  }

  @Roles(...STAFF)
  @PosReadWithoutPin()
  @Get('menu')
  menu(@CurrentActor() a: Actor) {
    return this.reports.menu(a.businessId);
  }

  @Roles(...STAFF)
  @PosReadWithoutPin()
  @Get('dining-areas')
  areas(@CurrentActor() a: Actor) {
    return this.floor.listAreas(a.businessId);
  }

  @Roles('ADMIN')
  @Post('dining-areas')
  @Audit('pos.dining_area.create', 'dining_area')
  createArea(@CurrentActor() a: Actor, @Body(zbody(DiningAreaSchema)) dto: z.infer<typeof DiningAreaSchema>) {
    return this.floor.createArea(a.businessId, dto);
  }

  @Roles('ADMIN')
  @Put('dining-areas/reorder')
  reorderAreas(@CurrentActor() a: Actor, @Body(zbody(ReorderSchema)) dto: z.infer<typeof ReorderSchema>) {
    return this.floor.reorderAreas(a.businessId, dto.ids);
  }

  @Roles('ADMIN')
  @Patch('dining-areas/:id')
  @Audit('pos.dining_area.update', 'dining_area')
  updateArea(@CurrentActor() a: Actor, @Param('id') id: string, @Body(new ZodPipe(DiningAreaSchema.partial())) dto: Partial<z.infer<typeof DiningAreaSchema>>) {
    return this.floor.updateArea(a.businessId, id, dto);
  }

  @Roles('ADMIN')
  @Delete('dining-areas/:id')
  @Audit('pos.dining_area.delete', 'dining_area')
  deleteArea(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.floor.deleteArea(a.businessId, id);
  }

  @Roles(...STAFF)
  @PosReadWithoutPin()
  @Get('tables')
  tables(@CurrentActor() a: Actor) {
    return this.floor.listTables(a.businessId);
  }

  @Roles('ADMIN')
  @Post('tables')
  @Audit('pos.table.create', 'dining_table')
  createTable(@CurrentActor() a: Actor, @Body(zbody(TableSchema)) dto: z.infer<typeof TableSchema>) {
    return this.floor.createTable(a.businessId, dto);
  }

  @Roles('ADMIN')
  @Put('tables/layout')
  layout(@CurrentActor() a: Actor, @Body(zbody(LayoutSchema)) dto: z.infer<typeof LayoutSchema>) {
    return this.floor.saveLayout(a.businessId, dto);
  }

  @Roles('ADMIN')
  @Patch('tables/:id')
  @Audit('pos.table.update', 'dining_table')
  updateTable(@CurrentActor() a: Actor, @Param('id') id: string, @Body(new ZodPipe(TablePatchSchema)) dto: z.infer<typeof TablePatchSchema>) {
    return this.floor.updateTable(a.businessId, id, dto);
  }

  @Roles('ADMIN')
  @Delete('tables/:id')
  @Audit('pos.table.delete', 'dining_table')
  deleteTable(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.floor.deleteTable(a.businessId, id);
  }
}

// =====================================================================
// Cuentas (POS-03..06)
// =====================================================================
@Controller('pos/tickets')
@PosController()
export class PosTicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Roles(...STAFF)
  @PosReadWithoutPin()
  @Get()
  list(@CurrentActor() a: Actor, @Query(new ZodPipe(TicketsQuery)) q: z.infer<typeof TicketsQuery>) {
    return this.tickets.list(a.businessId, q, a);
  }

  @Roles(...STAFF)
  @PosReadWithoutPin()
  @Get(':id')
  get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.tickets.detail(a.businessId, id);
  }

  @Roles(...STAFF)
  @Post()
  open(@CurrentActor() a: Actor, @Body(zbody(OpenTicketSchema)) dto: z.infer<typeof OpenTicketSchema>) {
    return this.tickets.open(a, dto);
  }

  @Roles(...STAFF)
  @Patch(':id')
  patch(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(PatchTicketSchema)) dto: z.infer<typeof PatchTicketSchema>) {
    return this.tickets.patch(a, id, dto);
  }

  @Roles(...STAFF)
  @Post(':id/lines')
  addLines(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(AddTicketLinesSchema)) dto: z.infer<typeof AddTicketLinesSchema>) {
    return this.tickets.addLines(a, id, dto.lines);
  }

  @Roles(...STAFF)
  @Patch(':id/lines/:lineId')
  patchLine(@CurrentActor() a: Actor, @Param('id') id: string, @Param('lineId') lineId: string, @Body(zbody(PatchLineSchema)) dto: z.infer<typeof PatchLineSchema>) {
    return this.tickets.patchLine(a, id, lineId, dto);
  }

  /** Sin enviar: cualquier mesero. Enviado a cocina: CASHIER/ADMIN (se valida en el servicio). */
  @Roles(...STAFF)
  @Post(':id/lines/:lineId/cancel')
  @HttpCode(200)
  cancelLine(@CurrentActor() a: Actor, @Param('id') id: string, @Param('lineId') lineId: string, @Body(zbody(ReasonSchema)) dto: z.infer<typeof ReasonSchema>) {
    return this.tickets.cancelLine(a, id, lineId, dto.reason);
  }

  @Roles(...CASH)
  @Post(':id/lines/:lineId/discount')
  @HttpCode(200)
  lineDiscount(@CurrentActor() a: Actor, @Param('id') id: string, @Param('lineId') lineId: string, @Body(zbody(LineDiscountSchema)) dto: z.infer<typeof LineDiscountSchema>) {
    return this.tickets.lineDiscount(a, id, lineId, dto);
  }

  @Roles(...STAFF)
  @Post(':id/send')
  @HttpCode(200)
  send(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.tickets.send(a, id);
  }

  @Roles(...CASH)
  @Post(':id/discount')
  @HttpCode(200)
  discount(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(DiscountSchema)) dto: z.infer<typeof DiscountSchema>) {
    return this.tickets.discount(a, id, dto);
  }

  @Roles(...STAFF)
  @Post(':id/tip')
  @HttpCode(200)
  tip(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(TipSchema)) dto: z.infer<typeof TipSchema>) {
    return this.tickets.tip(a, id, dto);
  }

  @Roles(...STAFF)
  @Post(':id/request-bill')
  @HttpCode(200)
  requestBill(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.tickets.requestBill(a, id);
  }

  @Roles(...STAFF)
  @Post(':id/split')
  @HttpCode(200)
  split(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(SplitSchema)) dto: z.infer<typeof SplitSchema>) {
    return this.tickets.split(a, id, dto);
  }

  @Roles(...STAFF)
  @Post(':id/merge')
  @HttpCode(200)
  merge(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(MergeSchema)) dto: z.infer<typeof MergeSchema>) {
    return this.tickets.merge(a, id, dto.sourceTicketId);
  }

  @Roles(...STAFF)
  @Post(':id/move')
  @HttpCode(200)
  move(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(MoveSchema)) dto: z.infer<typeof MoveSchema>) {
    return this.tickets.move(a, id, dto.tableId);
  }

  @Roles(...CASH)
  @Post(':id/pay')
  @HttpCode(200)
  pay(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(PayTicketSchema)) dto: z.infer<typeof PayTicketSchema>) {
    return this.tickets.pay(a, id, dto.payments as PaymentInput[]);
  }

  @Roles(...CASH)
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(ReasonSchema)) dto: z.infer<typeof ReasonSchema>) {
    return this.tickets.cancel(a, id, dto.reason);
  }

  @Roles(...STAFF)
  @Post(':id/print')
  @HttpCode(200)
  print(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(PrintTicketSchema)) dto: z.infer<typeof PrintTicketSchema>) {
    return this.tickets.print(a, id, dto.kind);
  }
}

// =====================================================================
// Caja (POS-07) y reportes (POS-09)
// =====================================================================
@Controller('pos')
@PosController()
export class PosCashController {
  constructor(private readonly cash: CashService, private readonly reports: PosReportsService) {}

  @Roles(...CASH)
  @Post('cash-sessions/open')
  open(@CurrentActor() a: Actor, @Body(zbody(OpenCashSchema)) dto: z.infer<typeof OpenCashSchema>) {
    return this.cash.open(a, dto);
  }

  @Roles(...CASH)
  @Get('cash-sessions/current')
  current(@CurrentActor() a: Actor) {
    return this.cash.current(a);
  }

  @Roles('ADMIN')
  @Get('cash-sessions')
  list(@CurrentActor() a: Actor, @Query(new ZodPipe(RangeQuery)) q: z.infer<typeof RangeQuery>) {
    return this.cash.list(a.businessId, q);
  }

  @Roles(...CASH)
  @Get('cash-sessions/:id')
  detail(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.cash.detail(a.businessId, id);
  }

  @Roles(...CASH)
  @Post('cash-sessions/:id/movements')
  movement(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(CashMovementSchema)) dto: z.infer<typeof CashMovementSchema>) {
    return this.cash.addMovement(a, id, dto);
  }

  @Roles(...CASH)
  @Get('cash-sessions/:id/summary')
  summary(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.cash.summary(a.businessId, id);
  }

  @Roles(...CASH)
  @Post('cash-sessions/:id/cut-x')
  @HttpCode(200)
  cutX(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.cash.cutX(a, id);
  }

  @Roles(...CASH)
  @Post('cash-sessions/:id/close')
  @HttpCode(200)
  close(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(CloseCashSchema)) dto: z.infer<typeof CloseCashSchema>) {
    return this.cash.close(a, id, dto);
  }

  @Roles('ADMIN')
  @Get('reports')
  report(@CurrentActor() a: Actor, @Query(new ZodPipe(RangeQuery)) q: z.infer<typeof RangeQuery>) {
    return this.reports.report(a.businessId, q);
  }
}
