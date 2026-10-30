import { pgEnum } from 'drizzle-orm/pg-core';
import {
  CashMovementType, ConversationType, DiscountType, NotificationType, OrderChannel, OrderStatus,
  OrderType, PaymentMethod, PrintJobKind, PrintJobStatus, PrinterConnection, PrinterDialect,
  Priority, RequisitionStatus, Role, TableStatus, TicketStatus, UnitCode,
} from '@rh/shared';

const v = <T extends Record<string, string>>(o: T) => Object.values(o) as [T[keyof T], ...T[keyof T][]];

export const roleEnum = pgEnum('role', v(Role));
export const requisitionStatusEnum = pgEnum('requisition_status', v(RequisitionStatus));
export const priorityEnum = pgEnum('priority', v(Priority));
export const unitEnum = pgEnum('unit_code', v(UnitCode));
export const conversationTypeEnum = pgEnum('conversation_type', v(ConversationType));
export const notificationTypeEnum = pgEnum('notification_type', v(NotificationType));
export const orderChannelEnum = pgEnum('order_channel', v(OrderChannel));
export const orderTypeEnum = pgEnum('order_type', v(OrderType));
export const orderStatusEnum = pgEnum('order_status', v(OrderStatus));
export const paymentMethodEnum = pgEnum('payment_method', v(PaymentMethod));
export const printerConnectionEnum = pgEnum('printer_connection', v(PrinterConnection));
export const printerDialectEnum = pgEnum('printer_dialect', v(PrinterDialect));
export const printJobStatusEnum = pgEnum('print_job_status', v(PrintJobStatus));
export const printJobKindEnum = pgEnum('print_job_kind', v(PrintJobKind));
export const zoneKindEnum = pgEnum('zone_kind', ['POLYGON', 'RADIUS']);
export const discountTypeEnum = pgEnum('discount_type', v(DiscountType));
export const ticketStatusEnum = pgEnum('ticket_status', v(TicketStatus));
export const tableStatusEnum = pgEnum('table_status', v(TableStatus));
export const cashMovementTypeEnum = pgEnum('cash_movement_type', v(CashMovementType));
export const waDirectionEnum = pgEnum('wa_direction', ['IN', 'OUT']);
