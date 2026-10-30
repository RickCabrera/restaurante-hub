import { z } from 'zod';
import {
  CashMovementType, DiscountType, OrderChannel, OrderType, PaymentMethod, PrinterConnection,
  PrinterDialect, Priority, Role, UnitCode,
} from './enums';

const vals = <T extends Record<string, string>>(o: T) =>
  Object.values(o) as [T[keyof T], ...T[keyof T][]];

export const zRole = z.enum(vals(Role));
export const zUnit = z.enum(vals(UnitCode));
export const zPriority = z.enum(vals(Priority));
export const zPaymentMethod = z.enum(vals(PaymentMethod));
export const zOrderType = z.enum(vals(OrderType));
export const zOrderChannel = z.enum(vals(OrderChannel));
export const zPrinterConnection = z.enum(vals(PrinterConnection));
export const zPrinterDialect = z.enum(vals(PrinterDialect));
export const zDiscountType = z.enum(vals(DiscountType));
export const zCashMovementType = z.enum(vals(CashMovementType));
export const zPhone = z.string().regex(/^\+?\d{10,15}$/, 'Teléfono inválido (10 a 15 dígitos)');
export const zId = z.string().min(1);

// ---------- Auth ----------
export const LoginSchema = z.object({
  login: z.string().min(3), // email o teléfono
  password: z.string().min(6),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const PairDeviceSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  deviceName: z.string().min(1).max(60).optional(),
  platform: z.enum(['web', 'android', 'ios', 'desktop']).default('web'),
});
export type PairDeviceDto = z.infer<typeof PairDeviceSchema>;

export const PinLoginSchema = z.object({ userId: zId, pin: z.string().regex(/^\d{4}$/) });

// ---------- Requisiciones ----------
export const RequisitionItemInput = z.object({
  supplyId: zId,
  quantity: z.number().positive().max(100000),
  note: z.string().max(200).optional(),
});
export const CreateRequisitionSchema = z.object({
  clientRequestId: z.string().min(8).max(64),
  priority: zPriority.default('NORMAL'),
  note: z.string().max(500).optional(),
  neededFor: z.string().optional(), // ISO date
  userId: zId.optional(), // quién pidió (PIN)
  items: z.array(RequisitionItemInput).min(1).max(200),
});
export type CreateRequisitionDto = z.infer<typeof CreateRequisitionSchema>;

export const ReviewRequisitionSchema = z.object({
  action: z.enum(['APPROVE_ALL', 'APPROVE', 'REJECT']),
  reason: z.string().max(300).optional(),
  items: z
    .array(z.object({ id: zId, approvedQty: z.number().min(0), note: z.string().max(200).optional() }))
    .optional(),
});
export const FulfillRequisitionSchema = z.object({
  items: z.array(z.object({ id: zId, fulfilledQty: z.number().min(0) })).optional(),
});
export const ReceiveRequisitionSchema = z.object({
  items: z.array(z.object({ id: zId, receivedQty: z.number().min(0) })).optional(),
  note: z.string().max(300).optional(),
});

// ---------- Catálogo ----------
export const SupplySchema = z.object({
  name: z.string().min(1).max(80),
  categoryId: zId,
  unit: zUnit,
  step: z.number().positive().default(1),
  maxPerOrder: z.number().positive().nullable().optional(),
  icon: z.string().max(60).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  supplierId: zId.nullable().optional(),
  autoApprove: z.boolean().default(false),
  active: z.boolean().default(true),
  areaIds: z.array(zId).default([]),
});

// ---------- Chat ----------
export const SendMessageSchema = z.object({
  conversationId: zId,
  body: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  quickMessageId: zId.optional(),
});

// ---------- Delivery ----------
export const CartModifierInput = z.object({ modifierId: zId, quantity: z.number().int().min(1).default(1) });
export const CartLineInput = z.object({
  productId: zId,
  quantity: z.number().int().min(1).max(99),
  modifiers: z.array(CartModifierInput).default([]),
  note: z.string().max(200).optional(),
});
export type CartLineInput = z.infer<typeof CartLineInput>;

export const AddressInput = z.object({
  id: zId.optional(),
  text: z.string().min(3).max(300),
  references: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  label: z.string().max(30).optional(),
});

export const QuoteOrderSchema = z.object({
  branchId: zId.optional(),
  type: zOrderType,
  lines: z.array(CartLineInput).min(1),
  address: AddressInput.optional(),
  couponCode: z.string().max(30).optional(),
  customerPhone: zPhone.optional(),
});
export type QuoteOrderDto = z.infer<typeof QuoteOrderSchema>;

export const CreateOrderSchema = QuoteOrderSchema.extend({
  channel: zOrderChannel.default('WEB'),
  customer: z.object({ phone: zPhone, name: z.string().min(1).max(80) }),
  paymentMethod: zPaymentMethod,
  cashGivenCents: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
  acceptPrivacy: z.boolean().optional(),
  sessionToken: z.string().optional(),
});
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

// ---------- Impresión ----------
export const PrinterSchema = z.object({
  name: z.string().min(1).max(60),
  areaId: zId.nullable().optional(),
  connection: zPrinterConnection,
  dialect: zPrinterDialect.default('ESC_POS'),
  host: z.string().max(100).nullable().optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  devicePath: z.string().max(200).nullable().optional(), // /dev/usb/lp0, COM3
  windowsName: z.string().max(200).nullable().optional(),
  baudRate: z.number().int().nullable().optional(),
  bluetoothAddress: z.string().max(40).nullable().optional(),
  paperWidth: z.union([z.literal(58), z.literal(80)]).default(80),
  copies: z.number().int().min(1).max(5).default(1),
  cutPaper: z.boolean().default(true),
  openDrawer: z.boolean().default(false),
  printsCustomerTicket: z.boolean().default(false),
  agentId: zId.nullable().optional(),
  active: z.boolean().default(true),
});
export type PrinterDto = z.infer<typeof PrinterSchema>;

// ---------- POS ----------
export const AddTicketLinesSchema = z.object({ lines: z.array(CartLineInput).min(1) });
export const PaymentInput = z.object({
  method: zPaymentMethod,
  amountCents: z.number().int().positive(),
  receivedCents: z.number().int().min(0).optional(),
  reference: z.string().max(60).optional(),
  tipCents: z.number().int().min(0).default(0),
});
export const PayTicketSchema = z.object({ payments: z.array(PaymentInput).min(1) });
export const CashMovementSchema = z.object({
  type: zCashMovementType,
  amountCents: z.number().int().positive(),
  reason: z.string().min(1).max(200),
});
