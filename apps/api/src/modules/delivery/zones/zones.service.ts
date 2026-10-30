import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { RT } from '@rh/shared';
import { z } from 'zod';
import { Db, InjectDb } from '../../../db/db.module';
import { branches, deliveryZones, GeoPolygon } from '../../../db/schema';
import { RealtimeService } from '../../../realtime/realtime.service';
import { ZonePatchSchema, ZoneSchema } from '../common/dto';
import { CoverageResult, pickZone, validPolygon, ZoneCandidate } from './coverage';

@Injectable()
export class CoverageService {
  constructor(@InjectDb() private readonly db: Db) {}

  async candidates(businessId: string): Promise<ZoneCandidate[]> {
    const bs = await this.db.query.branches.findMany({ where: eq(branches.businessId, businessId) });
    if (!bs.length) return [];
    const zs = await this.db.query.deliveryZones.findMany({ where: inArray(deliveryZones.branchId, bs.map((b) => b.id)) });
    return zs.map((z1) => {
      const b = bs.find((x) => x.id === z1.branchId)!;
      return {
        ...z1,
        kind: z1.kind,
        branch: { id: b.id, name: b.name, lat: b.lat, lng: b.lng, active: b.active, acceptsDelivery: b.acceptsDelivery },
      };
    });
  }

  /** Mejor zona para la ubicación, o null si no hay cobertura. */
  async resolve(businessId: string, lat: number, lng: number): Promise<CoverageResult | null> {
    return pickZone(await this.candidates(businessId), lat, lng);
  }
}

@Injectable()
export class ZonesService {
  constructor(@InjectDb() private readonly db: Db, private readonly rt: RealtimeService) {}

  private async branchOf(businessId: string, branchId: string) {
    const b = await this.db.query.branches.findFirst({ where: eq(branches.id, branchId) });
    if (!b || b.businessId !== businessId) throw new BadRequestException('La sucursal no existe');
    return b;
  }

  async list(businessId: string) {
    const bs = await this.db.query.branches.findMany({ where: eq(branches.businessId, businessId), columns: { id: true, name: true } });
    if (!bs.length) return [];
    const zs = await this.db.query.deliveryZones.findMany({
      where: inArray(deliveryZones.branchId, bs.map((b) => b.id)),
      orderBy: [asc(deliveryZones.priority), asc(deliveryZones.name)],
    });
    return zs.map((z1) => ({ ...z1, branchName: bs.find((b) => b.id === z1.branchId)?.name ?? null }));
  }

  async get(businessId: string, id: string) {
    const z1 = await this.db.query.deliveryZones.findFirst({ where: eq(deliveryZones.id, id), with: { branch: true } });
    if (!z1 || z1.branch.businessId !== businessId) throw new NotFoundException('Zona no encontrada');
    const { branch, ...rest } = z1;
    return { ...rest, branchName: branch.name };
  }

  private check(kind: string | undefined, polygon: GeoPolygon | null | undefined, radiusKm: number | null | undefined, branchHasLatLng: boolean) {
    if (kind === 'POLYGON' && !validPolygon(polygon)) {
      throw new BadRequestException('El polígono debe ser un anillo cerrado de al menos 4 puntos [lng, lat]');
    }
    if (kind === 'RADIUS') {
      if (radiusKm == null) throw new BadRequestException('Indica el radio en km');
      if (!branchHasLatLng) throw new BadRequestException('La sucursal no tiene ubicación (lat/lng); configúrala para usar zonas por radio');
    }
  }

  async create(businessId: string, dto: z.infer<typeof ZoneSchema>) {
    const b = await this.branchOf(businessId, dto.branchId);
    this.check(dto.kind, dto.polygon as GeoPolygon | null, dto.radiusKm, b.lat != null && b.lng != null);
    const [z1] = await this.db
      .insert(deliveryZones)
      .values({ ...dto, polygon: (dto.polygon as GeoPolygon | null) ?? null, radiusKm: dto.radiusKm ?? null, freeFromCents: dto.freeFromCents ?? null })
      .returning();
    this.rt.toManagers(businessId, RT.STORE_STATUS, { zonesChanged: true });
    return z1;
  }

  async update(businessId: string, id: string, dto: z.infer<typeof ZonePatchSchema>) {
    const cur = await this.get(businessId, id);
    const branchId = dto.branchId ?? cur.branchId;
    const b = await this.branchOf(businessId, branchId);
    const kind = dto.kind ?? cur.kind;
    const polygon = (dto.polygon === undefined ? cur.polygon : dto.polygon) as GeoPolygon | null;
    const radiusKm = dto.radiusKm === undefined ? cur.radiusKm : dto.radiusKm;
    this.check(kind, polygon, radiusKm, b.lat != null && b.lng != null);
    const [z1] = await this.db
      .update(deliveryZones)
      .set({ ...dto, polygon: polygon ?? null })
      .where(eq(deliveryZones.id, id))
      .returning();
    return z1;
  }

  async remove(businessId: string, id: string) {
    await this.get(businessId, id);
    await this.db.delete(deliveryZones).where(eq(deliveryZones.id, id));
    return { ok: true };
  }
}
