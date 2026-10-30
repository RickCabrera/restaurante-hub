import {
  boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { areas, branches, businesses, createdAt, fk, id, ts, updatedAt, users } from './core';
import {
  discountTypeEnum, orderChannelEnum, orderStatusEnum, orderTypeEnum, paymentMethodEnum,
  waDirectionEnum, zoneKindEnum,
} from './enums';

export const menuCategories = pgTable('menu_category', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  description: text(),
  imageUrl: text(),
  sortOrder: integer().notNull().default(0),
  active: boolean().notNull().default(true),
}, (t) => [index().on(t.businessId)]);

export const products = pgTable('product', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  categoryId: fk().notNull().references(() => menuCategories.id, { onDelete: 'restrict' }),
  /** Área de producción: a qué impresora/KDS va la comanda */
  productionAreaId: fk().references(() => areas.id, { onDelete: 'set null' }),
  name: text().notNull(),
  description: text(),
  imageUrl: text(),
  priceCents: integer().notNull(),
  available: boolean().notNull().default(true),
  showInWeb: boolean().notNull().default(true),
  showInWhatsapp: boolean().notNull().default(true),
  showInQr: boolean().notNull().default(true),
  showInPos: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index().on(t.businessId, t.categoryId)]);

export const productBranches = pgTable('product_branch', {
  productId: fk().notNull().references(() => products.id, { onDelete: 'cascade' }),
  branchId: fk().notNull().references(() => branches.id, { onDelete: 'cascade' }),
  priceCents: integer(),
  available: boolean(),
}, (t) => [primaryKey({ columns: [t.productId, t.branchId] })]);

export const modifierGroups = pgTable('modifier_group', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  minSelect: integer().notNull().default(0),
  maxSelect: integer().notNull().default(1),
  sortOrder: integer().notNull().default(0),
});

export const modifiers = pgTable('modifier', {
  id: id(),
  groupId: fk().notNull().references(() => modifierGroups.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  priceCents: integer().notNull().default(0),
  available: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
});

export const productModifierGroups = pgTable('product_modifier_group', {
  productId: fk().notNull().references(() => products.id, { onDelete: 'cascade' }),
  groupId: fk().notNull().references(() => modifierGroups.id, { onDelete: 'cascade' }),
  sortOrder: integer().notNull().default(0),
}, (t) => [primaryKey({ columns: [t.productId, t.groupId] })]);

export const customers = pgTable('customer', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  phone: text().notNull(),
  name: text(),
  notes: text(),
  tags: jsonb().$type<string[]>().notNull().default([]),
  acceptedPrivacyAt: ts(),
  ordersCount: integer().notNull().default(0),
  totalSpentCents: integer().notNull().default(0),
  lastOrderAt: ts(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex().on(t.businessId, t.phone)]);

export const addresses = pgTable('address', {
  id: id(),
  customerId: fk().notNull().references(() => customers.id, { onDelete: 'cascade' }),
  label: text(),
  text: text().notNull(),
  references: text(),
  neighborhood: text(),
  postalCode: text(),
  lat: doublePrecision(),
  lng: doublePrecision(),
  validated: boolean().notNull().default(false),
  lastUsedAt: ts(),
  createdAt: createdAt(),
}, (t) => [index().on(t.customerId)]);

/** GeoJSON Polygon: coordinates [[[lng,lat],...]] */
export interface GeoPolygon { type: 'Polygon'; coordinates: number[][][] }

export const deliveryZones = pgTable('delivery_zone', {
  id: id(),
  branchId: fk().notNull().references(() => branches.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  kind: zoneKindEnum().notNull().default('RADIUS'),
  polygon: jsonb().$type<GeoPolygon>(),
  radiusKm: doublePrecision(),
  color: text().notNull().default('#E76F51'),
  feeCents: integer().notNull().default(0),
  minOrderCents: integer().notNull().default(0),
  freeFromCents: integer(),
  etaMinutes: integer().notNull().default(40),
  priority: integer().notNull().default(0),
  active: boolean().notNull().default(true),
});

export const orders = pgTable('delivery_order', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  branchId: fk().notNull().references(() => branches.id, { onDelete: 'restrict' }),
  folio: text().notNull(),
  publicToken: text().notNull().unique(),
  channel: orderChannelEnum().notNull(),
  type: orderTypeEnum().notNull(),
  status: orderStatusEnum().notNull().default('NUEVO'),
  customerId: fk().notNull().references(() => customers.id, { onDelete: 'restrict' }),
  customerName: text().notNull(),
  customerPhone: text().notNull(),
  addressText: text(),
  addressRefs: text(),
  lat: doublePrecision(),
  lng: doublePrecision(),
  zoneId: text(),
  subtotalCents: integer().notNull(),
  discountCents: integer().notNull().default(0),
  deliveryFeeCents: integer().notNull().default(0),
  totalCents: integer().notNull(),
  couponCode: text(),
  promotionIds: jsonb().$type<string[]>().notNull().default([]),
  paymentMethod: paymentMethodEnum().notNull(),
  cashGivenCents: integer(),
  paid: boolean().notNull().default(false),
  notes: text(),
  estimatedMinutes: integer(),
  rejectReason: text(),
  cancelReason: text(),
  driverId: fk().references(() => users.id, { onDelete: 'set null' }),
  driverSettledAt: ts(),
  cashSessionId: text(),
  acceptedAt: ts(),
  preparingAt: ts(),
  readyAt: ts(),
  dispatchedAt: ts(),
  deliveredAt: ts(),
  cancelledAt: ts(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex().on(t.businessId, t.folio),
  index().on(t.businessId, t.status),
  index().on(t.businessId, t.createdAt),
]);

export interface OrderItemModifier {
  modifierId: string;
  name: string;
  groupName: string;
  priceCents: number;
  quantity: number;
}

export const orderItems = pgTable('order_item', {
  id: id(),
  orderId: fk().notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: fk().notNull().references(() => products.id, { onDelete: 'restrict' }),
  productName: text().notNull(),
  productionAreaId: text(),
  unitPriceCents: integer().notNull(),
  quantity: integer().notNull(),
  totalCents: integer().notNull(),
  note: text(),
  modifiers: jsonb().$type<OrderItemModifier[]>().notNull().default([]),
  kdsDoneAt: ts(),
}, (t) => [index().on(t.orderId)]);

export const coupons = pgTable('coupon', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  code: text().notNull(),
  description: text(),
  discountType: discountTypeEnum().notNull(),
  value: integer().notNull(), // % o centavos
  maxDiscountCents: integer(),
  minOrderCents: integer().notNull().default(0),
  freeDelivery: boolean().notNull().default(false),
  startsAt: ts(),
  endsAt: ts(),
  maxUses: integer(),
  maxUsesPerCustomer: integer().default(1),
  usesCount: integer().notNull().default(0),
  channels: jsonb().$type<string[]>().notNull().default([]),
  customerId: text(), // cupón personal (fidelización)
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex().on(t.businessId, t.code)]);

export const couponUses = pgTable('coupon_use', {
  id: id(),
  couponId: fk().notNull().references(() => coupons.id, { onDelete: 'cascade' }),
  customerId: fk().notNull().references(() => customers.id, { onDelete: 'cascade' }),
  orderId: fk().notNull().unique().references(() => orders.id, { onDelete: 'cascade' }),
  discountCents: integer().notNull(),
  createdAt: createdAt(),
});

/** kind: "PERCENT_OFF" | "AMOUNT_OFF" | "BUY_X_GET_Y" | "FREE_DELIVERY" */
export const promotions = pgTable('promotion', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  kind: text().notNull(),
  value: integer().notNull().default(0),
  buyQty: integer(),
  getQty: integer(),
  minOrderCents: integer().notNull().default(0),
  productIds: jsonb().$type<string[]>().notNull().default([]),
  categoryIds: jsonb().$type<string[]>().notNull().default([]),
  weekdays: jsonb().$type<number[]>().notNull().default([]),
  timeFrom: text(),
  timeTo: text(),
  channels: jsonb().$type<string[]>().notNull().default([]),
  startsAt: ts(),
  endsAt: ts(),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
});

// ---------------- WhatsApp ----------------

export const waConversations = pgTable('wa_conversation', {
  id: id(),
  businessId: fk().notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  phone: text().notNull(),
  customerId: fk().unique().references(() => customers.id, { onDelete: 'set null' }),
  profileName: text(),
  /** Estado del bot (ver whatsapp/bot) o "HUMAN" */
  state: text().notNull().default('IDLE'),
  context: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  humanMode: boolean().notNull().default(false),
  humanSince: ts(),
  unreadCount: integer().notNull().default(0),
  lastInboundAt: ts(),
  lastMessageAt: ts(),
  sessionExpiresAt: ts(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex().on(t.businessId, t.phone)]);

export const waMessages = pgTable('wa_message', {
  id: id(),
  conversationId: fk().notNull().references(() => waConversations.id, { onDelete: 'cascade' }),
  direction: waDirectionEnum().notNull(),
  waMessageId: text().unique(),
  /** text | interactive | location | image | template | button | list_reply | system */
  kind: text().notNull(),
  body: text(),
  payload: jsonb(),
  status: text(), // sent | delivered | read | failed | simulated
  sentByUserId: text(),
  error: text(),
  createdAt: createdAt(),
}, (t) => [index().on(t.conversationId, t.createdAt)]);
