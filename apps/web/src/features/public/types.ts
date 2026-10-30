// Tipos del contrato público (docs/api/delivery.md → Públicos)
import type { OrderStatus, OrderType, PaymentMethod } from '@rh/shared';

export interface PubModifier { id: string; name: string; priceCents: number; available: boolean; sortOrder: number }
export interface PubModifierGroup { id: string; name: string; minSelect: number; maxSelect: number; sortOrder: number; modifiers: PubModifier[] }
export interface PubProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  available: boolean;
  sortOrder: number;
  modifierGroups: PubModifierGroup[];
}
export interface PubCategory { id: string; name: string; description: string | null; imageUrl: string | null; sortOrder: number; products: PubProduct[] }

export interface PubBranch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  prepMinutes: number;
  isOpen: boolean;
  statusMessage: string;
  nextOpeningText: string | null;
  nextOpeningAt?: string | null;
  hoursText: string;
  hours?: Record<string, { open: string; close: string }[]>;
}

export interface PubBusiness {
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  phone: string | null;
  address: string | null;
  currency: string;
  timezone: string;
  paymentMethods: PaymentMethod[];
  transferInfo: string | null;
  privacyNoticeUrl: string | null;
}

export interface PublicMenu {
  business: PubBusiness;
  branches: PubBranch[];
  branchId: string | null;
  channel: string;
  categories: PubCategory[];
}

export interface QuoteError { code: string; message: string; lineIndex?: number }
export interface Quote {
  lines: { productId: string; name: string; quantity: number; unitPriceCents: number; modifiers: unknown[]; totalCents: number; note: string | null }[];
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

export type Coverage =
  | { covered: true; zone: { id: string; name: string }; branchId: string; branchName: string; feeCents: number; minOrderCents: number; freeFromCents: number | null; etaMinutes: number }
  | { covered: false; message: string };

export interface GeoSuggestion { description: string; placeId: string; lat?: number; lng?: number }
export interface GeoResult { lat: number; lng: number; formatted: string }

export interface TrackingStep { status: OrderStatus; label: string; at: string | null; done: boolean; current: boolean }
export interface TrackingView {
  folio: string;
  publicToken: string;
  status: OrderStatus;
  statusLabel: string;
  type: OrderType;
  typeLabel: string;
  channel: string;
  createdAt: string;
  estimatedMinutes: number | null;
  etaAt: string | null;
  timeline: TrackingStep[];
  items: { name: string; quantity: number; modifiers: string[]; note: string | null; totalCents: number }[];
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentLabel: string;
  paid: boolean;
  driverName: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  business: { name: string; phone: string | null; logoUrl: string | null; primaryColor: string; accentColor: string; slug: string };
  branch: { name: string; address: string | null; phone: string | null } | null;
  active: boolean;
}

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  basePriceCents: number;
  modifiers: { modifierId: string; name: string; priceCents: number; groupName: string }[];
  quantity: number;
  note?: string;
}

export interface SavedAddress { text: string; references?: string; lat?: number; lng?: number }
