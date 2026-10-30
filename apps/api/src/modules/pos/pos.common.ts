import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, applyDecorators, UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@rh/shared';
import { AllowDevice, RequiresModule, ROLES } from '../../common/decorators';
import { Actor, effectiveRole } from '../../common/actor';

export const POS_READ_WITHOUT_PIN = 'rh:posReadWithoutPin';
/** Lectura permitida a una caja/comandero sin personal identificado (plano, menú, cuentas). */
export const PosReadWithoutPin = () => SetMetadata(POS_READ_WITHOUT_PIN, true);

export interface Staff {
  userId: string;
  name: string;
  role: Role;
}

/** Persona que realiza la acción: usuario con sesión o personal identificado con PIN en la caja. */
export function staffOf(actor: Actor): Staff {
  if (actor.kind === 'user') return { userId: actor.userId, name: actor.name, role: actor.role };
  if (actor.kind === 'device' && actor.staff) return actor.staff;
  throw new ForbiddenException('Identifícate con tu PIN');
}

export function hasRole(actor: Actor, ...roles: Role[]): boolean {
  const r = effectiveRole(actor);
  return !!r && (r === 'OWNER' || roles.includes(r));
}

export function requireRole(actor: Actor, roles: Role[], message = 'No tienes permiso para esta acción') {
  if (!hasRole(actor, ...roles)) throw new ForbiddenException(message);
}

/**
 * Complemento del guard global para los controladores POS (que permiten cajas con @AllowDevice('POS')):
 * para dispositivos exige personal identificado con PIN y que su rol esté en @Roles(...).
 * Los usuarios ya fueron validados por el guard global.
 */
@Injectable()
export class PosStaffGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const actor = ctx.switchToHttp().getRequest().actor as Actor | undefined;
    if (!actor || actor.kind !== 'device') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    const readOk = this.reflector.getAllAndOverride<boolean>(POS_READ_WITHOUT_PIN, targets);
    if (!actor.staff) {
      if (readOk) return true;
      throw new ForbiddenException('Identifícate con tu PIN');
    }
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles?.length && !hasRole(actor, ...roles)) throw new ForbiddenException('No tienes permiso para esta acción');
    return true;
  }
}

/** Decorador de clase para todos los controladores POS. */
export const PosController = () =>
  applyDecorators(RequiresModule('pos'), AllowDevice('POS'), UseGuards(PosStaffGuard));
