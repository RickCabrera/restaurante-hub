import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT } from '../decorators';
import { AuditService } from './audit.service';

/** Registra automáticamente en bitácora los endpoints marcados con @Audit(action, entity). */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<{ action: string; entity: string }>(AUDIT, ctx.getHandler());
    if (!meta || ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      tap((result) => {
        const actor = req.actor;
        if (!actor) return;
        const entityId =
          req.params?.id ?? (result && typeof result === 'object' && 'id' in result ? (result as { id: string }).id : null);
        void this.audit.record(actor, {
          businessId: actor.businessId,
          action: meta.action,
          entity: meta.entity,
          entityId,
          data: sanitize(req.body),
          ip: req.ip,
        });
      }),
    );
  }
}

const SECRET_KEYS = /pass|pin|token|secret/i;
function sanitize(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body ?? null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? '***' : v;
  }
  return out;
}
