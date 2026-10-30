// Datos de entrada de las plantillas de tickets (contrato entre API y @rh/printing).
// Montos en centavos. Fechas en ISO string. Textos ya en español.

export interface TicketBusinessInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  footer?: string | null; // "¡Gracias por su preferencia!"
  logoUrl?: string | null;
}

export interface TicketLineModifier { name: string; quantity?: number; priceCents?: number }
export interface TicketLine {
  quantity: number;
  name: string;
  modifiers?: TicketLineModifier[];
  note?: string | null;
  totalCents?: number; // no se usa en comandas de cocina
}

/** Comanda de cocina / barra (sin precios). */
export interface KitchenTicketData {
  folio: string; // "P-0123" | "M5-0012"
  areaName: string; // "COCINA"
  createdAt: string;
  serviceLabel: string; // "DOMICILIO" | "PASAR A RECOGER" | "MESA 5" | "MOSTRADOR"
  customerName?: string | null;
  waiterName?: string | null;
  lines: TicketLine[];
  notes?: string | null;
  isReprint?: boolean;
  isAddition?: boolean; // agregado a una cuenta ya enviada (POS)
  urgent?: boolean;
}

/** Ticket de cliente / repartidor para pedidos de delivery. */
export interface CustomerTicketData {
  business: TicketBusinessInfo;
  folio: string;
  createdAt: string;
  channelLabel: string; // "WhatsApp" | "Web" | "Teléfono"
  typeLabel: string; // "Domicilio" | "Pasar a recoger"
  customerName: string;
  customerPhone: string;
  address?: string | null;
  references?: string | null;
  mapsUrl?: string | null; // se imprime como QR
  lines: TicketLine[];
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  paymentLabel: string; // "Efectivo"
  cashGivenCents?: number | null;
  changeCents?: number | null;
  notes?: string | null;
  estimatedMinutes?: number | null;
  driverName?: string | null;
}

/** Cuenta de mesa (POS) — pre-cuenta o comprobante de pago. */
export interface BillTicketData {
  business: TicketBusinessInfo;
  folio: string;
  createdAt: string;
  tableLabel: string; // "Mesa 5" | "Para llevar"
  waiterName?: string | null;
  guests?: number | null;
  lines: TicketLine[];
  subtotalCents: number;
  discountCents: number;
  tipCents: number;
  totalCents: number;
  payments?: { label: string; amountCents: number; receivedCents?: number | null; changeCents?: number | null }[];
  suggestedTips?: { percent: number; amountCents: number }[];
  isPaid: boolean;
}

/** Corte de caja X o Z. */
export interface CashCutTicketData {
  business: TicketBusinessInfo;
  kind: 'X' | 'Z';
  sessionFolio: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string | null;
  openingCents: number;
  salesByMethod: { label: string; amountCents: number; count: number }[];
  tipsCents: number;
  movements: { label: string; amountCents: number }[]; // entradas (+) / salidas (-)
  expectedCashCents: number;
  countedCashCents?: number | null;
  differenceCents?: number | null;
  ticketsCount: number;
  cancelledCount: number;
}

/** Lista de compras consolidada (requisiciones). */
export interface ShoppingListTicketData {
  businessName: string;
  createdAt: string;
  groups: { supplierName: string; items: { name: string; quantity: string; unit: string }[] }[];
}

export interface TestTicketData {
  printerName: string;
  connectionLabel: string;
  paperWidth: 58 | 80;
  createdAt: string;
}
