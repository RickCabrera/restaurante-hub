import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, asc, count, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { RT } from '@rh/shared';
import { InjectDb, Db } from '../../db/db.module';
import { areas, branches, conversations, devices, requisitions } from '../../db/schema';
import type { Actor } from '../../common/actor';
import { AuditService } from '../../common/services/audit.service';
import { RealtimeService, Rooms } from '../../realtime/realtime.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { TokenService } from '../../auth/token.service';
import { SettingsService } from '../../settings/settings.service';
import type { AreaDto } from './dto';

type AreaRow = typeof areas.$inferSelect;
type DeviceRow = typeof devices.$inferSelect;

export interface DeviceView {
  id: string;
  name: string;
  purpose: string;
  platform: string;
  areaId: string | null;
  area: { id: string; name: string; color: string; icon: string } | null;
  online: boolean;
  lastSeenAt: Date | null;
  appVersion: string | null;
  revokedAt: Date | null;
  createdAt: Date;
}

const OFFLINE_AFTER_MS = 3 * 60_000;

@Injectable()
export class AreasService implements OnModuleInit {
  private readonly log = new Logger('Areas');
  /** dispositivos ya notificados como desconectados (deviceId → lastSeenAt ISO del episodio) */
  private readonly offlineNotified = new Map<string, string>();

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: AuditService,
    private readonly rt: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly tokens: TokenService,
    private readonly settings: SettingsService,
  ) {}

  // -------------------------------------------------------------- áreas
  async list(actor: Actor, includeInactive = false) {
    const rows = await this.db.query.areas.findMany({
      where: includeInactive ? eq(areas.businessId, actor.businessId) : and(eq(areas.businessId, actor.businessId), eq(areas.active, true)),
      orderBy: [asc(areas.sortOrder), asc(areas.name)],
    });
    const devs = await this.db
      .select({ areaId: devices.areaId, n: count() })
      .from(devices)
      .where(and(eq(devices.businessId, actor.businessId), isNull(devices.revokedAt)))
      .groupBy(devices.areaId);
    return rows.map((a) => ({ ...a, deviceCount: devs.find((d) => d.areaId === a.id)?.n ?? 0 }));
  }

  async get(actor: Actor, id: string): Promise<AreaRow> {
    const a = await this.db.query.areas.findFirst({ where: and(eq(areas.id, id), eq(areas.businessId, actor.businessId)) });
    if (!a) throw new NotFoundException('Área no encontrada');
    return a;
  }

  private async validateBranch(actor: Actor, branchId: string | null | undefined) {
    if (!branchId) return;
    const b = await this.db.query.branches.findFirst({ where: and(eq(branches.id, branchId), eq(branches.businessId, actor.businessId)) });
    if (!b) throw new BadRequestException('Sucursal inválida');
  }

  async create(actor: Actor, dto: AreaDto) {
    await this.validateBranch(actor, dto.branchId);
    const [{ max }] = await this.db
      .select({ max: sql<number>`coalesce(max(${areas.sortOrder}), 0)` })
      .from(areas)
      .where(eq(areas.businessId, actor.businessId));
    const area = await this.db.transaction(async (tx) => {
      const [a] = await tx
        .insert(areas)
        .values({ ...dto, branchId: dto.branchId ?? null, businessId: actor.businessId, sortOrder: Number(max) + 1 })
        .returning();
      await tx
        .insert(conversations)
        .values({ businessId: actor.businessId, type: 'AREA_OWNER', areaId: a.id, title: a.name })
        .onConflictDoNothing();
      return a;
    });
    this.rt.toBusiness(actor.businessId, RT.CATALOG_CHANGED, { kind: 'area', id: area.id });
    return area;
  }

  async update(actor: Actor, id: string, dto: Partial<AreaDto>) {
    await this.get(actor, id);
    if (dto.branchId !== undefined) await this.validateBranch(actor, dto.branchId);
    const [a] = await this.db.update(areas).set(dto).where(and(eq(areas.id, id), eq(areas.businessId, actor.businessId))).returning();
    if (dto.name) {
      await this.db.update(conversations).set({ title: dto.name }).where(and(eq(conversations.areaId, id), eq(conversations.type, 'AREA_OWNER')));
    }
    this.rt.toBusiness(actor.businessId, RT.CATALOG_CHANGED, { kind: 'area', id });
    this.rt.emit(Rooms.area(id), 'area.updated', a);
    return a;
  }

  /** Borra el área; si ya tiene requisiciones se desactiva (se conserva el historial). */
  async remove(actor: Actor, id: string) {
    await this.get(actor, id);
    const [{ n }] = await this.db.select({ n: count() }).from(requisitions).where(eq(requisitions.areaId, id));
    if (n > 0) {
      await this.db.update(areas).set({ active: false }).where(eq(areas.id, id));
      this.rt.toBusiness(actor.businessId, RT.CATALOG_CHANGED, { kind: 'area', id });
      return { ok: true, deactivated: true };
    }
    await this.db.delete(areas).where(and(eq(areas.id, id), eq(areas.businessId, actor.businessId)));
    this.rt.toBusiness(actor.businessId, RT.CATALOG_CHANGED, { kind: 'area', id });
    return { ok: true, deactivated: false };
  }

  async reorder(actor: Actor, ids: string[]) {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(areas).set({ sortOrder: i + 1 }).where(and(eq(areas.id, id), eq(areas.businessId, actor.businessId)));
      }
    });
    this.rt.toBusiness(actor.businessId, RT.CATALOG_CHANGED, { kind: 'area' });
    return this.list(actor, true);
  }

  // -------------------------------------------------------------- dispositivos
  async listDevices(actor: Actor, opts: { includeRevoked?: boolean; areaId?: string }): Promise<DeviceView[]> {
    const conds = [eq(devices.businessId, actor.businessId)];
    if (!opts.includeRevoked) conds.push(isNull(devices.revokedAt));
    if (opts.areaId) conds.push(eq(devices.areaId, opts.areaId));
    const rows = await this.db.query.devices.findMany({ where: and(...conds), with: { area: true }, orderBy: [asc(devices.name)] });
    return Promise.all(rows.map(async (d) => this.toView(d, d.area, await this.rt.roomSize(Rooms.device(d.id)))));
  }

  private toView(d: DeviceRow, area: AreaRow | null, sockets: number): DeviceView {
    const fresh = !!d.lastSeenAt && Date.now() - d.lastSeenAt.getTime() < OFFLINE_AFTER_MS;
    return {
      id: d.id, name: d.name, purpose: d.purpose, platform: d.platform, areaId: d.areaId,
      area: area ? { id: area.id, name: area.name, color: area.color, icon: area.icon } : null,
      online: !d.revokedAt && (sockets > 0 || (d.online && fresh)),
      lastSeenAt: d.lastSeenAt, appVersion: d.appVersion, revokedAt: d.revokedAt, createdAt: d.createdAt,
    };
  }

  async updateDevice(actor: Actor, id: string, dto: { name?: string; areaId?: string | null }) {
    const d = await this.db.query.devices.findFirst({ where: and(eq(devices.id, id), eq(devices.businessId, actor.businessId)) });
    if (!d) throw new NotFoundException('Dispositivo no encontrado');
    if (dto.areaId) await this.get(actor, dto.areaId);
    if (dto.areaId === null && (d.purpose === 'AREA' || d.purpose === 'KDS')) throw new BadRequestException('Esta tablet necesita un área');
    const [u] = await this.db.update(devices).set(dto).where(eq(devices.id, id)).returning();
    this.tokens.invalidateDevice(u.tokenHash);
    const area = u.areaId ? await this.get(actor, u.areaId) : null;
    if (dto.areaId !== undefined && dto.areaId !== d.areaId && this.rt.server) {
      // mueve los sockets de la tablet a la sala de su nueva área
      if (d.areaId) this.rt.server.in(Rooms.device(id)).socketsLeave([Rooms.area(d.areaId), Rooms.kds(d.areaId)]);
      if (u.areaId) this.rt.server.in(Rooms.device(id)).socketsJoin(u.purpose === 'KDS' ? [Rooms.area(u.areaId), Rooms.kds(u.areaId)] : [Rooms.area(u.areaId)]);
    }
    const view = this.toView(u, area, await this.rt.roomSize(Rooms.device(id)));
    this.rt.emit(Rooms.device(id), RT.DEVICE_STATUS, view);
    this.rt.toManagers(actor.businessId, RT.DEVICE_STATUS, view);
    return view;
  }

  // -------------------------------------------------------------- presencia de tablets
  onModuleInit() {
    this.rt.onConnect(async (_socket, actor) => {
      if (actor.kind !== 'device') return;
      await this.setPresence(actor.businessId, actor.deviceId, true);
    });
    this.rt.onDisconnect(async (_socket, actor) => {
      if (actor.kind !== 'device') return;
      const left = await this.rt.roomSize(Rooms.device(actor.deviceId));
      if (left > 0) return; // otra pestaña/socket de la misma tablet sigue conectada
      await this.setPresence(actor.businessId, actor.deviceId, false);
    });
  }

  private async setPresence(businessId: string, deviceId: string, online: boolean) {
    const now = new Date();
    const [d] = await this.db
      .update(devices)
      .set({ online, lastSeenAt: now })
      .where(and(eq(devices.id, deviceId), isNull(devices.revokedAt)))
      .returning();
    if (!d) return;
    if (online) this.offlineNotified.delete(deviceId);
    this.rt.toManagers(businessId, RT.DEVICE_STATUS, { id: d.id, areaId: d.areaId, online, lastSeenAt: now.toISOString() });
  }

  /** Cada 2 min: tablets sin señal > 3 min y sin socket → fuera de línea; avisa una vez por episodio (solo tablets de área). */
  @Cron('*/2 * * * *')
  async sweepOffline() {
    try {
      const cutoff = new Date(Date.now() - OFFLINE_AFTER_MS);
      const horizon = new Date(Date.now() - 6 * 3_600_000); // no re-notificar desconexiones viejas tras reiniciar
      const rows = await this.db.query.devices.findMany({
        where: and(isNull(devices.revokedAt), lt(devices.lastSeenAt, cutoff), gte(devices.lastSeenAt, horizon)),
        with: { area: true },
      });
      for (const d of rows) {
        if ((await this.rt.roomSize(Rooms.device(d.id))) > 0) {
          await this.db.update(devices).set({ online: true, lastSeenAt: new Date() }).where(eq(devices.id, d.id));
          continue;
        }
        if (d.online) {
          await this.db.update(devices).set({ online: false }).where(eq(devices.id, d.id));
          this.rt.toManagers(d.businessId, RT.DEVICE_STATUS, { id: d.id, areaId: d.areaId, online: false, lastSeenAt: d.lastSeenAt?.toISOString() ?? null });
        }
        const episode = d.lastSeenAt?.toISOString() ?? '';
        if (d.purpose !== 'AREA' || this.offlineNotified.get(d.id) === episode) continue;
        this.offlineNotified.set(d.id, episode);
        const tz = (await this.settings.getBusiness(d.businessId)).timezone;
        await this.notifications.notifyManagers(d.businessId, {
          type: 'DEVICE_OFFLINE',
          title: `Tablet sin conexión · ${d.area?.name ?? d.name}`,
          body: `«${d.name}» no se ha conectado desde las ${d.lastSeenAt ? hhmm(d.lastSeenAt, tz) : '—'}`,
          link: '/admin/dispositivos',
          data: { deviceId: d.id, areaId: d.areaId },
        });
      }
      // limpia memoria de tablets que ya no aparecen
      if (this.offlineNotified.size > 500) {
        const alive = new Set(rows.map((r) => r.id));
        for (const k of this.offlineNotified.keys()) if (!alive.has(k)) this.offlineNotified.delete(k);
      }
    } catch (e) {
      this.log.warn(`sweepOffline: ${(e as Error).message}`);
    }
  }

  /** Para el panel: ids de tablets por área (útil para "estado de tablets"). */
  async devicesByArea(businessId: string, areaIds: string[]) {
    if (!areaIds.length) return [];
    return this.db.select().from(devices).where(and(eq(devices.businessId, businessId), inArray(devices.areaId, areaIds), isNull(devices.revokedAt)));
  }
}

function hhmm(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat('es-MX', { timeZone, hour: '2-digit', minute: '2-digit' }).format(d);
}
