import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Audit, CurrentActor, RequiresModule, Roles } from '../../../common/decorators';
import { zbody } from '../../../common/pipes/zod.pipe';
import type { Actor } from '../../../common/actor';
import { BranchPatchSchema, BranchSchema, PauseSchema } from '../common/dto';
import { BranchesService } from './branches.service';

@RequiresModule('delivery')
@Controller('branches')
export class BranchesController {
  constructor(private readonly svc: BranchesService) {}

  @Get()
  list(@CurrentActor() a: Actor) {
    return this.svc.list(a.businessId);
  }

  @Get(':id')
  async get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.withStatus(await this.svc.get(a.businessId, id));
  }

  @Roles('ADMIN')
  @Post()
  @Audit('branch.create', 'branch')
  create(@CurrentActor() a: Actor, @Body(zbody(BranchSchema)) dto: z.infer<typeof BranchSchema>) {
    return this.svc.create(a.businessId, dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @Audit('branch.update', 'branch')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(BranchPatchSchema)) dto: z.infer<typeof BranchPatchSchema>) {
    return this.svc.update(a.businessId, id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @Audit('branch.deactivate', 'branch')
  remove(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.remove(a.businessId, id);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post(':id/pause')
  @HttpCode(200)
  @Audit('branch.pause', 'branch')
  pause(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(PauseSchema)) dto: z.infer<typeof PauseSchema>) {
    return this.svc.pause(a.businessId, id, dto);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post(':id/resume')
  @HttpCode(200)
  @Audit('branch.resume', 'branch')
  resume(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.resume(a.businessId, id);
  }
}
