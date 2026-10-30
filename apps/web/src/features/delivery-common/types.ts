/**
 * delivery-common/types — Tipos del contrato de API de Delivery (docs/api/delivery.md).
 * API estable (solo se agregan campos opcionales). Uso de solo lectura para otros módulos.
 *
 * Exporta: OrderView, OrderItemView, MenuCategory, MenuProduct, MenuModifierGroup, MenuModifier,
 * Branch, StoreStatus, Hours, Zone, GeoPolygon, Driver, DriverSummary, SettleResult, Quote, QuoteError,
 * CartLine, Customer, CustomerDetail, Address, Coupon, Promotion, SalesReport, Area, Coverage, GeoSuggestion, GeoResult.
 */
import type { OrderChannel, OrderStatus, OrderType, PaymentMethod } from '@rh/shared';

export type { OrderChannel, OrderStatus, OrderType, PaymentMethod };

export interface OrderItemModifierView { name: string; groupName: string; priceCents: number; quantity: number; modifierId?: string }
export interface OrderItemView {
  id: string;
  productId: string;
  productName: string;
  productionAreaId: string | null;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
  note: string | null;
  modifiers: OrderItemModifierView[];
  kdsDoneAt: string | null;
}

export interface OrderView {
  id: string;
  branchId: string;
  folio: string;
  publicToken: string;
  channel: OrderChannel;
  type: OrderType;
  status: OrderStatus;
  customerId: string;
  customerName: string;
  customerPhone: string;
  addressText: string | null;
  addressRefs: string | null;
  lat: number | null;
  lng: number | null;
  zoneId: string | null;
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  couponCode: string | null;
  paymentMethod: PaymentMethod;
  cashGivenCents: number | null;
  paid: boolean;
  notes: string | null;
  estimatedMinutes: number | null;
  rejectReason: string | null;
  cancelReason: string | null;
  driverId: string | null;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt?: string;
  items: OrderItemView[];
  driver: { id: string; name: string; phone: string | null } | null;
  branchName: string | null;
  statusLabel: string;
  channelLabel: string;
  typeLabel: string;
  paymentLabel: string;
  changeCents: number | null;
  mapsUrl: string | null;
  trackingUrl: string;
  customerOrdersCount: number | null;
}

export interface MenuModifier { id: string; name: string; priceCents: number; available: boolean; sortOrder: number; groupId?: string }
export interface MenuModifierGroup { id: string; name: string; minSelect: number; maxSelect: number; sortOrder: number; modifiers: MenuModifier[] }
export interface MenuProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  available: boolean;
  productionAreaId: string | null;
  sortOrder: number;
  modifierGroups: MenuModifierGroup[];
}
export interface MenuCategory { id: string; name: string; description: string | null; imageUrl: string | null; sortOrder: number; products: MenuProduct[] }

/** Fila de producto de administración (`GET /menu/products`). */
export interface ProductRow {
  id: string;
  categoryId: string;
  productionAreaId: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  available: boolean;
  showInWeb: boolean;
  showInWhatsapp: boolean;
  showInQr: boolean;
  showInPos: boolean;
  sortOrder: number;
  active: boolean;
  modifierGroupIds: string[];
  branchOverrides: { branchId: string; priceCents: number | null; available: boolean | null }[];
}
export interface CategoryRow { id: string; name: string; description: string | null; imageUrl: string | null; sortOrder: number; active: boolean }

export type HoursRange = { open: string; close: string };
export type Hours = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', HoursRange[]>>;
export interface StoreStatus {
  open: boolean;
  reason: 'OPEN' | 'PAUSED' | 'CLOSED_DATE' | 'OUTSIDE_HOURS' | 'INACTIVE';
  message: string;
  pausedUntil: string | null;
  pauseReason: string | null;
  nextOpeningAt: string | null;
  nextOpeningText: string | null;
  hoursText: string;
}
export interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  hours: Hours;
  closedDates: string[];
  pausedUntil: string | null;
  pauseReason: string | null;
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  prepMinutes: number;
  active: boolean;
  status: StoreStatus;
}

export interface GeoPolygon { type: 'Polygon'; coordinates: number[][][] }
export interface Zone {
  id: string;
  branchId: string;
  name: string;
  kind: 'RADIUS' | 'POLYGON';
  polygon: GeoPolygon | null;
  radiusKm: number | null;
  color: string;
  feeCents: number;
  minOrderCents: number;
  freeFromCents: number | null;
  etaMinutes: number;
  priority: number;
  active: boolean;
  branchName?: string | null;
}
export interface Coverage {
  zone: { id: string; name: string; color?: string; priority: number };
  branch: { id: string; name: string };
  branchId: string;
  feeCents: number;
  minOrderCents: number;
  freeFromCents: number | null;
  etaMinutes: number;
  distanceKm: number | null;
}

export interface Driver { id: string; name: string; phone: string | null; active: boolean; avatarColor: string | null; activeOrders: number; onTheWay: number; unsettledCashCents: number }
export interface DriverOrderLite { id: string; folio: string; totalCents: number; deliveryFeeCents?: number; deliveredAt?: string | null; paymentMethod?: PaymentMethod; customerName?: string }
export interface DriverSummary {
  date: string;
  deliveredCount: number;
  deliveredTotalCents: number;
  deliveryFeesCents: number;
  byMethod: { method: PaymentMethod; count: number; totalCents: number }[];
  cashToSettleCents: number;
  unsettledOrders: DriverOrderLite[];
  deliveries: DriverOrderLite[];
}
export interface SettleResult { driverId: string; driverName: string; ordersCount: number; totalCents: number; orders: DriverOrderLite[]; settledAt: string; cashSessionId: string | null; cashMovementId: string | null }

export interface CartModifier { modifierId: string; quantity: number }
/** Línea de carrito que acepta POST /orders/quote y POST /orders. */
export interface CartLine { productId: string; quantity: number; modifiers: CartModifier[]; note?: string }

export interface QuoteError { code: string; message: string; lineIndex?: number }
export interface Quote {
  lines: { productId: string; name: string; quantity: number; unitPriceCents: number; modifiers: { name: string; priceCents: number }[]; totalCents: number; note: string | null }[];
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  appliedPromotions: { id: string; name: string; discountCents: number }[];
  coupon: { code: string; discountCents: number; freeDelivery: boolean } | null;
  zone: { id: string; name: string; etaMinutes: number } | null;
  branchId: string | null;
  estimatedMinutes: number | null;
  warnings: string[];
  errors: QuoteError[];
  canOrder: boolean;
}

export interface Address { id: string; label: string | null; text: string; references: string | null; lat: number | null; lng: number | null; neighborhood?: string | null; postalCode?: string | null; lastUsedAt?: string | null }
export interface Customer {
  id: string;
  phone: string;
  name: string | null;
  notes: string | null;
  tags: string[];
  ordersCount: number;
  totalSpentCents: number;
  lastOrderAt: string | null;
  createdAt: string;
}
export interface CustomerDetail extends Customer {
  addresses: Address[];
  recentOrders: { id: string; folio: string; status: OrderStatus; channel: OrderChannel; type: OrderType; totalCents: number; createdAt: string; paymentMethod: PaymentMethod }[];
  stats: { ordersCount: number; deliveredCount: number; cancelledCount: number; totalSpentCents: number; avgTicketCents: number; firstOrderAt: string | null; lastOrderAt: string | null };
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENT' | 'AMOUNT';
  value: number;
  maxDiscountCents: number | null;
  minOrderCents: number;
  freeDelivery: boolean;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  usesCount: number;
  channels: OrderChannel[];
  active: boolean;
}
export type PromotionKind = 'PERCENT_OFF' | 'AMOUNT_OFF' | 'BUY_X_GET_Y' | 'FREE_DELIVERY';
export interface Promotion {
  id: string;
  name: string;
  kind: PromotionKind;
  value: number;
  buyQty: number | null;
  getQty: number | null;
  minOrderCents: number;
  productIds: string[];
  categoryIds: string[];
  weekdays: number[];
  timeFrom: string | null;
  timeTo: string | null;
  channels: OrderChannel[];
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
}

export interface Area { id: string; name: string; color: string; isProduction: boolean; active: boolean; branchId?: string | null }

export interface GeoSuggestion { description: string; placeId?: string | null; lat?: number | null; lng?: number | null }
export interface GeoResult { lat: number; lng: number; formatted: string; neighborhood?: string | null; postalCode?: string | null; city?: string | null }

export interface SalesReport {
  from: string;
  to: string;
  timezone: string;
  totals: { salesCents: number; ordersCount: number; avgTicketCents: number; discountCents: number; deliveryFeesCents: number; cancelledCount: number; rejectedCount: number };
  byDay: { date: string; ordersCount: number; salesCents: number }[];
  byChannel: { channel: string; label: string; ordersCount: number; salesCents: number }[];
  byType: { type: string; label: string; ordersCount: number; salesCents: number }[];
  byPaymentMethod: { method: string; ordersCount: number; salesCents: number }[];
  topProducts: { productId: string; name: string; quantity: number; salesCents: number }[];
  byZone: { zoneId: string | null; name: string; ordersCount: number; salesCents: number }[];
  customers: { newCount: number; returningCount: number };
  times: { avgPrepMinutes: number | null; avgDeliveryMinutes: number | null; avgTotalMinutes: number | null };
}
