import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../../common/actor';
import { isManager } from '../../common/actor';
import type { DbOrTx } from '../../db/db.module';
import { areas, userAreas } from '../../db/schema';
import type { Side } from './requisitions.logic';

/** Lado del actor en el flujo de requisiciones/chat: dueña/admin = MANAGER; tablet o personal de área = AREA. */
export function sideOf(actor: Actor): Side {
  return isManager(actor) ? 'MANAGER' : 'AREA';
}

/** Área fija de una tablet AREA (null para usuarios). */
export function deviceAreaId(actor: Actor): string | null {
  return actor.kind === 'device' && actor.purpose === 'AREA' ? actor.areaId : null;
}

/**
 * Áreas que el actor puede ver como "lado área".
 *  - managers: null (todas)
 *  - tablet: su área
 *  - usuario no manager: sus áreas asignadas
 */
export async function scopedAreaIds(db: DbOrTx, actor: Actor): Promise<string[] | null> {
  if (actor.kind === 'device') {
    if (actor.purpose === 'AREA' || actor.purpose === 'KDS') return actor.areaId ? [actor.areaId] : [];
    return isManager(actor) ? null : [];
  }
  if (isManager(actor)) return null;
  if (actor.kind !== 'user') return [];
  const rows = await db.select({ areaId: userAreas.areaId }).from(userAreas).where(eq(userAreas.userId, actor.userId));
  return rows.map((r) => r.areaId);
}

export async function assertAreaAccess(db: DbOrTx, actor: Actor, areaId: string): Promise<void> {
  const scope = await scopedAreaIds(db, actor);
  if (scope && !scope.includes(areaId)) throw new ForbiddenException('No tienes acceso a esta área');
}

export async function loadArea(db: DbOrTx, businessId: string, areaId: string) {
  const [a] = await db.select().from(areas).where(and(eq(areas.id, areaId), eq(areas.businessId, businessId)));
  if (!a) throw new BadRequestException('Área inválida');
  return a;
}

/** Postgres unique_violation → 409 con mensaje propio. */
export function rethrowUnique(e: unknown, message: string): never {
  const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
  if (code === '23505') throw new ConflictException(message);
  throw e;
}

export function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
  return code === '23505';
}
