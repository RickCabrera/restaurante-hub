import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import webpush from 'web-push';
import { NotificationType, RT } from '@rh/shared';
import { InjectDb, Db } from '../db/db.module';
import { notifications, pushSubscriptions, users } from '../db/schema';
import { loadEnv } from '../config/env';
import { JobsService } from '../jobs/jobs.service';
import { RealtimeService, Rooms } from '../realtime/realtime.service';
import { SettingsService } from '../settings/settings.service';
import { WhatsappClient } from '../whatsapp/client/whatsapp.client';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  /** ruta relativa de la app web, p.ej. /admin/requisiciones/abc */
  link?: string;
  data?: Record<string, unknown>;
  /** urgente: ignora horario de silencio */
  urgent?: boolean;
}

/** Tipos que por defecto también se mandan por WhatsApp a la dueña (si está activado en Configuración). */
const WHATSAPP_DEFAULT: NotificationType[] = ['REQUISITION_NEW', 'REQUISITION_URGENT', 'HUMAN_HANDOFF', 'DAILY_SUMMARY', 'PRINT_ERROR'];

/**
 * Notificaciones a la dueña y al personal:
 *  - En la app (tabla notification + evento tiempo real)
 *  - Web Push (celular/PC con la PWA instalada)
 *  - WhatsApp a la dueña (plantilla `alerta_dueno` cuando el número esté conectado)
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly log = new Logger('Notifications');
  private readonly env = loadEnv();
  private pushEnabled = false;

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly jobs: JobsService,
    private readonly rt: RealtimeService,
    private readonly settings: SettingsService,
    private readonly wa: WhatsappClient,
  ) {}

  onModuleInit() {
    if (this.env.VAPID_PUBLIC_KEY && this.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(this.env.VAPID_SUBJECT, this.env.VAPID_PUBLIC_KEY, this.env.VAPID_PRIVATE_KEY);
      this.pushEnabled = true;
    } else {
      this.log.warn('Web Push desactivado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (pnpm gen:vapid)');
    }
    this.jobs.register<{ notificationId: string }>('notify.push', (d) => this.deliverPush(d.notificationId));
    this.jobs.register<{ businessId: string; text: string; notificationIds: string[] }>('notify.whatsapp', (d) =>
      this.deliverWhatsapp(d.businessId, d.text, d.notificationIds),
    );
  }

  get vapidPublicKey() {
    return this.env.VAPID_PUBLIC_KEY ?? null;
  }

  /** Notifica a la dueña y administradores activos del negocio. */
  async notifyManagers(businessId: string, input: NotifyInput) {
    const mgrs = await this.db.query.users.findMany({
      where: and(eq(users.businessId, businessId), eq(users.active, true), inArray(users.role, ['OWNER', 'ADMIN'])),
      columns: { id: true },
    });
    return this.notifyUsers(businessId, mgrs.map((m) => m.id), input);
  }

  async notifyUsers(businessId: string, userIds: string[], input: NotifyInput) {
    if (!userIds.length) return [];
    const recipients = await this.db.query.users.findMany({
      where: inArray(users.id, userIds),
      columns: { id: true, notificationPrefs: true, role: true },
    });
    const created = await this.db
      .insert(notifications)
      .values(
        recipients.map((u) => ({
          businessId,
          userId: u.id,
          type: input.type,
          title: input.title,
          body: input.body,
          link: input.link ?? null,
          data: input.data ?? null,
        })),
      )
      .returning();

    const quiet = !input.urgent && (await this.inQuietHours(businessId));
    for (const n of created) {
      this.rt.emit(Rooms.user(n.userId), RT.NOTIFICATION, n);
      const prefs = recipients.find((r) => r.id === n.userId)?.notificationPrefs?.[input.type] ?? {};
      if (this.pushEnabled && prefs.push !== false && !quiet) {
        await this.jobs.add('notify.push', { notificationId: n.id });
      }
    }

    // WhatsApp a la dueña (un solo mensaje por evento)
    const s = await this.settings.getSettings(businessId);
    if (s.notifyOwnerByWhatsapp && s.ownerWhatsapp && WHATSAPP_DEFAULT.includes(input.type) && (!quiet || input.urgent)) {
      const link = input.link ? `${this.env.APP_URL.replace(/\/$/, '')}${input.link}` : '';
      await this.jobs.add('notify.whatsapp', {
        businessId,
        text: `${input.title}\n${input.body}${link ? `\n${link}` : ''}`,
        notificationIds: created.map((c) => c.id),
      });
    }
    return created;
  }

  async list(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    return this.db.query.notifications.findMany({
      where: opts.unreadOnly ? and(eq(notifications.userId, userId), isNull(notifications.readAt)) : eq(notifications.userId, userId),
      orderBy: desc(notifications.createdAt),
      limit: Math.min(opts.limit ?? 50, 200),
    });
  }

  async unreadCount(userId: string) {
    const rows = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return rows.length;
  }

  async markRead(userId: string, ids?: string[]) {
    const where = ids?.length
      ? and(eq(notifications.userId, userId), inArray(notifications.id, ids))
      : and(eq(notifications.userId, userId), isNull(notifications.readAt));
    await this.db.update(notifications).set({ readAt: new Date() }).where(where);
  }

  async subscribePush(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, ua?: string) {
    await this.db
      .insert(pushSubscriptions)
      .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: ua ?? null })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  }

  async unsubscribePush(endpoint: string) {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  private async deliverPush(notificationId: string) {
    const n = await this.db.query.notifications.findFirst({ where: eq(notifications.id, notificationId) });
    if (!n) return;
    const subs = await this.db.query.pushSubscriptions.findMany({ where: eq(pushSubscriptions.userId, n.userId) });
    const payload = JSON.stringify({ title: n.title, body: n.body, url: n.link ?? '/admin', tag: n.type, id: n.id });
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)); // suscripción vencida
        } else {
          this.log.warn(`Push falló: ${(e as Error).message}`);
        }
      }
    }
    await this.db.update(notifications).set({ pushedAt: new Date() }).where(eq(notifications.id, n.id));
  }

  private async deliverWhatsapp(businessId: string, text: string, notificationIds: string[]) {
    const s = await this.settings.getSettings(businessId);
    if (!s.ownerWhatsapp) return;
    // Plantilla aprobada en Meta: alerta_dueno ({{1}} = texto). En simulador se manda como texto.
    if (this.wa.simulated) {
      await this.wa.send(businessId, s.ownerWhatsapp, { kind: 'text', body: text });
    } else {
      await this.wa.send(businessId, s.ownerWhatsapp, { kind: 'template', name: 'alerta_dueno', params: [text.slice(0, 1000)] });
    }
    if (notificationIds.length) {
      await this.db.update(notifications).set({ whatsappAt: new Date() }).where(inArray(notifications.id, notificationIds));
    }
  }

  private async inQuietHours(businessId: string): Promise<boolean> {
    const s = await this.settings.getSettings(businessId);
    if (!s.quietHours?.from || !s.quietHours?.to) return false;
    const b = await this.settings.getBusiness(businessId);
    const now = localHHMM(b.timezone);
    const { from, to } = s.quietHours;
    return from <= to ? now >= from && now < to : now >= from || now < to;
  }
}

export function localHHMM(timezone: string, d = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
