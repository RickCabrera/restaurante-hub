import type { ZodSchema } from 'zod';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { z } from 'zod';
import {
  CreateRequisitionSchema, FulfillRequisitionSchema, ReceiveRequisitionSchema, ReviewRequisitionSchema,
  SendMessageSchema, SupplySchema, SUPPLY_ICON_KEYS, zId, zPhone, zPriority, zRole, zUnit,
} from '@rh/shared';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (#RRGGBB)');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)');
const optStr = (max: number) => z.string().trim().max(max);
const boolish = z.union([z.boolean(), z.enum(['true', 'false', '1', '0'])]).transform((v) => v === true || v === 'true' || v === '1');
const csvList = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined));
const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida');

// ------------------------------------------------------------------ usuarios
export const UserListQuery = z.object({
  role: zRole.optional(),
  areaId: zId.optional(),
  active: boolish.optional(),
  q: z.string().max(80).optional(),
});
const pin = z.string().regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos');
const email = z.string().trim().toLowerCase().email('Correo inválido');
export const CreateUserSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: email.nullable().optional(),
  phone: zPhone.nullable().optional(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100).optional(),
  pin: pin.optional(),
  role: zRole,
  areaIds: z.array(zId).default([]),
  avatarColor: hex.optional(),
  active: z.boolean().default(true),
});
export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export const UpdateUserSchema = CreateUserSchema.omit({ password: true, pin: true }).partial().extend({
  areaIds: z.array(zId).optional(),
  active: z.boolean().optional(),
});
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
export const SetPinSchema = z.object({ pin: pin.nullable() });
export const ResetPasswordSchema = z.object({ password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100) });

// ------------------------------------------------------------------ áreas y dispositivos
export const OrderWindowSchema = z.record(z.enum(['0', '1', '2', '3', '4', '5', '6']), z.object({ until: hhmm }));
export const AreaSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: hex.default('#2A9D8F'),
  icon: z.string().max(40).default('chef'),
  isProduction: z.boolean().default(true),
  canRequisition: z.boolean().default(true),
  orderWindow: OrderWindowSchema.default({}),
  branchId: zId.nullable().optional(),
  active: z.boolean().default(true),
});
export type AreaDto = z.infer<typeof AreaSchema>;
export const UpdateAreaSchema = AreaSchema.partial();
export const ReorderSchema = z.object({ ids: z.array(zId).min(1).max(500) });
export const UpdateDeviceSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  areaId: zId.nullable().optional(),
});

// ------------------------------------------------------------------ catálogo
export const CategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().max(40).default('box'),
});
export const UpdateCategorySchema = CategorySchema.partial();
export const SupplierSchema = z.object({
  name: z.string().trim().min(1).max(80),
  contactName: optStr(80).nullable().optional(),
  phone: zPhone.nullable().optional(),
  deliveryDays: z.array(z.number().int().min(0).max(6)).default([]),
  notes: optStr(500).nullable().optional(),
  active: z.boolean().default(true),
});
export const UpdateSupplierSchema = SupplierSchema.partial();
const iconKey = z
  .string()
  .max(60)
  .refine((k) => SUPPLY_ICON_KEYS.includes(k), 'Ícono desconocido')
  .nullable()
  .optional();
export const CreateSupplySchema = SupplySchema.extend({ icon: iconKey });
export type CreateSupplyDto = z.infer<typeof CreateSupplySchema>;
export const UpdateSupplySchema = SupplySchema.extend({ icon: iconKey })
  .partial()
  .extend({ areaIds: z.array(zId).optional(), step: z.number().positive().optional(), autoApprove: z.boolean().optional(), active: z.boolean().optional() });
export type UpdateSupplyDto = z.infer<typeof UpdateSupplySchema>;
export const SupplyListQuery = z.object({
  categoryId: zId.optional(),
  areaId: zId.optional(),
  supplierId: zId.optional(),
  active: boolish.optional(),
  q: z.string().max(80).optional(),
});
export const ReorderSuppliesSchema = z.object({ areaId: zId, ids: z.array(zId).min(1).max(1000) });
export const BulkAssignSchema = z.object({
  supplyIds: z.array(zId).min(1).max(1000),
  areaIds: z.array(zId).min(1).max(50),
  mode: z.enum(['add', 'remove', 'set']).default('add'),
});
export const ImportJsonSchema = z.object({ csv: z.string().min(1).max(2_000_000), dryRun: z.boolean().optional() });

// ------------------------------------------------------------------ requisiciones
export const CreateRequisitionBody = CreateRequisitionSchema.extend({ areaId: zId.optional() });
export type CreateRequisitionBodyDto = z.infer<typeof CreateRequisitionBody>;
export { ReviewRequisitionSchema, FulfillRequisitionSchema, ReceiveRequisitionSchema };
export type ReviewDto = z.infer<typeof ReviewRequisitionSchema>;
export type FulfillDto = z.infer<typeof FulfillRequisitionSchema>;
export type ReceiveDto = z.infer<typeof ReceiveRequisitionSchema>;
export const CancelSchema = z.object({ reason: z.string().trim().max(300).optional() });
export const ReqListQuery = z.object({
  areaId: zId.optional(),
  status: csvList,
  priority: zPriority.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  supplyId: zId.optional(),
  q: z.string().max(40).optional(),
  open: boolish.optional(),
  late: boolish.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ReqListQueryDto = z.infer<typeof ReqListQuery>;
export const LastQuery = z.object({ areaId: zId.optional() });
export const PurchasedSchema = z
  .object({ supplyIds: z.array(zId).max(1000).optional(), supplierId: zId.nullable().optional() })
  .refine((v) => v.supplyIds?.length || v.supplierId !== undefined, 'Indica los insumos o el proveedor');
export const TemplateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  areaId: zId.optional(),
  items: z.array(z.object({ supplyId: zId, quantity: z.number().positive().max(100000) })).min(1).max(200),
});
export const UpdateTemplateSchema = TemplateSchema.omit({ areaId: true }).partial();
export const TemplateListQuery = z.object({ areaId: zId.optional() });

// ------------------------------------------------------------------ chat
export const SendMessageBody = SendMessageSchema.refine((v) => !!(v.body?.trim() || v.imageUrl || v.quickMessageId), 'Escribe un mensaje');
export type SendMessageDto = z.infer<typeof SendMessageSchema>;
export const RequisitionMessageBody = SendMessageSchema.omit({ conversationId: true }).refine(
  (v) => !!(v.body?.trim() || v.imageUrl || v.quickMessageId),
  'Escribe un mensaje',
);
export const BroadcastSchema = z.object({ body: z.string().trim().min(1).max(2000), imageUrl: z.string().url().optional() });
export const MessagesQuery = z.object({
  before: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
export const QuickMessageSchema = z.object({
  text: z.string().trim().min(1).max(120),
  icon: z.string().max(40).default('alert'),
  urgent: z.boolean().default(false),
  active: z.boolean().default(true),
});
export const UpdateQuickMessageSchema = QuickMessageSchema.partial();

// ------------------------------------------------------------------ bitácora y reportes
export const AuditQuery = z.object({
  entity: z.string().max(40).optional(),
  entityId: z.string().max(60).optional(),
  actorId: z.string().max(60).optional(),
  action: z.string().max(60).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const ReportQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)').optional(),
  areaId: zId.optional(),
});
export type ReportQueryDto = z.infer<typeof ReportQuery>;

export { zUnit };

/** Pipe zod para esquemas con defaults/transformaciones (entrada ≠ salida). */
export function zq<S extends z.ZodTypeAny>(schema: S): ZodPipe<z.infer<S>> {
  return new ZodPipe(schema as unknown as ZodSchema<z.infer<S>>);
}
