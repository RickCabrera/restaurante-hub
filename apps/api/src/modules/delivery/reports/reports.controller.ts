import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentActor, RequiresModule, Roles } from '../../../common/decorators';
import { zbody } from '../../../common/pipes/zod.pipe';
import type { Actor } from '../../../common/actor';
import { ReportQuerySchema } from '../common/dto';
import { ReportsService } from './reports.service';

@RequiresModule('delivery')
@Roles('ADMIN')
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('sales')
  sales(@CurrentActor() a: Actor, @Query(zbody(ReportQuerySchema)) q: z.infer<typeof ReportQuerySchema>) {
    return this.svc.sales(a.businessId, q);
  }

  @Get('sales.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(@CurrentActor() a: Actor, @Query(zbody(ReportQuerySchema)) q: z.infer<typeof ReportQuerySchema>, @Res() res: Response) {
    const csv = await this.svc.salesCsv(a.businessId, q);
    res.setHeader('Content-Disposition', `attachment; filename="ventas-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }
}
