// Enums compartidos entre API, web, print-agent y apps nativas.
// Deben coincidir 1:1 con los enums de apps/api/prisma/schema.prisma.

export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  AREA_LEAD: 'AREA_LEAD',
  STAFF: 'STAFF',
  CASHIER: 'CASHIER',
  WAITER: 'WAITER',
  DRIVER: 'DRIVER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const MANAGER_ROLES: Role[] = [Role.OWNER, Role.ADMIN];

export const RequisitionStatus = {
  ENVIADA: 'ENVIADA',
  VISTA: 'VISTA',
  APROBADA: 'APROBADA',
  APROBADA_PARCIAL: 'APROBADA_PARCIAL',
  RECHAZADA: 'RECHAZADA',
  EN_COMPRA: 'EN_COMPRA',
  SURTIDA: 'SURTIDA',
  RECIBIDA: 'RECIBIDA',
  CANCELADA: 'CANCELADA',
} as const;
export type RequisitionStatus = (typeof RequisitionStatus)[keyof typeof RequisitionStatus];

export const RequisitionStatusLabel: Record<RequisitionStatus, string> = {
  ENVIADA: 'Enviada',
  VISTA: 'Vista',
  APROBADA: 'Aprobada',
  APROBADA_PARCIAL: 'Aprobada parcial',
  RECHAZADA: 'Rechazada',
  EN_COMPRA: 'En compra',
  SURTIDA: 'Surtida',
  RECIBIDA: 'Recibida',
  CANCELADA: 'Cancelada',
};

export const Priority = { NORMAL: 'NORMAL', URGENTE: 'URGENTE' } as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const UnitCode = {
  KG: 'KG', G: 'G', L: 'L', ML: 'ML', PIEZA: 'PIEZA', BOTE: 'BOTE', CAJA: 'CAJA',
  BOLSA: 'BOLSA', PAQUETE: 'PAQUETE', GARRAFON: 'GARRAFON', TANQUE: 'TANQUE',
  MANOJO: 'MANOJO', ROLLO: 'ROLLO', DOCENA: 'DOCENA', LATA: 'LATA', BOTELLA: 'BOTELLA',
} as const;
export type UnitCode = (typeof UnitCode)[keyof typeof UnitCode];
export const UnitLabel: Record<UnitCode, { one: string; many: string; short: string }> = {
  KG: { one: 'kilo', many: 'kilos', short: 'kg' },
  G: { one: 'gramo', many: 'gramos', short: 'g' },
  L: { one: 'litro', many: 'litros', short: 'L' },
  ML: { one: 'mililitro', many: 'mililitros', short: 'ml' },
  PIEZA: { one: 'pieza', many: 'piezas', short: 'pz' },
  BOTE: { one: 'bote', many: 'botes', short: 'bote' },
  CAJA: { one: 'caja', many: 'cajas', short: 'caja' },
  BOLSA: { one: 'bolsa', many: 'bolsas', short: 'bolsa' },
  PAQUETE: { one: 'paquete', many: 'paquetes', short: 'paq' },
  GARRAFON: { one: 'garrafón', many: 'garrafones', short: 'garr' },
  TANQUE: { one: 'tanque', many: 'tanques', short: 'tanque' },
  MANOJO: { one: 'manojo', many: 'manojos', short: 'manojo' },
  ROLLO: { one: 'rollo', many: 'rollos', short: 'rollo' },
  DOCENA: { one: 'docena', many: 'docenas', short: 'doc' },
  LATA: { one: 'lata', many: 'latas', short: 'lata' },
  BOTELLA: { one: 'botella', many: 'botellas', short: 'bot' },
};

export const ConversationType = {
  AREA_OWNER: 'AREA_OWNER',
  GENERAL: 'GENERAL',
  REQUISITION: 'REQUISITION',
} as const;
export type ConversationType = (typeof ConversationType)[keyof typeof ConversationType];

export const NotificationType = {
  REQUISITION_NEW: 'REQUISITION_NEW',
  REQUISITION_URGENT: 'REQUISITION_URGENT',
  REQUISITION_UPDATED: 'REQUISITION_UPDATED',
  RECEPTION_DIFF: 'RECEPTION_DIFF',
  MESSAGE: 'MESSAGE',
  DEVICE_OFFLINE: 'DEVICE_OFFLINE',
  ORDER_NEW: 'ORDER_NEW',
  ORDER_UPDATED: 'ORDER_UPDATED',
  HUMAN_HANDOFF: 'HUMAN_HANDOFF',
  PRINT_ERROR: 'PRINT_ERROR',
  DAILY_SUMMARY: 'DAILY_SUMMARY',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const OrderChannel = {
  WHATSAPP: 'WHATSAPP', WEB: 'WEB', TELEFONO: 'TELEFONO', MOSTRADOR: 'MOSTRADOR', MESA: 'MESA',
} as const;
export type OrderChannel = (typeof OrderChannel)[keyof typeof OrderChannel];

export const OrderType = { DOMICILIO: 'DOMICILIO', PASAR_A_RECOGER: 'PASAR_A_RECOGER' } as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

export const OrderStatus = {
  NUEVO: 'NUEVO',
  ACEPTADO: 'ACEPTADO',
  EN_PREPARACION: 'EN_PREPARACION',
  LISTO: 'LISTO',
  EN_CAMINO: 'EN_CAMINO',
  ENTREGADO: 'ENTREGADO',
  RECOGIDO: 'RECOGIDO',
  RECHAZADO: 'RECHAZADO',
  CANCELADO: 'CANCELADO',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
export const OrderStatusLabel: Record<OrderStatus, string> = {
  NUEVO: 'Nuevo', ACEPTADO: 'Aceptado', EN_PREPARACION: 'En preparación', LISTO: 'Listo',
  EN_CAMINO: 'En camino', ENTREGADO: 'Entregado', RECOGIDO: 'Recogido', RECHAZADO: 'Rechazado',
  CANCELADO: 'Cancelado',
};

export const PaymentMethod = {
  EFECTIVO: 'EFECTIVO', TARJETA: 'TARJETA', TRANSFERENCIA: 'TRANSFERENCIA',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
export const PaymentMethodLabel: Record<PaymentMethod, string> = {
  EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia',
};

export const PrinterConnection = {
  NETWORK: 'NETWORK',
  USB_DEVICE: 'USB_DEVICE',
  WINDOWS_PRINTER: 'WINDOWS_PRINTER',
  SERIAL: 'SERIAL',
  BLUETOOTH: 'BLUETOOTH',
  BROWSER: 'BROWSER',
  KDS: 'KDS',
} as const;
export type PrinterConnection = (typeof PrinterConnection)[keyof typeof PrinterConnection];
export const PrinterConnectionLabel: Record<PrinterConnection, string> = {
  NETWORK: 'Red (IP)',
  USB_DEVICE: 'USB directo (Linux/Raspberry)',
  WINDOWS_PRINTER: 'Impresora instalada en Windows',
  SERIAL: 'Puerto serial / COM',
  BLUETOOTH: 'Bluetooth (app Android)',
  BROWSER: 'Navegador (sin agente)',
  KDS: 'Pantalla de cocina (no imprime)',
};
/** Qué conexiones atiende cada tipo de cliente de impresión. */
export const PrinterConnectionHandler: Record<PrinterConnection, 'AGENT' | 'MOBILE' | 'BROWSER' | 'SCREEN'> = {
  NETWORK: 'AGENT', USB_DEVICE: 'AGENT', WINDOWS_PRINTER: 'AGENT', SERIAL: 'AGENT',
  BLUETOOTH: 'MOBILE', BROWSER: 'BROWSER', KDS: 'SCREEN',
};

export const PrinterDialect = { ESC_POS: 'ESC_POS', STAR: 'STAR' } as const;
export type PrinterDialect = (typeof PrinterDialect)[keyof typeof PrinterDialect];

export const PrintJobStatus = {
  PENDING: 'PENDING', SENT: 'SENT', PRINTED: 'PRINTED', FAILED: 'FAILED', CANCELLED: 'CANCELLED',
} as const;
export type PrintJobStatus = (typeof PrintJobStatus)[keyof typeof PrintJobStatus];

export const PrintJobKind = {
  KITCHEN: 'KITCHEN', CUSTOMER: 'CUSTOMER', BILL: 'BILL', PAYMENT: 'PAYMENT',
  CASH_CUT: 'CASH_CUT', TEST: 'TEST', SHOPPING_LIST: 'SHOPPING_LIST',
} as const;
export type PrintJobKind = (typeof PrintJobKind)[keyof typeof PrintJobKind];

export const TicketStatus = {
  ABIERTA: 'ABIERTA', POR_COBRAR: 'POR_COBRAR', PAGADA: 'PAGADA', CANCELADA: 'CANCELADA',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const TableStatus = { LIBRE: 'LIBRE', OCUPADA: 'OCUPADA', POR_COBRAR: 'POR_COBRAR' } as const;
export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus];

export const CashMovementType = { ENTRADA: 'ENTRADA', SALIDA: 'SALIDA' } as const;
export type CashMovementType = (typeof CashMovementType)[keyof typeof CashMovementType];

export const DiscountType = { PERCENT: 'PERCENT', AMOUNT: 'AMOUNT' } as const;
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

export const ModuleKey = { REQUISITIONS: 'requisitions', DELIVERY: 'delivery', POS: 'pos' } as const;
export type ModuleKey = (typeof ModuleKey)[keyof typeof ModuleKey];

/** Eventos de tiempo real (Socket.IO). */
export const RT = {
  REQUISITION_CREATED: 'requisition.created',
  REQUISITION_UPDATED: 'requisition.updated',
  MESSAGE_CREATED: 'message.created',
  MESSAGE_READ: 'message.read',
  TYPING: 'chat.typing',
  NOTIFICATION: 'notification',
  DEVICE_STATUS: 'device.status',
  DEVICE_REVOKED: 'device.revoked',
  CATALOG_CHANGED: 'catalog.changed',
  MENU_CHANGED: 'menu.changed',
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  KDS_UPDATED: 'kds.updated',
  PRINT_JOB: 'print.job',
  PRINT_JOB_UPDATED: 'print.job.updated',
  AGENT_STATUS: 'agent.status',
  WA_CONVERSATION: 'whatsapp.conversation',
  TICKET_UPDATED: 'pos.ticket.updated',
  TABLE_UPDATED: 'pos.table.updated',
  STORE_STATUS: 'store.status',
} as const;
