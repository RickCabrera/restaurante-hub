import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { ModuleKey } from '@rh/shared';
import { InjectDb, Db, DbOrTx } from '../db/db.module';
import { businesses, BusinessSettings } from '../db/schema';
import { loadEnv } from '../config/env';

export const DEFAULT_SETTINGS: Required<Pick<BusinessSettings,
  'modules' | 'requirePin' | 'groupWindowMinutes' | 'tips' | 'urgentEscalationMinutes' | 'notifyOwnerByWhatsapp' | 'bot'>> = {
  modules: { requisitions: true, delivery: true, pos: false },
  requirePin: false,
  groupWindowMinutes: 0,
  tips: [10, 15, 20],
  urgentEscalationMinutes: 10,
  notifyOwnerByWhatsapp: false,
  bot: {
    greeting: '¡Hola! 👋 Bienvenido a *{negocio}*. ¿Qué te gustaría hacer?',
    closedMessage: 'Por ahora estamos cerrados 😴. Nuestro horario: {horario}',
    handoffMessage: 'Listo, en un momento te atiende una persona de nuestro equipo 🙋',
    goodbye: '¡Gracias por tu pedido! 🧡',
    allowScheduledWhenClosed: false,
  },
};

export type Business = typeof businesses.$inferSelect;

/** Negocio + configuración con valores por defecto, con caché corta. */
@Injectable()
export class SettingsService {
  private cache = new Map<string, { b: Business; at: number }>();

  constructor(@InjectDb() private readonly db: Db) {}

  async getBusiness(businessId: string): Promise<Business> {
    const c = this.cache.get(businessId);
    if (c && Date.now() - c.at < 15_000) return c.b;
    const b = await this.db.query.businesses.findFirst({ where: eq(businesses.id, businessId) });
    if (!b) throw new NotFoundException('Negocio no encontrado');
    this.cache.set(businessId, { b, at: Date.now() });
    return b;
  }

  async getBySlug(slug?: string): Promise<Business> {
    const s = slug || loadEnv().DEFAULT_BUSINESS_SLUG;
    const b = await this.db.query.businesses.findFirst({ where: eq(businesses.slug, s) });
    if (!b) throw new NotFoundException('Negocio no encontrado');
    return b;
  }

  async getSettings(businessId: string): Promise<BusinessSettings & typeof DEFAULT_SETTINGS> {
    const b = await this.getBusiness(businessId);
    return mergeSettings(b.settings);
  }

  async isModuleEnabled(businessId: string, m: ModuleKey): Promise<boolean> {
    const s = await this.getSettings(businessId);
    return !!s.modules[m];
  }

  async update(businessId: string, patch: Partial<Business> & { settings?: BusinessSettings }) {
    const current = await this.getBusiness(businessId);
    const settings = patch.settings ? { ...current.settings, ...patch.settings } : current.settings;
    const { id: _id, createdAt: _c, folioCounters: _f, ...rest } = patch as Business;
    const [b] = await this.db
      .update(businesses)
      .set({ ...rest, settings })
      .where(eq(businesses.id, businessId))
      .returning();
    this.cache.delete(businessId);
    return b;
  }

  invalidate(businessId: string) {
    this.cache.delete(businessId);
  }

  /**
   * Siguiente folio consecutivo atómico por negocio y prefijo.
   * Ej. nextFolio(bid, 'REQ') -> "REQ-000123"
   */
  async nextFolio(tx: DbOrTx, businessId: string, prefix: string, pad = 6): Promise<string> {
    // jsonb_set atómico en una sola sentencia (bloquea la fila del negocio durante el UPDATE)
    const r = await tx.execute(sql`
      UPDATE business SET folio_counters = jsonb_set(
        folio_counters, ARRAY[${prefix}]::text[],
        to_jsonb(COALESCE((folio_counters->>${prefix})::int, 0) + 1))
      WHERE id = ${businessId}
      RETURNING (folio_counters->>${prefix})::int AS n`);
    const n = Number((r.rows[0] as { n: number } | undefined)?.n ?? 1);
    return `${prefix}-${String(n).padStart(pad, '0')}`;
  }
}

export function mergeSettings(s: BusinessSettings | null | undefined) {
  const v = s ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...v,
    modules: { ...DEFAULT_SETTINGS.modules, ...(v.modules ?? {}) },
    bot: { ...DEFAULT_SETTINGS.bot, ...(v.bot ?? {}) },
  };
}
