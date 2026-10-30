import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Audit, CurrentActor, RequiresModule, Roles } from '../../../common/decorators';
import { zbody } from '../../../common/pipes/zod.pipe';
import type { Actor } from '../../../common/actor';
import { LatLngQuerySchema, ZonePatchSchema, ZoneSchema } from '../common/dto';
import { CoverageService, ZonesService } from './zones.service';

@RequiresModule('delivery')
@Controller('zones')
export class ZonesController {
  constructor(private readonly svc: ZonesService, private readonly coverage: CoverageService) {}

  @Get()
  list(@CurrentActor() a: Actor) {
    return this.svc.list(a.businessId);
  }

  /** Prueba de cobertura desde el admin: GET /zones/coverage?lat&lng */
  @Get('coverage')
  check(@CurrentActor() a: Actor, @Query(zbody(LatLngQuerySchema)) q: z.infer<typeof LatLngQuerySchema>) {
    return this.coverage.resolve(a.businessId, q.lat, q.lng).then((r) => ({ covered: !!r, coverage: r }));
  }

  @Get(':id')
  get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.get(a.businessId, id);
  }

  @Roles('ADMIN')
  @Post()
  @Audit('zone.create', 'delivery_zone')
  create(@CurrentActor() a: Actor, @Body(zbody(ZoneSchema)) dto: z.infer<typeof ZoneSchema>) {
    return this.svc.create(a.businessId, dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @Audit('zone.update', 'delivery_zone')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(ZonePatchSchema)) dto: z.infer<typeof ZonePatchSchema>) {
    return this.svc.update(a.businessId, id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @Audit('zone.delete', 'delivery_zone')
  remove(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.remove(a.businessId, id);
  }
}
