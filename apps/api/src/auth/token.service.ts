import { Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { and, eq, isNull } from 'drizzle-orm';
import type { Role } from '@rh/shared';
import { InjectDb, Db } from '../db/db.module';
import { devices, printAgents, users } from '../db/schema';
import { loadEnv } from '../config/env';
import { sha256 } from '../common/utils/crypto';
import type { Actor, DeviceActor, DevicePurpose, StaffInfo } from '../common/actor';

interface UserClaims { typ: 'user'; sub: string; bid: string; role: Role; name: string }
interface StaffClaims { typ: 'staff'; sub: string; bid: string; did: string; role: Role; name: string }

/**
 * Emite y valida credenciales:
 *  - `Authorization: Bearer <jwt>`     → usuario (dueña, admin, cajero, repartidor...)
 *  - `Authorization: Device <token>`   → tablet emparejada (+ `X-Staff-Token` si alguien entró con PIN)
 *  - `Authorization: Agent <token>`    → agente de impresión / app de escritorio / app Android
 */
@Injectable()
export class TokenService {
  private readonly env = loadEnv();
  /** caché corta para no consultar la BD en cada request de tablets */
  private deviceCache = new Map<string, { actor: Omit<DeviceActor, 'staff'>; at: number }>();

  constructor(@InjectDb() private readonly db: Db) {}

  signAccess(u: { id: string; businessId: string; role: Role; name: string }): string {
    const claims: UserClaims = { typ: 'user', sub: u.id, bid: u.businessId, role: u.role, name: u.name };
    return jwt.sign(claims, this.env.JWT_SECRET, { expiresIn: this.env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] });
  }

  signStaff(u: { id: string; businessId: string; role: Role; name: string }, deviceId: string): string {
    const claims: StaffClaims = { typ: 'staff', sub: u.id, bid: u.businessId, did: deviceId, role: u.role, name: u.name };
    return jwt.sign(claims, this.env.JWT_SECRET, { expiresIn: '12h' });
  }

  verifyUserJwt(token: string): UserClaims | null {
    try {
      const c = jwt.verify(token, this.env.JWT_SECRET) as UserClaims;
      return c.typ === 'user' ? c : null;
    } catch {
      return null;
    }
  }

  verifyStaffJwt(token: string, deviceId: string): StaffInfo | null {
    try {
      const c = jwt.verify(token, this.env.JWT_SECRET) as StaffClaims;
      if (c.typ !== 'staff' || c.did !== deviceId) return null;
      return { userId: c.sub, name: c.name, role: c.role };
    } catch {
      return null;
    }
  }

  invalidateDevice(tokenHash?: string) {
    if (tokenHash) this.deviceCache.delete(tokenHash);
    else this.deviceCache.clear();
  }

  async resolveDevice(token: string): Promise<Omit<DeviceActor, 'staff'> | null> {
    const h = sha256(token);
    const c = this.deviceCache.get(h);
    if (c && Date.now() - c.at < 30_000) return c.actor;
    const d = await this.db.query.devices.findFirst({
      where: and(eq(devices.tokenHash, h), isNull(devices.revokedAt)),
    });
    if (!d) {
      this.deviceCache.delete(h);
      return null;
    }
    const actor = {
      kind: 'device' as const,
      deviceId: d.id,
      businessId: d.businessId,
      areaId: d.areaId,
      purpose: d.purpose as DevicePurpose,
      name: d.name,
    };
    this.deviceCache.set(h, { actor, at: Date.now() });
    return actor;
  }

  async resolveAgent(token: string) {
    const a = await this.db.query.printAgents.findFirst({
      where: and(eq(printAgents.tokenHash, sha256(token)), isNull(printAgents.revokedAt)),
    });
    if (!a) return null;
    return { kind: 'agent' as const, agentId: a.id, businessId: a.businessId, name: a.name, agentKind: a.kind };
  }

  /** Resuelve el actor a partir de los headers (HTTP o handshake de socket). */
  async resolve(authorization?: string, staffToken?: string): Promise<Actor | null> {
    if (!authorization) return null;
    const [scheme, token] = authorization.split(' ');
    if (!token) return null;
    switch (scheme) {
      case 'Bearer': {
        const c = this.verifyUserJwt(token);
        if (!c) return null;
        // Verifica que el usuario siga activo (desactivar corta acceso aunque el JWT siga vigente)
        const u = await this.db.query.users.findFirst({
          where: eq(users.id, c.sub),
          columns: { active: true, role: true, name: true },
        });
        if (!u || !u.active) return null;
        return { kind: 'user', userId: c.sub, businessId: c.bid, role: u.role, name: u.name };
      }
      case 'Device': {
        const d = await this.resolveDevice(token);
        if (!d) return null;
        const staff = staffToken ? this.verifyStaffJwt(staffToken, d.deviceId) ?? undefined : undefined;
        return { ...d, staff };
      }
      case 'Agent':
        return this.resolveAgent(token);
      default:
        return null;
    }
  }
}
