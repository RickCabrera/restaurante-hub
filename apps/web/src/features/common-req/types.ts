import type { Priority, RequisitionStatus, Role, UnitCode } from '@rh/shared';

export interface AreaRef {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface Area extends AreaRef {
  sortOrder: number;
  isProduction: boolean;
  canRequisition: boolean;
  orderWindow: Record<string, { until: string }>;
  active: boolean;
  deviceCount?: number;
  branchId?: string | null;
}

export interface RequisitionItem {
  id: string;
  supplyId: string;
  supplyName: string;
  unit: UnitCode;
  icon: string | null;
  imageUrl: string | null;
  requestedQty: number;
  approvedQty: number | null;
  fulfilledQty: number | null;
  receivedQty: number | null;
  rejected: boolean;
  purchased: boolean;
  note: string | null;
  reviewNote: string | null;
}

export interface Requisition {
  id: string;
  folio: string;
  areaId: string;
  deviceId: string | null;
  createdById: string | null;
  createdByName: string | null;
  clientRequestId: string;
  priority: Priority;
  status: RequisitionStatus;
  note: string | null;
  neededFor: string | null;
  isLate: boolean;
  rejectReason: string | null;
  reviewNote: string | null;
  receptionNote: string | null;
  cancelReason: string | null;
  hasDifferences: boolean;
  seenAt: string | null;
  reviewedAt: string | null;
  purchasingAt: string | null;
  fulfilledAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  escalatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  area: AreaRef;
  itemCount: number;
  conversationId: string | null;
  items: RequisitionItem[];
}

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PendingStats {
  byArea: {
    area: AreaRef;
    counts: Record<string, number>;
    total: number;
    urgent: number;
    toReview: number;
    oldestToReview: string | null;
  }[];
  totals: { byStatus: Record<string, number>; total: number; urgent: number; toReview: number };
}

export interface CatalogSupply {
  id: string;
  categoryId: string;
  name: string;
  unit: UnitCode;
  step: number;
  maxPerOrder: number | null;
  icon: string | null;
  imageUrl: string | null;
  autoApprove: boolean;
  sortOrder: number;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
}

export interface TabletCatalog {
  area: AreaRef & { orderWindow: Record<string, { until: string }> };
  categories: Category[];
  supplies: CatalogSupply[];
}

export interface SupplyView extends CatalogSupply {
  supplierId: string | null;
  active: boolean;
  areaIds: string[];
  category: { id: string; name: string; icon: string } | null;
  supplier: { id: string; name: string } | null;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  deliveryDays: number[];
  notes: string | null;
  active: boolean;
  supplyCount?: number;
}

export interface TemplateItem {
  supplyId: string;
  quantity: number;
  supplyName: string;
  unit: UnitCode;
  icon: string | null;
  imageUrl: string | null;
  available: boolean;
}

export interface RequisitionTemplate {
  id: string;
  areaId: string;
  name: string;
  items: TemplateItem[];
  createdAt: string;
}

export interface LastRequisition {
  requisition: { id: string; folio: string; createdAt: string; status: RequisitionStatus } | null;
  items: TemplateItem[];
}

export type ConvType = 'AREA_OWNER' | 'GENERAL' | 'REQUISITION';
export type Side = 'MANAGER' | 'AREA' | 'SYSTEM';

export interface Conversation {
  id: string;
  type: ConvType;
  title: string;
  areaId: string | null;
  area: AreaRef | null;
  requisitionId: string | null;
  requisition: { id: string; folio: string; status: RequisitionStatus } | null;
  lastMessageAt: string | null;
  lastMessage: { id: string; body: string | null; imageUrl: string | null; authorName: string; authorSide: Side; createdAt: string } | null;
  unread: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  authorUserId: string | null;
  authorDeviceId: string | null;
  authorName: string;
  authorSide: Side;
  body: string | null;
  imageUrl: string | null;
  quickMessageId: string | null;
  isBroadcast: boolean;
  readBy: Record<string, string>;
  createdAt: string;
  conversation?: { id: string; type: ConvType; areaId: string | null; requisitionId: string | null };
}

export interface QuickMessage {
  id: string;
  text: string;
  icon: string;
  urgent: boolean;
  sortOrder: number;
  active: boolean;
}

export interface Device {
  id: string;
  name: string;
  purpose: 'AREA' | 'KDS' | 'POS';
  platform: string | null;
  areaId: string | null;
  area: AreaRef | null;
  online: boolean;
  lastSeenAt: string | null;
  appVersion: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  avatarColor: string;
  active: boolean;
  areaIds: string[];
  hasPin: boolean;
  hasPassword: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ShoppingList {
  generatedAt: string;
  businessName: string;
  totalLines: number;
  requisitionCount: number;
  groups: {
    supplierId: string | null;
    supplierName: string;
    phone: string | null;
    whatsappText: string;
    waLink: string | null;
    items: {
      supplyId: string;
      supplyName: string;
      unit: UnitCode;
      unitLabel: string;
      quantity: number;
      quantityText: string;
      itemIds: string[];
      sources: { requisitionId: string; folio: string; areaId: string; areaName: string; quantity: number }[];
    }[];
  }[];
}
