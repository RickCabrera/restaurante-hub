import {
  boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { notificationTypeEnum, roleEnum } from './enums';

// Helpers comunes ---------------------------------------------------------
export const id = () => text().primaryKey().$defaultFn(() => createId());
export const ts = () => timestamp({ withTimezone: true, mode: 'date' });
export const createdAt = () => ts().notNull().defaultNow();
export const updatedAt = () => ts().notNull().defaultNow().$onUpdate(() => new Date());
export const fk = () => text();

/** Configuración del negocio (columna Business.settings). */
export interface BusinessSettings {
  modules?: { requisitions?: boolean; delivery?: boolean; pos?: boolean };
  requirePin?: boolean;
  groupWindowMinutes?: number; // agrupar requisiciones del mismo área no vistas (0 = no agrupar)
  quietHours?: { from: string; to: string } | null;
  transferInfo?: string | null;
  privacyNoticeUrl?: string | null;
  ticketFooter?: string | null;
  tips?: number[];
  dailySummaryHour?: number | null; // hora local 0-23
  ownerWhatsapp?: string | null;
  /** cuándo se imprimen comandas de delivery: al crear o al aceptar el pedido */
  printOn?: 'create' | 'accept';
  notifyOwnerByWhatsapp?: boolean;
  urgentEscalationMinutes?: number;
  lowStockWarning?: boolean;
  loyalty?: { enabled: boolean; everyOrders: number; discountType: 'PERCENT' | 'AMOUNT'; value: number } | null;
  bot?: {
    greeting?: string;
    closedMessage?: string;
    handoffMessage?: string;
    goodbye?: string;
    allowScheduledWhenClosed?: boolean;
  };
}

export const businesses = pgTable('business', {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  logoUrl: text(),
  primaryColor: text().notNull().default('#E85D04'),
  accentColor: text().notNull().default('#1D3557'),
  timezone: text().notNull().default('America/Mexico_City'),
  currency: text().notNull().default('MXN'),
  phone: text(),
  address: text(),
  settings: jsonb().$type<BusinessSettings>().notNull().default({}),
  folioCounters: jsonb().$type<Record<string, number>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type OpeningHours = Record<string, { open: string; close: string }[]>; // "0".."6" (0 = domingo)

export const branches = pgTable('branch', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  address: text(),
  phone: text(),
  lat: doublePrecision(),
  lng: doublePrecision(),
  hours: jsonb().$type<OpeningHours>().notNull().default({}),
  closedDates: jsonb().$type<string[]>().notNull().default([]),
  pausedUntil: ts(),
  pauseReason: text(),
  acceptsDelivery: boolean().notNull().default(true),
  acceptsPickup: boolean().notNull().default(true),
  prepMinutes: integer().notNull().default(25),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index().on(t.businessId)]);

export type OrderWindow = Record<string, { until: string }>; // "1": {until:"18:00"}

export const areas = pgTable('area', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  branchId: fk().references(() => branches.id, { onDelete: 'set null' }),
  name: text().notNull(),
  color: text().notNull().default('#2A9D8F'),
  icon: text().notNull().default('chef'),
  sortOrder: integer().notNull().default(0),
  isProduction: boolean().notNull().default(true),
  canRequisition: boolean().notNull().default(true),
  orderWindow: jsonb().$type<OrderWindow>().notNull().default({}),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index().on(t.businessId)]);

export type NotificationPrefs = Record<string, { push?: boolean; whatsapp?: boolean; inApp?: boolean }>;

export const users = pgTable('app_user', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  email: text(),
  phone: text(),
  passwordHash: text(),
  pinHash: text(),
  role: roleEnum().notNull(),
  avatarColor: text().notNull().default('#264653'),
  active: boolean().notNull().default(true),
  failedLogins: integer().notNull().default(0),
  lockedUntil: ts(),
  lastLoginAt: ts(),
  notificationPrefs: jsonb().$type<NotificationPrefs>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex().on(t.businessId, t.email),
  uniqueIndex().on(t.businessId, t.phone),
]);

export const userAreas = pgTable('user_area', {
  userId: fk().notNull().references(() => users.id, { onDelete: 'cascade' }),
  areaId: fk().notNull().references(() => areas.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.userId, t.areaId] })]);

export const refreshTokens = pgTable('refresh_token', {
  id: id(),
  userId: fk().notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text().notNull().unique(),
  expiresAt: ts().notNull(),
  revokedAt: ts(),
  replacedBy: text(),
  userAgent: text(),
  createdAt: createdAt(),
}, (t) => [index().on(t.userId)]);

/** purpose: "AREA" (tablet de requisiciones) | "KDS" (pantalla de cocina) | "POS" (caja/comandero) */
export const pairingCodes = pgTable('pairing_code', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  code: text().notNull(),
  areaId: fk().references(() => areas.id, { onDelete: 'cascade' }),
  purpose: text().notNull().default('AREA'),
  expiresAt: ts().notNull(),
  usedAt: ts(),
  createdAt: createdAt(),
}, (t) => [index().on(t.code)]);

export const devices = pgTable('device', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  areaId: fk().references(() => areas.id, { onDelete: 'set null' }),
  name: text().notNull(),
  purpose: text().notNull().default('AREA'),
  platform: text().notNull().default('web'),
  tokenHash: text().notNull().unique(),
  lastSeenAt: ts(),
  online: boolean().notNull().default(false),
  revokedAt: ts(),
  appVersion: text(),
  createdAt: createdAt(),
}, (t) => [index().on(t.businessId)]);

export const auditLogs = pgTable('audit_log', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  actorType: text().notNull(), // USER | DEVICE | SYSTEM | CUSTOMER | AGENT
  actorId: text(),
  actorName: text(),
  action: text().notNull(), // "requisition.approve"
  entity: text().notNull(),
  entityId: text(),
  data: jsonb(),
  ip: text(),
  createdAt: createdAt(),
}, (t) => [index().on(t.businessId, t.createdAt), index().on(t.entity, t.entityId)]);

export const pushSubscriptions = pgTable('push_subscription', {
  id: id(),
  userId: fk().notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text().notNull().unique(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  userAgent: text(),
  createdAt: createdAt(),
});

export const notifications = pgTable('notification', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  userId: fk().notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum().notNull(),
  title: text().notNull(),
  body: text().notNull(),
  link: text(),
  data: jsonb(),
  readAt: ts(),
  pushedAt: ts(),
  whatsappAt: ts(),
  createdAt: createdAt(),
}, (t) => [index().on(t.userId, t.readAt)]);
