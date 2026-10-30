import {
  boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { areas, businesses, createdAt, devices, fk, id, ts, updatedAt, users } from './core';
import { conversationTypeEnum, priorityEnum, requisitionStatusEnum, unitEnum } from './enums';

export const supplyCategories = pgTable('supply_category', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  icon: text().notNull().default('box'),
  sortOrder: integer().notNull().default(0),
}, (t) => [index().on(t.businessId)]);

export const suppliers = pgTable('supplier', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  contactName: text(),
  phone: text(),
  deliveryDays: jsonb().$type<number[]>().notNull().default([]),
  notes: text(),
  active: boolean().notNull().default(true),
}, (t) => [index().on(t.businessId)]);

export const supplies = pgTable('supply', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  categoryId: fk().notNull().references(() => supplyCategories.id, { onDelete: 'restrict' }),
  supplierId: fk().references(() => suppliers.id, { onDelete: 'set null' }),
  name: text().notNull(),
  unit: unitEnum().notNull(),
  /** cuánto suma cada toque en la tablet (1 kg, 0.5 kg, 1 bote) */
  step: doublePrecision().notNull().default(1),
  maxPerOrder: doublePrecision(),
  icon: text(), // clave de la biblioteca de íconos
  imageUrl: text(),
  autoApprove: boolean().notNull().default(false),
  active: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index().on(t.businessId)]);

export const supplyAreas = pgTable('supply_area', {
  supplyId: fk().notNull().references(() => supplies.id, { onDelete: 'cascade' }),
  areaId: fk().notNull().references(() => areas.id, { onDelete: 'cascade' }),
  sortOrder: integer().notNull().default(0),
}, (t) => [primaryKey({ columns: [t.supplyId, t.areaId] })]);

export const requisitions = pgTable('requisition', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  folio: text().notNull(),
  areaId: fk().notNull().references(() => areas.id, { onDelete: 'restrict' }),
  deviceId: fk().references(() => devices.id, { onDelete: 'set null' }),
  createdById: fk().references(() => users.id, { onDelete: 'set null' }),
  createdByName: text(),
  clientRequestId: text().notNull(),
  /** clientRequestId de solicitudes que se agruparon en esta requisición (idempotencia al agrupar) */
  mergedRequestIds: jsonb().$type<string[]>().notNull().default([]),
  priority: priorityEnum().notNull().default('NORMAL'),
  status: requisitionStatusEnum().notNull().default('ENVIADA'),
  note: text(),
  neededFor: ts(),
  isLate: boolean().notNull().default(false),
  rejectReason: text(),
  cancelReason: text(),
  reviewNote: text(),
  receptionNote: text(),
  hasDifferences: boolean().notNull().default(false),
  seenAt: ts(),
  reviewedAt: ts(),
  reviewedById: text(),
  purchasingAt: ts(),
  fulfilledAt: ts(),
  receivedAt: ts(),
  cancelledAt: ts(),
  escalatedAt: ts(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex().on(t.businessId, t.folio),
  uniqueIndex().on(t.businessId, t.clientRequestId),
  index().on(t.businessId, t.status),
  index().on(t.areaId, t.createdAt),
]);

export const requisitionItems = pgTable('requisition_item', {
  id: id(),
  requisitionId: fk().notNull().references(() => requisitions.id, { onDelete: 'cascade' }),
  supplyId: fk().notNull().references(() => supplies.id, { onDelete: 'restrict' }),
  supplyName: text().notNull(),
  unit: unitEnum().notNull(),
  requestedQty: doublePrecision().notNull(),
  approvedQty: doublePrecision(),
  fulfilledQty: doublePrecision(),
  receivedQty: doublePrecision(),
  rejected: boolean().notNull().default(false),
  purchased: boolean().notNull().default(false),
  note: text(),
  reviewNote: text(),
}, (t) => [index().on(t.requisitionId), index().on(t.supplyId)]);

export const requisitionTemplates = pgTable('requisition_template', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  areaId: fk().notNull().references(() => areas.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  items: jsonb().$type<{ supplyId: string; quantity: number }[]>().notNull(),
  createdAt: createdAt(),
}, (t) => [index().on(t.areaId)]);

export const conversations = pgTable('conversation', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  type: conversationTypeEnum().notNull(),
  areaId: fk().references(() => areas.id, { onDelete: 'cascade' }),
  requisitionId: fk().unique().references(() => requisitions.id, { onDelete: 'cascade' }),
  title: text(),
  lastMessageAt: ts(),
  createdAt: createdAt(),
}, (t) => [
  index().on(t.businessId, t.type),
  // una sola conversación área↔dueña por área y un solo canal general por negocio
  uniqueIndex('conversation_area_owner_uq').on(t.businessId, t.areaId).where(sql`type = 'AREA_OWNER'`),
  uniqueIndex('conversation_general_uq').on(t.businessId).where(sql`type = 'GENERAL'`),
]);

export const messages = pgTable('message', {
  id: id(),
  conversationId: fk().notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  authorUserId: fk().references(() => users.id, { onDelete: 'set null' }),
  authorDeviceId: fk().references(() => devices.id, { onDelete: 'set null' }),
  authorName: text().notNull(),
  /** "MANAGER" | "AREA" | "SYSTEM" */
  authorSide: text().notNull(),
  body: text(),
  imageUrl: text(),
  quickMessageId: text(),
  isBroadcast: boolean().notNull().default(false),
  /** { MANAGER?: ISO, AREA?: ISO } */
  readBy: jsonb().$type<Record<string, string>>().notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index().on(t.conversationId, t.createdAt)]);

export const quickMessages = pgTable('quick_message', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  text: text().notNull(),
  icon: text().notNull().default('alert'),
  urgent: boolean().notNull().default(false),
  sortOrder: integer().notNull().default(0),
  active: boolean().notNull().default(true),
});
