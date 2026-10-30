import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, asc, eq } from 'drizzle-orm';
import { RT } from '@rh/shared';
import { z } from 'zod';
import { Db, InjectDb } from '../../../db/db.module';
import { branches } from '../../../db/schema';
import { RealtimeService } from '../../../realtime/realtime.service';
import { SettingsService } from '../../../settings/settings.service';
import { BranchPatchSchema, BranchSchema, PauseSchema } from '../common/dto';
import { StoreStatus, storeStatus } from './store-hours';

export type Branch = typeof branches.$inferSelect;

/** ZON-03: estado abierto/cerrado de una sucursal en la zona horaria del negocio. */
@Injectable()
export class StoreHoursService {
  constructor(private readonly settings: SettingsService) {}

  async isOpen(branch: Branch, now = new Date()): Promise<boolean> {
    return (await this.status(branch, now)).open;
  }

  async status(branch: Branch, now = new Date()): Promise<StoreStatus> {
    const b = await this.settings.getBusiness(branch.businessId);
    return storeStatus(branch, now, b.timezone);
  }

  async nextOpening(branch: Branch, now = new Date()): Promise<string | null> {
    return (await this.status(branch, now)).nextOpeningText;
  }
}

@Injectable()
export class BranchesService {
  private readonly log = new Logger('Branches');
  private lastOpen = new Map<string, boolean>();

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly hours: StoreHoursService,
    private readonly rt: RealtimeService,
  ) {}

  async list(businessId: string, opts: { activeOnly?: boolean } = {}) {
    const rows = await this.db.query.branches.findMany({
      where: opts.activeOnly ? and(eq(branches.businessId, businessId), eq(branches.active, true)) : eq(branches.businessId, businessId),
      orderBy: asc(branches.createdAt),
    });
    return Promise.all(rows.map(async (b) => ({ ...b, status: await this.hours.status(b) })));
  }

  async get(businessId: string, id: string): Promise<Branch> {
    const b = await this.db.query.branches.findFirst({ where: and(eq(branches.id, id), eq(branches.businessId, businessId)) });
    if (!b) throw new NotFoundException('Sucursal no encontrada');
    return b;
  }

  async withStatus(b: Branch) {
    return { ...b, status: await this.hours.status(b) };
  }

  async create(businessId: string, dto: z.infer<typeof BranchSchema>) {
    const [b] = await this.db.insert(branches).values({ ...dto, businessId }).returning();
    return this.changed(b);
  }

  async update(businessId: string, id: string, dto: z.infer<typeof BranchPatchSchema>) {
    await this.get(businessId, id);
    const [b] = await this.db.update(branches).set(dto).where(eq(branches.id, id)).returning();
    return this.changed(b);
  }

  async remove(businessId: string, id: string) {
    await this.get(businessId, id);
    // Baja lógica: hay pedidos que referencian la sucursal
    const [b] = await this.db.update(branches).set({ active: false }).where(eq(branches.id, id)).returning();
    await this.changed(b);
    return { ok: true };
  }

  async pause(businessId: string, id: string, dto: z.infer<typeof PauseSchema>) {
    await this.get(businessId, id);
    const until = dto.until ?? new Date(Date.now() + (dto.minutes ?? 30) * 60_000);
    const [b] = await this.db
      .update(branches)
      .set({ pausedUntil: until, pauseReason: dto.reason ?? null })
      .where(eq(branches.id, id))
      .returning();
    return this.changed(b);
  }

  async resume(businessId: string, id: string) {
    await this.get(businessId, id);
    const [b] = await this.db.update(branches).set({ pausedUntil: null, pauseReason: null }).where(eq(branches.id, id)).returning();
    return this.changed(b);
  }

  private async changed(b: Branch) {
    const out = await this.withStatus(b);
    this.lastOpen.set(b.id, out.status.open);
    this.rt.toBusiness(b.businessId, RT.STORE_STATUS, { branchId: b.id, businessId: b.businessId, ...out.status });
    return out;
  }

  /** Avisa en tiempo real cuando una sucursal abre o cierra por horario o fin de pausa. */
  @Cron('*/1 * * * *')
  async tick() {
    try {
      const all = await this.db.query.branches.findMany({ where: eq(branches.active, true) });
      for (const b of all) {
        const st = await this.hours.status(b);
        const prev = this.lastOpen.get(b.id);
        this.lastOpen.set(b.id, st.open);
        if (prev !== undefined && prev !== st.open) {
          this.rt.toBusiness(b.businessId, RT.STORE_STATUS, { branchId: b.id, businessId: b.businessId, ...st });
        }
      }
    } catch (e) {
      this.log.debug(`tick: ${(e as Error).message}`);
    }
  }
}
