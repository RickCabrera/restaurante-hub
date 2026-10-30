export type OutgoingWa =
  | { kind: 'text'; body: string; previewUrl?: boolean }
  | { kind: 'buttons'; body: string; header?: string; footer?: string; buttons: { id: string; title: string }[] }
  | { kind: 'list'; body: string; header?: string; footer?: string; buttonText: string; sections: { title: string; rows: { id: string; title: string; description?: string }[] }[] }
  | { kind: 'location_request'; body: string }
  | { kind: 'image'; url: string; caption?: string }
  | { kind: 'cta_url'; body: string; buttonText: string; url: string }
  | { kind: 'template'; name: string; language?: string; params: string[] };

export interface WaConversation {
  id: string;
  phone: string;
  profileName: string | null;
  customerId: string | null;
  customer: { id: string; name: string | null; ordersCount: number; lastOrderAt: string | null } | null;
  displayName: string;
  state: string;
  humanMode: boolean;
  humanSince: string | null;
  unreadCount: number;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  windowOpen: boolean;
  windowExpiresAt: string | null;
  lastMessage: { body: string | null; direction: 'IN' | 'OUT'; kind: string; createdAt: string } | null;
  createdAt: string;
}

export interface WaMessage {
  id: string;
  conversationId: string;
  direction: 'IN' | 'OUT';
  kind: string;
  body: string | null;
  payload: unknown;
  status: string | null;
  sentByUserId: string | null;
  error: string | null;
  createdAt: string;
}

export interface WaStatus {
  mode: 'simulador' | 'conectado';
  phoneNumberId: string | null;
  verifyTokenConfigured: boolean;
  appSecretConfigured: boolean;
  webhookUrl: string;
  templateLanguage: string;
}

export const STATE_LABEL: Record<string, string> = {
  IDLE: 'Inicio',
  MAIN_MENU: 'Menú principal',
  REPEAT_CONFIRM: 'Repetir pedido',
  ORDER_TYPE: 'Tipo de pedido',
  CATEGORY: 'Eligiendo categoría',
  PRODUCT: 'Eligiendo producto',
  MODIFIERS: 'Opciones',
  QUANTITY: 'Cantidad',
  CART: 'Carrito',
  ADDRESS: 'Dirección',
  ADDRESS_TEXT: 'Escribiendo dirección',
  ADDRESS_CONFIRM: 'Confirmar dirección',
  REFERENCES: 'Referencias',
  PAYMENT: 'Pago',
  CASH_AMOUNT: 'Efectivo',
  NAME: 'Nombre',
  CONFIRM: 'Confirmar pedido',
  EDIT: 'Editando',
  HUMAN: 'Atención humana',
};
