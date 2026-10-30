import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { ModuleKey, Role } from '@rh/shared';
import type { Actor, DevicePurpose } from '../actor';

export const IS_PUBLIC = 'rh:isPublic';
export const ROLES = 'rh:roles';
export const ALLOW_DEVICE = 'rh:allowDevice';
export const ALLOW_AGENT = 'rh:allowAgent';
export const REQUIRES_MODULE = 'rh:requiresModule';
export const AUDIT = 'rh:audit';

/** Endpoint sin autenticación (el actor se adjunta si viene token válido). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Roles de usuario permitidos. OWNER siempre pasa.
 * Para dispositivos, aplica al personal identificado con PIN.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Permite tokens de dispositivo (tablets) con los propósitos indicados. */
export const AllowDevice = (...purposes: DevicePurpose[]) =>
  SetMetadata(ALLOW_DEVICE, purposes.length ? purposes : ['AREA', 'KDS', 'POS']);

/** Permite tokens de agente de impresión. */
export const AllowAgent = () => SetMetadata(ALLOW_AGENT, true);

/** El endpoint solo existe si el módulo está activo en el negocio. */
export const RequiresModule = (m: ModuleKey) => SetMetadata(REQUIRES_MODULE, m);

/** Registra la acción en la bitácora (AuditInterceptor). */
export const Audit = (action: string, entity: string) => SetMetadata(AUDIT, { action, entity });

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest();
  return req.actor;
});

/** Actor opcional (endpoints públicos). */
export const OptionalActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor | undefined => {
  return ctx.switchToHttp().getRequest().actor;
});
