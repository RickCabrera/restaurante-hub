import type { CartLineInput, OrderType, PaymentMethod } from '@rh/shared';
import type { OutgoingWa } from '../../../whatsapp/client/whatsapp.client';
import type { MenuCategory } from '../../delivery/menu/menu.service';
import type { QuoteResult } from '../../delivery/promotions/pricing';

/** Estados del bot (WaConversation.state). */
export const BotState = {
  IDLE: 'IDLE',
  MAIN_MENU: 'MAIN_MENU',
  REPEAT_CONFIRM: 'REPEAT_CONFIRM',
  ORDER_TYPE: 'ORDER_TYPE',
  CATEGORY: 'CATEGORY',
  PRODUCT: 'PRODUCT',
  MODIFIERS: 'MODIFIERS',
  QUANTITY: 'QUANTITY',
  CART: 'CART',
  ADDRESS: 'ADDRESS',
  ADDRESS_TEXT: 'ADDRESS_TEXT',
  ADDRESS_CONFIRM: 'ADDRESS_CONFIRM',
  REFERENCES: 'REFERENCES',
  PAYMENT: 'PAYMENT',
  CASH_AMOUNT: 'CASH_AMOUNT',
  NAME: 'NAME',
  CONFIRM: 'CONFIRM',
  EDIT: 'EDIT',
  HUMAN: 'HUMAN',
} as const;
export type BotState = (typeof BotState)[keyof typeof BotState];

/** Mensaje entrante normalizado (independiente de Meta). */
export type Inbound =
  | { kind: 'text'; text: string }
  | { kind: 'button'; id: string; title?: string }
  | { kind: 'list'; id: string; title?: string }
  | { kind: 'location'; lat: number; lng: number; address?: string | null; name?: string | null }
  | { kind: 'image'; caption?: string | null }
  | { kind: 'other'; description?: string };

export interface CartMod { modifierId: string; name: string; priceCents: number }
export interface CartItem {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  modifiers: CartMod[];
  note?: string | null;
}

export interface BotAddress {
  id?: string | null;
  text: string;
  lat?: number | null;
  lng?: number | null;
  references?: string | null;
  /** texto devuelto por el geocodificador (para confirmar) */
  formatted?: string | null;
}

export interface BotContext {
  orderType?: OrderType;
  cart?: CartItem[];
  categoryId?: string;
  page?: number;
  pending?: { productId: string; groupIndex: number; selected: string[]; modifiers: CartMod[] };
  address?: BotAddress | null;
  candidate?: BotAddress | null;
  coverage?: { zoneName: string; feeCents: number; etaMinutes: number; minOrderCents: number; freeFromCents: number | null } | null;
  paymentMethod?: PaymentMethod;
  cashGivenCents?: number | null;
  name?: string | null;
  couponCode?: string | null;
  /** token de sesión para "Pedir en la web" */
  sessionToken?: string;
  /** opciones del último mensaje interactivo (para respuestas con número o texto) */
  lastOptions?: { id: string; title: string }[];
  /** se llegó a CONFIRM: tras editar se regresa ahí */
  reviewing?: boolean;
}

export interface SavedAddress { id: string; label: string | null; text: string; references: string | null; lat: number | null; lng: number | null }

export interface LastOrderSummary {
  folio: string;
  type: OrderType;
  lines: CartLineInput[];
  /** líneas aún disponibles (con nombre/precio actual) */
  items: CartItem[];
  /** productos que ya no están disponibles */
  missing: string[];
  address: SavedAddress | null;
}

export interface CoverageInfo { zoneName: string; feeCents: number; minOrderCents: number; freeFromCents: number | null; etaMinutes: number }

export interface BotQuoteInput {
  type: OrderType;
  lines: CartLineInput[];
  address?: { id?: string; text: string; references?: string; lat?: number; lng?: number };
  couponCode?: string;
}

export interface BotCreateInput extends BotQuoteInput {
  name: string;
  paymentMethod: PaymentMethod;
  cashGivenCents?: number;
  acceptPrivacy?: boolean;
}

export interface BotCreatedOrder { id: string; folio: string; publicToken: string; estimatedMinutes: number | null; totalCents: number }

/** Dependencias del motor (en producción las provee BotRuntime; en pruebas, fakes). */
export interface BotDeps {
  now: Date;
  appUrl: string;
  phone: string;
  business: { name: string };
  texts: { greeting: string; closedMessage: string; handoffMessage: string; goodbye: string };
  transferInfo: string | null;
  privacyNoticeUrl: string | null;
  store(): Promise<{ open: boolean; message: string; hoursText: string; nextOpeningText: string | null }>;
  menu(): Promise<MenuCategory[]>;
  customer(): Promise<{ id: string | null; name: string | null; addresses: SavedAddress[] }>;
  lastOrder(): Promise<LastOrderSummary | null>;
  geocode(text: string): Promise<{ lat: number; lng: number; formatted: string } | null>;
  reverse(lat: number, lng: number): Promise<{ formatted: string } | null>;
  coverage(lat: number, lng: number): Promise<CoverageInfo | null>;
  quote(input: BotQuoteInput): Promise<QuoteResult>;
  createOrder(input: BotCreateInput): Promise<BotCreatedOrder>;
  newSessionToken(): string;
}

export interface BotEffects {
  handoff?: boolean;
  orderCreated?: BotCreatedOrder;
  cancelled?: boolean;
}

export interface BotResult {
  state: BotState;
  context: BotContext;
  replies: OutgoingWa[];
  effects: BotEffects;
}
