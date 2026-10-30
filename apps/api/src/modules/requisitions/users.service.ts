import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { and, asc, eq, ilike, inArray, isNull, ne, or, SQL } from 'drizzle-orm';
import type { Role } from '@rh/shared';
import { InjectDb, Db, DbOrTx } from '../../db/db.module';
import { areas, refreshTokens, userAreas, users } from '../../db/schema';
import type { Actor } from '../../common/actor';
import { effectiveRole } from '../../common/actor';
import { AuditService } from '../../common/services/audit.service';
import { rethrowUnique } from './access';
import type { CreateUserDto, UpdateUserDto } from './dto';

type UserRow = typeof users.$inferSelect;

export interface StaffUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  avatarColor: string;
  active: boolean;
  areaIds: string[];
  hasPin: boolean;
  hasPassword: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export function toStaffUser(u: UserRow, areaIds: string[]): StaffUser {
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, avatarColor: u.avatarColor, active: u.active,
    areaIds, hasPin: !!u.pinHash, hasPassword: !!u.passwordHash, lockedUntil: u.lockedUntil, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
  };
}

const PRIVILEGED: Role[] = ['OWNER', 'ADMIN'];
const UNIQUE_MSG = 'Ya existe un usuario con ese correo o teléfono';

@Injectable()
export class UsersService {
  constructor(@InjectDb() private readonly db: Db, private readonly audit: AuditService) {}

  async list(actor: Actor, q: { role?: Role; areaId?: string; active?: boolean; q?: string }) {
    const conds: SQL[] = [eq(users.businessId, actor.businessId)];
    if (q.role) conds.push(eq(users.role, q.role));
    if (q.active !== undefined) conds.push(eq(users.active, q.active));
    if (q.q) conds.push(or(ilike(users.name, `%${q.q}%`), ilike(users.email, `%${q.q}%`), ilike(users.phone, `%${q.q}%`))!);
    if (q.areaId) {
      const ids = await this.db.select({ id: userAreas.userId }).from(userAreas).where(eq(userAreas.areaId, q.areaId));
      if (!ids.length) return [];
      conds.push(inArray(users.id, ids.map((r) => r.id)));
    }
    const rows = await this.db.query.users.findMany({ where: and(...conds), with: { areas: true }, orderBy: [asc(users.name)] });
    return rows.map((u) => toStaffUser(u, u.areas.map((a) => a.areaId)));
  }

  async get(actor: Actor, id: string) {
    const u = await this.db.query.users.findFirst({ where: and(eq(users.id, id), eq(users.businessId, actor.businessId)), with: { areas: true } });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return toStaffUser(u, u.areas.map((a) => a.areaId));
  }

  private assertCanManage(actor: Actor, targetRole: Role | null, newRole?: Role) {
    const r = effectiveRole(actor);
    const touchesPrivileged = (targetRole && PRIVILEGED.includes(targetRole)) || (newRole && PRIVILEGED.includes(newRole));
    if (touchesPrivileged && r !== 'OWNER') throw new ForbiddenException('Solo la dueña puede crear o modificar dueños y administradores');
  }

  private async validateAreas(db: DbOrTx, businessId: string, areaIds: string[]) {
    if (!areaIds.length) return;
    const rows = await db.select({ id: areas.id }).from(areas).where(and(eq(areas.businessId, businessId), inArray(areas.id, areaIds)));
    if (rows.length !== new Set(areaIds).size) throw new BadRequestException('Una de las áreas no existe');
  }

  async create(actor: Actor, dto: CreateUserDto) {
    this.assertCanManage(actor, null, dto.role);
    if (!dto.email && !dto.phone && !dto.pin) throw new BadRequestException('Indica correo, teléfono o PIN para que la persona pueda entrar');
    if (dto.password && !dto.email && !dto.phone) throw new BadRequestException('Para usar contraseña se necesita correo o teléfono');
    await this.validateAreas(this.db, actor.businessId, dto.areaIds);
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : null;
    const pinHash = dto.pin ? await bcrypt.hash(dto.pin, 10) : null;
    try {
      const id = await this.db.transaction(async (tx) => {
        const [u] = await tx
          .insert(users)
          .values({
            businessId: actor.businessId, name: dto.name, email: dto.email ?? null, phone: dto.phone ?? null, role: dto.role,
            passwordHash, pinHash, active: dto.active, ...(dto.avatarColor ? { avatarColor: dto.avatarColor } : {}),
          })
          .returning();
        const areaIds = [...new Set(dto.areaIds)];
        if (areaIds.length) await tx.insert(userAreas).values(areaIds.map((areaId) => ({ userId: u.id, areaId })));
        await this.audit.record(actor, { businessId: actor.businessId, action: 'user.create', entity: 'user', entityId: u.id, data: { name: u.name, role: u.role, areaIds } }, tx);
        return u.id;
      });
      return this.get(actor, id);
    } catch (e) {
      rethrowUnique(e, UNIQUE_MSG);
    }
  }

  private async loadTarget(actor: Actor, id: string) {
    const u = await this.db.query.users.findFirst({ where: and(eq(users.id, id), eq(users.businessId, actor.businessId)) });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return u;
  }

  /** Evita dejar el negocio sin dueña activa. */
  private async assertNotLastOwner(businessId: string, target: UserRow) {
    if (target.role !== 'OWNER') return;
    const others = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.businessId, businessId), eq(users.role, 'OWNER'), eq(users.active, true), ne(users.id, target.id)));
    if (!others.length) throw new BadRequestException('Debe quedar al menos una dueña activa');
  }

  async update(actor: Actor, id: string, dto: UpdateUserDto) {
    const target = await this.loadTarget(actor, id);
    this.assertCanManage(actor, target.role, dto.role);
    if ((dto.role && dto.role !== 'OWNER') || dto.active === false) await this.assertNotLastOwner(actor.businessId, target);
    if (dto.areaIds) await this.validateAreas(this.db, actor.businessId, dto.areaIds);
    const { areaIds, ...patch } = dto;
    try {
      await this.db.transaction(async (tx) => {
        if (Object.keys(patch).length) await tx.update(users).set(patch).where(eq(users.id, id));
        if (areaIds) {
          await tx.delete(userAreas).where(eq(userAreas.userId, id));
          const uniq = [...new Set(areaIds)];
          if (uniq.length) await tx.insert(userAreas).values(uniq.map((areaId) => ({ userId: id, areaId })));
        }
        if (dto.active === false) await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));
      });
    } catch (e) {
      rethrowUnique(e, UNIQUE_MSG);
    }
    return this.get(actor, id);
  }

  async setPin(actor: Actor, id: string, pin: string | null) {
    const target = await this.loadTarget(actor, id);
    this.assertCanManage(actor, target.role);
    await this.db.update(users).set({ pinHash: pin ? await bcrypt.hash(pin, 10) : null, failedLogins: 0, lockedUntil: null }).where(eq(users.id, id));
    return this.get(actor, id);
  }

  async resetPassword(actor: Actor, id: string, password: string) {
    const target = await this.loadTarget(actor, id);
    this.assertCanManage(actor, target.role);
    if (!target.email && !target.phone) throw new BadRequestException('El usuario necesita correo o teléfono para usar contraseña');
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: await bcrypt.hash(password, 10), failedLogins: 0, lockedUntil: null }).where(eq(users.id, id));
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));
    });
    return this.get(actor, id);
  }

  async setActive(actor: Actor, id: string, active: boolean) {
    if (!active && actor.kind === 'user' && actor.userId === id) throw new BadRequestException('No puedes desactivar tu propia cuenta');
    return this.update(actor, id, { active });
  }
}
