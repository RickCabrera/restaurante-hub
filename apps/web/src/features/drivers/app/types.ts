import type { OrderStatus, OrderType, PaymentMethod } from '@rh/shared';

/** OrderView (docs/api/delivery.md) — solo lo que usa la app del repartidor */
export interface DriverOrder {
  id: string;
  folio: string;
  publicToken: string;
  type: OrderType;
  status: OrderStatus;
  statusLabel: string;
  customerName: string | null;
  customerPhone: string | null;
  addressText: string | null;
  addressRefs: string | null;
  lat: number | null;
  lng: number | null;
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentLabel: string;
  cashGivenCents: number | null;
  changeCents: number | null;
  paid: boolean;
  notes: string | null;
  estimatedMinutes: number | null;
  driverId: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  branchName?: string | null;
  mapsUrl?: string | null;
  items: { id: string; productName: string; quantity: number; totalCents: number; note: string | null; modifiers: { name: string; groupName: string }[] }[];
}

export interface DriverSummary {
  date: string;
  deliveredCount: number;
  deliveredTotalCents: number;
  deliveryFeesCents: number;
  byMethod: { method: PaymentMethod; count: number; totalCents: number }[];
  cashToSettleCents: number;
  unsettledOrders: { id: string; folio: string; totalCents: number; deliveryFeeCents: number; deliveredAt: string }[];
  deliveries: { id: string; folio: string; totalCents: number; deliveryFeeCents: number; paymentMethod: PaymentMethod; deliveredAt: string; customerName: string | null }[];
}
