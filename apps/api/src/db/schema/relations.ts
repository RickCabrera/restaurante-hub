import { relations } from 'drizzle-orm';
import {
  areas, branches, businesses, devices, notifications, pushSubscriptions, refreshTokens, userAreas, users,
} from './core';
import {
  conversations, messages, requisitionItems, requisitions, requisitionTemplates, suppliers,
  supplies, supplyAreas, supplyCategories,
} from './requisitions';
import {
  addresses, couponUses, coupons, customers, deliveryZones, menuCategories, modifierGroups, modifiers,
  orderItems, orders, productBranches, productModifierGroups, products, waConversations, waMessages,
} from './delivery';
import {
  cashMovements, cashSessions, diningAreas, diningTables, payments, printAgents, printers, printJobs,
  ticketItems, tickets,
} from './printing-pos';

export const businessRelations = relations(businesses, ({ many }) => ({
  branches: many(branches),
  areas: many(areas),
  users: many(users),
}));

export const branchRelations = relations(branches, ({ one, many }) => ({
  business: one(businesses, { fields: [branches.businessId], references: [businesses.id] }),
  zones: many(deliveryZones),
  areas: many(areas),
}));

export const areaRelations = relations(areas, ({ one, many }) => ({
  business: one(businesses, { fields: [areas.businessId], references: [businesses.id] }),
  branch: one(branches, { fields: [areas.branchId], references: [branches.id] }),
  users: many(userAreas),
  devices: many(devices),
  supplyAreas: many(supplyAreas),
  printers: many(printers),
}));

export const userRelations = relations(users, ({ one, many }) => ({
  business: one(businesses, { fields: [users.businessId], references: [businesses.id] }),
  areas: many(userAreas),
  refreshTokens: many(refreshTokens),
  pushSubscriptions: many(pushSubscriptions),
  notifications: many(notifications),
}));

export const userAreaRelations = relations(userAreas, ({ one }) => ({
  user: one(users, { fields: [userAreas.userId], references: [users.id] }),
  area: one(areas, { fields: [userAreas.areaId], references: [areas.id] }),
}));

export const refreshTokenRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));
export const pushSubscriptionRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}));
export const notificationRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const deviceRelations = relations(devices, ({ one }) => ({
  area: one(areas, { fields: [devices.areaId], references: [areas.id] }),
  business: one(businesses, { fields: [devices.businessId], references: [businesses.id] }),
}));

// ---- Requisiciones ----
export const supplyCategoryRelations = relations(supplyCategories, ({ many }) => ({
  supplies: many(supplies),
}));
export const supplierRelations = relations(suppliers, ({ many }) => ({ supplies: many(supplies) }));
export const supplyRelations = relations(supplies, ({ one, many }) => ({
  category: one(supplyCategories, { fields: [supplies.categoryId], references: [supplyCategories.id] }),
  supplier: one(suppliers, { fields: [supplies.supplierId], references: [suppliers.id] }),
  areas: many(supplyAreas),
}));
export const supplyAreaRelations = relations(supplyAreas, ({ one }) => ({
  supply: one(supplies, { fields: [supplyAreas.supplyId], references: [supplies.id] }),
  area: one(areas, { fields: [supplyAreas.areaId], references: [areas.id] }),
}));
export const requisitionRelations = relations(requisitions, ({ one, many }) => ({
  area: one(areas, { fields: [requisitions.areaId], references: [areas.id] }),
  device: one(devices, { fields: [requisitions.deviceId], references: [devices.id] }),
  createdBy: one(users, { fields: [requisitions.createdById], references: [users.id] }),
  items: many(requisitionItems),
  conversation: one(conversations, { fields: [requisitions.id], references: [conversations.requisitionId] }),
}));
export const requisitionItemRelations = relations(requisitionItems, ({ one }) => ({
  requisition: one(requisitions, { fields: [requisitionItems.requisitionId], references: [requisitions.id] }),
  supply: one(supplies, { fields: [requisitionItems.supplyId], references: [supplies.id] }),
}));
export const requisitionTemplateRelations = relations(requisitionTemplates, ({ one }) => ({
  area: one(areas, { fields: [requisitionTemplates.areaId], references: [areas.id] }),
}));
export const conversationRelations = relations(conversations, ({ one, many }) => ({
  area: one(areas, { fields: [conversations.areaId], references: [areas.id] }),
  requisition: one(requisitions, { fields: [conversations.requisitionId], references: [requisitions.id] }),
  messages: many(messages),
}));
export const messageRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));

// ---- Delivery ----
export const menuCategoryRelations = relations(menuCategories, ({ many }) => ({ products: many(products) }));
export const productRelations = relations(products, ({ one, many }) => ({
  category: one(menuCategories, { fields: [products.categoryId], references: [menuCategories.id] }),
  productionArea: one(areas, { fields: [products.productionAreaId], references: [areas.id] }),
  modifierGroups: many(productModifierGroups),
  branchOverrides: many(productBranches),
}));
export const productBranchRelations = relations(productBranches, ({ one }) => ({
  product: one(products, { fields: [productBranches.productId], references: [products.id] }),
  branch: one(branches, { fields: [productBranches.branchId], references: [branches.id] }),
}));
export const modifierGroupRelations = relations(modifierGroups, ({ many }) => ({
  modifiers: many(modifiers),
  products: many(productModifierGroups),
}));
export const modifierRelations = relations(modifiers, ({ one }) => ({
  group: one(modifierGroups, { fields: [modifiers.groupId], references: [modifierGroups.id] }),
}));
export const productModifierGroupRelations = relations(productModifierGroups, ({ one }) => ({
  product: one(products, { fields: [productModifierGroups.productId], references: [products.id] }),
  group: one(modifierGroups, { fields: [productModifierGroups.groupId], references: [modifierGroups.id] }),
}));
export const customerRelations = relations(customers, ({ many, one }) => ({
  addresses: many(addresses),
  orders: many(orders),
  waConversation: one(waConversations, { fields: [customers.id], references: [waConversations.customerId] }),
}));
export const addressRelations = relations(addresses, ({ one }) => ({
  customer: one(customers, { fields: [addresses.customerId], references: [customers.id] }),
}));
export const deliveryZoneRelations = relations(deliveryZones, ({ one }) => ({
  branch: one(branches, { fields: [deliveryZones.branchId], references: [branches.id] }),
}));
export const orderRelations = relations(orders, ({ one, many }) => ({
  branch: one(branches, { fields: [orders.branchId], references: [branches.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  driver: one(users, { fields: [orders.driverId], references: [users.id] }),
  items: many(orderItems),
  printJobs: many(printJobs),
}));
export const orderItemRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));
export const couponRelations = relations(coupons, ({ many }) => ({ uses: many(couponUses) }));
export const couponUseRelations = relations(couponUses, ({ one }) => ({
  coupon: one(coupons, { fields: [couponUses.couponId], references: [coupons.id] }),
  customer: one(customers, { fields: [couponUses.customerId], references: [customers.id] }),
  order: one(orders, { fields: [couponUses.orderId], references: [orders.id] }),
}));
export const waConversationRelations = relations(waConversations, ({ one, many }) => ({
  customer: one(customers, { fields: [waConversations.customerId], references: [customers.id] }),
  messages: many(waMessages),
}));
export const waMessageRelations = relations(waMessages, ({ one }) => ({
  conversation: one(waConversations, { fields: [waMessages.conversationId], references: [waConversations.id] }),
}));

// ---- Impresión ----
export const printAgentRelations = relations(printAgents, ({ many }) => ({
  printers: many(printers),
  jobs: many(printJobs),
}));
export const printerRelations = relations(printers, ({ one, many }) => ({
  area: one(areas, { fields: [printers.areaId], references: [areas.id] }),
  agent: one(printAgents, { fields: [printers.agentId], references: [printAgents.id] }),
  jobs: many(printJobs),
}));
export const printJobRelations = relations(printJobs, ({ one }) => ({
  printer: one(printers, { fields: [printJobs.printerId], references: [printers.id] }),
  agent: one(printAgents, { fields: [printJobs.agentId], references: [printAgents.id] }),
  order: one(orders, { fields: [printJobs.orderId], references: [orders.id] }),
}));

// ---- POS ----
export const diningAreaRelations = relations(diningAreas, ({ many }) => ({ tables: many(diningTables) }));
export const diningTableRelations = relations(diningTables, ({ one, many }) => ({
  diningArea: one(diningAreas, { fields: [diningTables.diningAreaId], references: [diningAreas.id] }),
  tickets: many(tickets),
}));
export const ticketRelations = relations(tickets, ({ one, many }) => ({
  table: one(diningTables, { fields: [tickets.tableId], references: [diningTables.id] }),
  waiter: one(users, { fields: [tickets.waiterId], references: [users.id] }),
  cashSession: one(cashSessions, { fields: [tickets.cashSessionId], references: [cashSessions.id] }),
  items: many(ticketItems),
  payments: many(payments),
}));
export const ticketItemRelations = relations(ticketItems, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketItems.ticketId], references: [tickets.id] }),
  product: one(products, { fields: [ticketItems.productId], references: [products.id] }),
}));
export const paymentRelations = relations(payments, ({ one }) => ({
  ticket: one(tickets, { fields: [payments.ticketId], references: [tickets.id] }),
  cashSession: one(cashSessions, { fields: [payments.cashSessionId], references: [cashSessions.id] }),
}));
export const cashSessionRelations = relations(cashSessions, ({ one, many }) => ({
  cashier: one(users, { fields: [cashSessions.cashierId], references: [users.id] }),
  movements: many(cashMovements),
  payments: many(payments),
  tickets: many(tickets),
}));
export const cashMovementRelations = relations(cashMovements, ({ one }) => ({
  cashSession: one(cashSessions, { fields: [cashMovements.cashSessionId], references: [cashSessions.id] }),
}));
