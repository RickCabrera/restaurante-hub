import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { LoginSchema, PairDeviceSchema, PinLoginSchema } from '@rh/shared';
import { AllowAgent, AllowDevice, Audit, CurrentActor, Public, Roles } from '../common/decorators';
import { zbody } from '../common/pipes/zod.pipe';
import type { Actor, DeviceActor, DevicePurpose } from '../common/actor';
import { AuthService } from './auth.service';

const RefreshSchema = z.object({ refreshToken: z.string().min(10) });
const ChangePasswordSchema = z.object({ currentPassword: z.string().min(6), newPassword: z.string().min(8) });
const PairingCodeSchema = z.object({ areaId: z.string().nullable().optional(), purpose: z.enum(['AREA', 'KDS', 'POS']).default('AREA') });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(
    @Body(zbody(LoginSchema.extend({ business: z.string().optional() }))) dto: { login: string; password: string; business?: string },
    @Headers('user-agent') ua?: string,
  ) {
    return this.auth.login(dto.login, dto.password, ua, dto.business);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(zbody(RefreshSchema)) dto: { refreshToken: string }, @Headers('user-agent') ua?: string) {
    return this.auth.refresh(dto.refreshToken, ua);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Body(zbody(RefreshSchema)) dto: { refreshToken: string }) {
    await this.auth.logout(dto.refreshToken);
    return { ok: true };
  }

  @AllowDevice()
  @AllowAgent()
  @Get('me')
  me(@CurrentActor() actor: Actor) {
    return this.auth.me(actor);
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentActor() actor: Actor, @Body(zbody(ChangePasswordSchema)) dto: z.infer<typeof ChangePasswordSchema>) {
    if (actor.kind !== 'user') return { ok: false };
    await this.auth.changePassword(actor.userId, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }

  // ------------------------------ tablets / dispositivos
  @Roles('ADMIN')
  @Post('pairing-codes')
  @Audit('device.pairing_code', 'device')
  createPairingCode(@CurrentActor() actor: Actor, @Body(zbody(PairingCodeSchema)) dto: { areaId?: string | null; purpose: DevicePurpose }) {
    return this.auth.createPairingCode(actor, dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('pair')
  @HttpCode(200)
  pair(@Body(zbody(PairDeviceSchema)) dto: z.infer<typeof PairDeviceSchema>) {
    return this.auth.pairDevice(dto);
  }

  @Roles('ADMIN')
  @Post('devices/:id/revoke')
  @HttpCode(200)
  @Audit('device.revoke', 'device')
  revoke(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.auth.revokeDevice(actor, id);
  }

  @AllowDevice()
  @Get('device/staff')
  staff(@CurrentActor() actor: DeviceActor) {
    return this.auth.deviceStaff(actor);
  }

  @AllowDevice()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('device/pin')
  @HttpCode(200)
  pin(@CurrentActor() actor: DeviceActor, @Body(zbody(PinLoginSchema)) dto: { userId: string; pin: string }) {
    return this.auth.pinLogin(actor, dto.userId, dto.pin);
  }

  @AllowDevice()
  @Post('device/heartbeat')
  @HttpCode(200)
  heartbeat(@CurrentActor() actor: DeviceActor, @Body() body: { appVersion?: string }) {
    return this.auth.heartbeat(actor, body?.appVersion);
  }
}

