import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ModuleKey, Role } from '@rh/shared';
import { TokenService } from '../../auth/token.service';
import { SettingsService } from '../../settings/settings.service';
import { effectiveRole } from '../actor';
import type { DevicePurpose } from '../actor';
import { ALLOW_AGENT, ALLOW_DEVICE, IS_PUBLIC, REQUIRES_MODULE, ROLES } from '../decorators';

/**
 * Guard global. Reglas:
 *  - @Public(): pasa siempre (adjunta actor si hay token válido).
 *  - Agentes de impresión: solo endpoints con @AllowAgent().
 *  - Dispositivos (tablets): endpoints con @AllowDevice(purpose) o, si hay personal con PIN, @Roles(...) que incluya su rol.
 *  - Usuarios: si hay @Roles(...) su rol debe estar incluido (OWNER siempre pasa); sin @Roles pasa cualquier usuario.
 *  - @RequiresModule(m): 404 si el módulo está apagado en el negocio.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);

    const actor = await this.tokens.resolve(req.headers['authorization'], req.headers['x-staff-token']);
    if (actor) req.actor = actor;

    const requiredModule = this.reflector.getAllAndOverride<ModuleKey>(REQUIRES_MODULE, targets);
    if (requiredModule && actor) {
      const on = await this.settings.isModuleEnabled(actor.businessId, requiredModule);
      if (!on) throw new NotFoundException('Módulo no activado');
    }

    if (isPublic) return true;
    if (!actor) throw new UnauthorizedException('Sesión inválida o expirada');

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    const devicePurposes = this.reflector.getAllAndOverride<DevicePurpose[]>(ALLOW_DEVICE, targets);
    const allowAgent = this.reflector.getAllAndOverride<boolean>(ALLOW_AGENT, targets);

    if (actor.kind === 'agent') {
      if (allowAgent) return true;
      throw new ForbiddenException('No permitido para el agente de impresión');
    }

    if (actor.kind === 'device') {
      if (devicePurposes?.includes(actor.purpose)) return true;
      const r = effectiveRole(actor);
      if (r && roles?.length && (r === 'OWNER' || roles.includes(r))) return true;
      throw new ForbiddenException('No permitido para este dispositivo');
    }

    // Usuario
    if (roles?.length) {
      if (actor.role === 'OWNER' || roles.includes(actor.role)) return true;
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    return true;
  }
}
