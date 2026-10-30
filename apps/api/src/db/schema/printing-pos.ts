import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import type { PrintDocument } from '@rh/printing';
import { areas, branches, businesses, createdAt, fk, id, ts, updatedAt, users } from './core';
import { orders, OrderItemModifier } from './delivery';
import {
  cashMovementTypeEnum, paymentMethodEnum, printJobKindEnum, printJobStatusEnum,
  printerConnectionEnum, printerDialectEnum, tableStatusEnum, ticketStatusEnum,
} from './enums';
import { products } from './delivery';

// ===================== IMPRESIÓN =====================

/** kind: "agent" (node/Raspberry) | "desktop" (app Windows) | "android" (app Android, Bluetooth) */
export const printAgents = pgTable('print_agent', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  kind: text().notNull().default('agent'),
  tokenHash: text().notNull().unique(),
  online: boolean().notNull().default(false),
  lastSeenAt: ts(),
  version: text(),
  hostname: text(),
  platform: text(),
  discovered: jsonb().$type<{ name: string; type: string; path?: string }[]>().notNull().default([]),
  revokedAt: ts(),
  createdAt: createdAt(),
});

export const printers = pgTable('printer', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  areaId: fk().references(() => areas.id, { onDelete: 'set null' }),
  agentId: fk().references(() => printAgents.id, { onDelete: 'set null' }),
  name: text().notNull(),
  connection: printerConnectionEnum().notNull(),
  dialect: printerDialectEnum().notNull().default('ESC_POS'),
  host: text(),
  port: integer().default(9100),
  devicePath: text(),
  windowsName: text(),
  baudRate: integer(),
  bluetoothAddress: text(),
  paperWidth: integer().notNull().default(80),
  copies: integer().notNull().default(1),
  cutPaper: boolean().notNull().default(true),
  openDrawer: boolean().notNull().default(false),
  printsCustomerTicket: boolean().notNull().default(false),
  active: boolean().notNull().default(true),
  lastError: text(),
  createdAt: createdAt(),
});

export const printJobs = pgTable('print_job', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  printerId: fk().notNull().references(() => printers.id, { onDelete: 'cascade' }),
  agentId: fk().references(() => printAgents.id, { onDelete: 'set null' }),
  kind: printJobKindEnum().notNull(),
  orderId: fk().references(() => orders.id, { onDelete: 'set null' }),
  ticketId: text(),
  document: jsonb().$type<PrintDocument>().notNull(),
  status: printJobStatusEnum().notNull().default('PENDING'),
  attempts: integer().notNull().default(0),
  error: text(),
  sentAt: ts(),
  printedAt: ts(),
  createdAt: createdAt(),
}, (t) => [index().on(t.businessId, t.status), index().on(t.printerId, t.status)]);

// ===================== POS (OPCIONAL) =====================

export const diningAreas = pgTable('dining_area', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  branchId: fk().references(() => branches.id, { onDelete: 'set null' }),
  name: text().notNull(),
  sortOrder: integer().notNull().default(0),
});

export const diningTables = pgTable('dining_table', {
  id: id(),
  diningAreaId: fk().notNull().references(() => diningAreas.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  capacity: integer().notNull().default(4),
  posX: integer().notNull().default(0),
  posY: integer().notNull().default(0),
  shape: text().notNull().default('square'),
  status: tableStatusEnum().notNull().default('LIBRE'),
  active: boolean().notNull().default(true),
});

export const cashSessions = pgTable('cash_session', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  branchId: fk().references(() => branches.id, { onDelete: 'set null' }),
  folio: text().notNull(),
  cashierId: fk().notNull().references(() => users.id, { onDelete: 'restrict' }),
  openingCents: integer().notNull(),
  countedCents: integer(),
  expectedCents: integer(),
  differenceCents: integer(),
  notes: text(),
  openedAt: createdAt(),
  closedAt: ts(),
}, (t) => [uniqueIndex().on(t.businessId, t.folio)]);

/** serviceType: "MESA" | "PARA_LLEVAR" | "MOSTRADOR" */
export const tickets = pgTable('pos_ticket', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  folio: text().notNull(),
  tableId: fk().references(() => diningTables.id, { onDelete: 'set null' }),
  serviceType: text().notNull().default('MESA'),
  label: text(),
  waiterId: fk().references(() => users.id, { onDelete: 'set null' }),
  guests: integer().notNull().default(1),
  status: ticketStatusEnum().notNull().default('ABIERTA'),
  subtotalCents: integer().notNull().default(0),
  discountCents: integer().notNull().default(0),
  discountReason: text(),
  tipCents: integer().notNull().default(0),
  totalCents: integer().notNull().default(0),
  paidCents: integer().notNull().default(0),
  customerId: text(),
  notes: text(),
  cancelReason: text(),
  parentId: text(),
  cashSessionId: fk().references(() => cashSessions.id, { onDelete: 'set null' }),
  openedAt: createdAt(),
  closedAt: ts(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex().on(t.businessId, t.folio), index().on(t.businessId, t.status)]);

export const ticketItems = pgTable('pos_ticket_item', {
  id: id(),
  ticketId: fk().notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  productId: fk().notNull().references(() => products.id, { onDelete: 'restrict' }),
  productName: text().notNull(),
  productionAreaId: text(),
  unitPriceCents: integer().notNull(),
  quantity: integer().notNull(),
  modifiers: jsonb().$type<OrderItemModifier[]>().notNull().default([]),
  note: text(),
  discountCents: integer().notNull().default(0),
  isCourtesy: boolean().notNull().default(false),
  totalCents: integer().notNull(),
  sentAt: ts(),
  kdsDoneAt: ts(),
  cancelledAt: ts(),
  cancelReason: text(),
  createdAt: createdAt(),
}, (t) => [index().on(t.ticketId)]);

export const payments = pgTable('pos_payment', {
  id: id(),
  ticketId: fk().notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  cashSessionId: fk().references(() => cashSessions.id, { onDelete: 'set null' }),
  method: paymentMethodEnum().notNull(),
  amountCents: integer().notNull(),
  tipCents: integer().notNull().default(0),
  receivedCents: integer(),
  changeCents: integer(),
  reference: text(),
  createdById: text(),
  createdAt: createdAt(),
}, (t) => [index().on(t.ticketId)]);

/** source: "MANUAL" | "DRIVER_SETTLEMENT" | "DELIVERY_CASH" */
export const cashMovements = pgTable('cash_movement', {
  id: id(),
  cashSessionId: fk().notNull().references(() => cashSessions.id, { onDelete: 'cascade' }),
  type: cashMovementTypeEnum().notNull(),
  amountCents: integer().notNull(),
  reason: text().notNull(),
  source: text().notNull().default('MANUAL'),
  refId: text(),
  createdById: text(),
  createdAt: createdAt(),
});
