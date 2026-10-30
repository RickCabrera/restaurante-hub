import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AllowDevice, Audit, CurrentActor, Roles } from '../../common/decorators';
import { zbody } from '../../common/pipes/zod.pipe';
import type { Actor } from '../../common/actor';
import { UsersService } from './users.service';
import { AreasService } from './areas.service';
import { ReportsService } from './reports.service';
import {
  AreaSchema, AuditQuery, CreateUserSchema, ReorderSchema, ResetPasswordSchema, SetPinSchema, UpdateAreaSchema,
  UpdateDeviceSchema, UpdateUserSchema, UserListQuery,
  zq,
} from './dto';

/** CORE-07 · Usuarios y personal */
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  list(@CurrentActor() a: Actor, @Query(zq(UserListQuery)) q: z.infer<typeof UserListQuery>) {
    return this.svc.list(a, q);
  }

  @Get(':id')
  get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.get(a, id);
  }

  @Post()
  @Audit('user.create', 'user')
  create(@CurrentActor() a: Actor, @Body(zbody(CreateUserSchema)) dto: z.infer<typeof CreateUserSchema>) {
    return this.svc.create(a, dto);
  }

  @Patch(':id')
  @Audit('user.update', 'user')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(UpdateUserSchema)) dto: z.infer<typeof UpdateUserSchema>) {
    return this.svc.update(a, id, dto);
  }

  @Post(':id/pin')
  @HttpCode(200)
  @Audit('user.set_pin', 'user')
  setPin(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(SetPinSchema)) dto: z.infer<typeof SetPinSchema>) {
    return this.svc.setPin(a, id, dto.pin);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @Audit('user.reset_password', 'user')
  resetPassword(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(ResetPasswordSchema)) dto: z.infer<typeof ResetPasswordSchema>) {
    return this.svc.resetPassword(a, id, dto.password);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @Audit('user.activate', 'user')
  activate(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.setActive(a, id, true);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Audit('user.deactivate', 'user')
  deactivate(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.setActive(a, id, false);
  }
}

const AreaListQuery = z.object({ all: z.enum(['0', '1']).optional() });

/** ADM-05 · Áreas */
@Controller('areas')
export class AreasController {
  constructor(private readonly svc: AreasService) {}

  /** Cualquier sesión (y tablets) puede listar áreas activas; ?all=1 incluye inactivas (solo admin). */
  @AllowDevice()
  @Get()
  list(@CurrentActor() a: Actor, @Query(zq(AreaListQuery)) q: z.infer<typeof AreaListQuery>) {
    const admin = a.kind === 'user' && (a.role === 'OWNER' || a.role === 'ADMIN');
    return this.svc.list(a, admin && q.all === '1');
  }

  @AllowDevice()
  @Get(':id')
  get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.get(a, id);
  }

  @Roles('ADMIN')
  @Post()
  @Audit('area.create', 'area')
  create(@CurrentActor() a: Actor, @Body(zbody(AreaSchema)) dto: z.infer<typeof AreaSchema>) {
    return this.svc.create(a, dto);
  }

  @Roles('ADMIN')
  @Post('reorder')
  @HttpCode(200)
  @Audit('area.reorder', 'area')
  reorder(@CurrentActor() a: Actor, @Body(zbody(ReorderSchema)) dto: z.infer<typeof ReorderSchema>) {
    return this.svc.reorder(a, dto.ids);
  }

  @Roles('ADMIN')
  @Patch(':id')
  @Audit('area.update', 'area')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(UpdateAreaSchema)) dto: z.infer<typeof UpdateAreaSchema>) {
    return this.svc.update(a, id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @Audit('area.delete', 'area')
  remove(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.remove(a, id);
  }
}

const DeviceListQuery = z.object({ areaId: z.string().optional(), revoked: z.enum(['0', '1']).optional() });

/** ADM-05 · Tablets (el código de emparejamiento y revocar viven en /auth). */
@Roles('ADMIN')
@Controller('devices')
export class DevicesController {
  constructor(private readonly svc: AreasService) {}

  @Get()
  list(@CurrentActor() a: Actor, @Query(zq(DeviceListQuery)) q: z.infer<typeof DeviceListQuery>) {
    return this.svc.listDevices(a, { areaId: q.areaId, includeRevoked: q.revoked === '1' });
  }

  @Patch(':id')
  @Audit('device.update', 'device')
  update(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(UpdateDeviceSchema)) dto: z.infer<typeof UpdateDeviceSchema>) {
    return this.svc.updateDevice(a, id, dto);
  }
}

/** ADM-07 · Bitácora */
@Roles('ADMIN')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly svc: ReportsService) {}

  @Get()
  list(@CurrentActor() a: Actor, @Query(zq(AuditQuery)) q: z.infer<typeof AuditQuery>) {
    return this.svc.auditLogs(a, q);
  }
}
