import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { RT } from '@rh/shared';
import { InjectDb, Db } from '../db/db.module';
import { areas, devices, pairingCodes, refreshTokens, userAreas, users } from '../db/schema';
import { loadEnv } from '../config/env';
import { randomDigits, randomToken, sha256 } from '../common/utils/crypto';
import { TokenService } from './token.service';
import { AuditService } from '../common/services/audit.service';
import { RealtimeService, Rooms } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import type { Actor, DeviceActor, DevicePurpose } from '../common/actor';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const PAIRING_TTL_MIN = 10;

export type PublicUser = Pick<typeof users.$inferSelect, 'id' | 'businessId' | 'name' | 'email' | 'phone' | 'role' | 'avatarColor' | 'active'> & {
  areaIds?: string[];
};

export function toPublicUser(u: typeof users.$inferSelect, areaIds?: string[]): PublicUser {
  return { id: u.id, businessId: u.businessId, name: u.name, email: u.email, phone: u.phone, role: u.role, avatarColor: u.avatarColor, active: u.active, areaIds };
}

@Injectable()
export class AuthService {
  private readonly env = loadEnv();

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly rt: RealtimeService,
    private readonly settings: SettingsService,
  ) {}

  static hashPassword(p: string) {
    return bcrypt.hash(p, 10);
  }

  // ---------------------------------------------------------------- usuarios
  async login(login: string, password: string, userAgent?: string, businessSlug?: string) {
    const business = await this.settings.getBySlug(businessSlug).catch(() => null);
    const l = login.trim().toLowerCase();
    const phone = l.replace(/\D/g, '');
    const conds = [eq(users.email, l)];
    if (phone.length >= 10) conds.push(eq(users.phone, phone));
    const u = await this.db.query.users.findFirst({
      where: business ? and(eq(users.businessId, business.id), or(...conds)) : or(...conds),
    });
    if (!u || !u.passwordHash || !u.active) throw new UnauthorizedException('Usuario o contraseña incorrectos');
    if (u.lockedUntil && u.lockedUntil > new Date()) {
      throw new ForbiddenException(`Cuenta bloqueada por intentos fallidos. Intenta en ${LOCK_MINUTES} minutos.`);
    }
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) {
      const failed = u.failedLogins + 1;
      await this.db
        .update(users)
        .set({ failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
        .where(eq(users.id, u.id));
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }
    await this.db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, u.id));
    await this.audit.record({ kind: 'user', userId: u.id, businessId: u.businessId, role: u.role, name: u.name }, {
      businessId: u.businessId, action: 'auth.login', entity: 'user', entityId: u.id,
    });
    return this.issueSession(u, userAgent);
  }

  private async issueSession(u: typeof users.$inferSelect, userAgent?: string) {
    const refresh = randomToken(48);
    await this.db.insert(refreshTokens).values({
      userId: u.id,
      tokenHash: sha256(refresh),
      expiresAt: new Date(Date.now() + this.env.REFRESH_TTL_DAYS * 86_400_000),
      userAgent: userAgent ?? null,
    });
    const areaRows = await this.db.query.userAreas.findMany({ where: eq(userAreas.userId, u.id) });
    return {
      accessToken: this.tokens.signAccess(u),
      refreshToken: refresh,
      user: toPublicUser(u, areaRows.map((a) => a.areaId)),
    };
  }

  /** Rotación de refresh token: el usado se revoca; reutilizar uno revocado revoca toda la familia. */
  async refresh(refreshToken: string, userAgent?: string) {
    const h = sha256(refreshToken);
    const row = await this.db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, h) });
    if (!row) throw new UnauthorizedException('Sesión inválida');
    if (row.revokedAt) {
      await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));
      throw new UnauthorizedException('Sesión revocada');
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException('Sesión expirada');
    const u = await this.db.query.users.findFirst({ where: eq(users.id, row.userId) });
    if (!u || !u.active) throw new UnauthorizedException('Usuario inactivo');
    const session = await this.issueSession(u, userAgent);
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedBy: sha256(session.refreshToken) })
      .where(eq(refreshTokens.id, row.id));
    return session;
  }

  async logout(refreshToken: string) {
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, sha256(refreshToken)));
  }

  async me(actor: Actor) {
    const business = await this.settings.getBusiness(actor.businessId);
    const settings = await this.settings.getSettings(actor.businessId);
    const businessInfo = {
      id: business.id, name: business.name, slug: business.slug, logoUrl: business.logoUrl,
      primaryColor: business.primaryColor, accentColor: business.accentColor, timezone: business.timezone,
      currency: business.currency, modules: settings.modules, requirePin: settings.requirePin, tips: settings.tips,
    };
    if (actor.kind === 'user') {
      const u = await this.db.query.users.findFirst({ where: eq(users.id, actor.userId) });
      const areaRows = await this.db.query.userAreas.findMany({ where: eq(userAreas.userId, actor.userId) });
      return { kind: 'user', user: toPublicUser(u!, areaRows.map((a) => a.areaId)), business: businessInfo };
    }
    if (actor.kind === 'device') {
      const d = await this.db.query.devices.findFirst({ where: eq(devices.id, actor.deviceId), with: { area: true } });
      return { kind: 'device', device: { id: d!.id, name: d!.name, purpose: d!.purpose, area: d!.area }, staff: actor.staff ?? null, business: businessInfo };
    }
    return { kind: 'agent', agent: { id: actor.agentId, name: actor.name }, business: businessInfo };
  }

  async changePassword(userId: string, current: string, next: string) {
    const u = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!u?.passwordHash || !(await bcrypt.compare(current, u.passwordHash))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    await this.db.update(users).set({ passwordHash: await AuthService.hashPassword(next) }).where(eq(users.id, userId));
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  // --------------------------------------------------------------- tablets
  /** La dueña genera un código de 6 dígitos (10 min) para emparejar una tablet a un área. */
  async createPairingCode(actor: Actor, input: { areaId?: string | null; purpose: DevicePurpose }) {
    if ((input.purpose === 'AREA' || input.purpose === 'KDS') && !input.areaId) {
      throw new BadRequestException('Selecciona el área de la tablet');
    }
    if (input.areaId) {
      const a = await this.db.query.areas.findFirst({ where: and(eq(areas.id, input.areaId), eq(areas.businessId, actor.businessId)) });
      if (!a) throw new BadRequestException('Área inválida');
    }
    let code = randomDigits(6);
    // evita colisión con códigos vigentes
    for (let i = 0; i < 5; i++) {
      const clash = await this.db.query.pairingCodes.findFirst({
        where: and(eq(pairingCodes.code, code), isNull(pairingCodes.usedAt), gt(pairingCodes.expiresAt, new Date())),
      });
      if (!clash) break;
      code = randomDigits(6);
    }
    const [row] = await this.db
      .insert(pairingCodes)
      .values({
        businessId: actor.businessId,
        code,
        areaId: input.areaId ?? null,
        purpose: input.purpose,
        expiresAt: new Date(Date.now() + PAIRING_TTL_MIN * 60_000),
      })
      .returning();
    return { code: row.code, expiresAt: row.expiresAt, purpose: row.purpose, areaId: row.areaId };
  }

  /** La tablet captura el código y recibe su token permanente. */
  async pairDevice(input: { code: string; deviceName?: string; platform?: string }) {
    const pc = await this.db.query.pairingCodes.findFirst({
      where: and(eq(pairingCodes.code, input.code), isNull(pairingCodes.usedAt), gt(pairingCodes.expiresAt, new Date())),
    });
    if (!pc) throw new BadRequestException('Código inválido o expirado');
    const area = pc.areaId ? await this.db.query.areas.findFirst({ where: eq(areas.id, pc.areaId) }) : null;
    const token = randomToken(32);
    const name = input.deviceName?.trim() || `${pc.purpose === 'POS' ? 'Caja' : pc.purpose === 'KDS' ? 'Pantalla' : 'Tablet'} ${area?.name ?? ''}`.trim();
    const device = await this.db.transaction(async (tx) => {
      await tx.update(pairingCodes).set({ usedAt: new Date() }).where(eq(pairingCodes.id, pc.id));
      const [d] = await tx
        .insert(devices)
        .values({ businessId: pc.businessId, areaId: pc.areaId, name, purpose: pc.purpose, platform: input.platform ?? 'web', tokenHash: sha256(token) })
        .returning();
      return d;
    });
    await this.audit.record('SYSTEM', { businessId: pc.businessId, action: 'device.pair', entity: 'device', entityId: device.id, data: { name } });
    this.rt.toManagers(pc.businessId, RT.DEVICE_STATUS, { id: device.id, online: false, paired: true });
    return { deviceToken: token, device: { id: device.id, name: device.name, purpose: device.purpose, area } };
  }

  async revokeDevice(actor: Actor, deviceId: string) {
    const [d] = await this.db
      .update(devices)
      .set({ revokedAt: new Date(), online: false })
      .where(and(eq(devices.id, deviceId), eq(devices.businessId, actor.businessId)))
      .returning();
    if (!d) throw new BadRequestException('Dispositivo no encontrado');
    this.tokens.invalidateDevice(d.tokenHash);
    this.rt.emit(Rooms.device(d.id), RT.DEVICE_REVOKED, { id: d.id });
    // desconecta los sockets de esa tablet
    if (this.rt.server) this.rt.server.in(Rooms.device(d.id)).disconnectSockets(true);
    return { ok: true };
  }

  /** Personal disponible en la tablet (para la pantalla de PIN). */
  async deviceStaff(actor: DeviceActor) {
    const rows = await this.db.query.users.findMany({
      where: and(eq(users.businessId, actor.businessId), eq(users.active, true)),
      with: { areas: true },
      columns: { id: true, name: true, role: true, avatarColor: true, pinHash: true },
    });
    return rows
      .filter((u) => u.pinHash && (actor.purpose === 'POS' || !actor.areaId || u.role === 'OWNER' || u.role === 'ADMIN' || u.areas.some((a) => a.areaId === actor.areaId)))
      .map((u) => ({ id: u.id, name: u.name, role: u.role, avatarColor: u.avatarColor }));
  }

  async pinLogin(actor: DeviceActor, userId: string, pin: string) {
    const u = await this.db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.businessId, actor.businessId), eq(users.active, true)) });
    if (!u?.pinHash) throw new UnauthorizedException('PIN no configurado');
    if (u.lockedUntil && u.lockedUntil > new Date()) throw new ForbiddenException('Usuario bloqueado temporalmente');
    if (!(await bcrypt.compare(pin, u.pinHash))) {
      const failed = u.failedLogins + 1;
      await this.db.update(users).set({ failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null }).where(eq(users.id, u.id));
      throw new UnauthorizedException('PIN incorrecto');
    }
    await this.db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));
    return { staffToken: this.tokens.signStaff(u, actor.deviceId), staff: { id: u.id, name: u.name, role: u.role, avatarColor: u.avatarColor } };
  }

  async heartbeat(actor: DeviceActor, appVersion?: string) {
    await this.db.update(devices).set({ lastSeenAt: new Date(), online: true, appVersion: appVersion ?? undefined }).where(eq(devices.id, actor.deviceId));
    return { ok: true, serverTime: new Date().toISOString() };
  }
}
