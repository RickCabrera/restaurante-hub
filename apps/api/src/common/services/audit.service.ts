import { Injectable, Logger } from '@nestjs/common';
import { InjectDb, Db, DbOrTx } from '../../db/db.module';
import { auditLogs } from '../../db/schema';
import { Actor, actorName } from '../actor';

export interface AuditEntry {
  businessId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  data?: unknown;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  private readonly log = new Logger('Audit');
  constructor(@InjectDb() private readonly db: Db) {}

  /** Nunca lanza: la bitácora no debe romper la operación principal. */
  async record(actor: Actor | null | 'SYSTEM' | { customer: string }, e: AuditEntry, tx?: DbOrTx) {
    try {
      let actorType = 'SYSTEM';
      let actorId: string | null = null;
      let name: string | null = 'Sistema';
      if (actor && actor !== 'SYSTEM') {
        if ('customer' in actor) {
          actorType = 'CUSTOMER';
          name = actor.customer;
        } else {
          actorType = actor.kind.toUpperCase();
          actorId = actor.kind === 'user' ? actor.userId : actor.kind === 'device' ? actor.deviceId : actor.agentId;
          name = actorName(actor);
        }
      }
      await (tx ?? this.db).insert(auditLogs).values({
        businessId: e.businessId,
        actorType,
        actorId,
        actorName: name,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        data: (e.data ?? null) as object | null,
        ip: e.ip ?? null,
      });
    } catch (err) {
      this.log.warn(`No se pudo registrar auditoría ${e.action}: ${(err as Error).message}`);
    }
  }
}
