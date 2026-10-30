import { z } from 'zod';

const id = z.string().min(1);
const reason = z.string().trim().min(1, 'Captura el motivo').max(200);

export const DiningAreaSchema = z.object({
  name: z.string().trim().min(1).max(60),
  branchId: id.nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export const ReorderSchema = z.object({ ids: z.array(id).min(1).max(200) });

export const TableSchema = z.object({
  diningAreaId: id,
  name: z.string().trim().min(1).max(20),
  capacity: z.number().int().min(1).max(50).default(4),
  posX: z.number().int().min(0).max(10_000).default(0),
  posY: z.number().int().min(0).max(10_000).default(0),
  shape: z.enum(['square', 'round', 'rect']).default('square'),
  active: z.boolean().default(true),
});
export const TablePatchSchema = TableSchema.partial();
export const LayoutSchema = z.array(z.object({
  id,
  posX: z.number().int().min(0).max(10_000),
  posY: z.number().int().min(0).max(10_000),
  shape: z.enum(['square', 'round', 'rect']).optional(),
})).min(1).max(500);

export const OpenTicketSchema = z.object({
  tableId: id.optional(),
  serviceType: z.enum(['MESA', 'PARA_LLEVAR', 'MOSTRADOR']).optional(),
  label: z.string().trim().max(40).optional(),
  guests: z.number().int().min(1).max(99).default(1),
  notes: z.string().max(300).optional(),
}).refine((v) => v.tableId || (v.serviceType && v.serviceType !== 'MESA'), {
  message: 'Elige una mesa o el tipo de servicio (para llevar / mostrador)',
});
export type OpenTicketDto = z.infer<typeof OpenTicketSchema>;

export const TicketsQuery = z.object({
  status: z.enum(['open', 'today', 'paid', 'cancelled', 'all']).default('open'),
  tableId: z.string().optional(),
  mine: z.enum(['true', 'false', '1', '0']).optional(),
});

export const PatchTicketSchema = z.object({
  guests: z.number().int().min(1).max(99).optional(),
  label: z.string().trim().max(40).nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
});

export const PatchLineSchema = z.object({
  quantity: z.number().int().min(1).max(99).optional(),
  note: z.string().max(200).nullable().optional(),
}).refine((v) => v.quantity !== undefined || v.note !== undefined, { message: 'Nada que actualizar' });

export const ReasonSchema = z.object({ reason });

export const DiscountSchema = z.object({
  type: z.enum(['PERCENT', 'AMOUNT']).default('PERCENT'),
  /** PERCENT 0-100 ; AMOUNT centavos. 0 quita el descuento. */
  value: z.number().int().min(0),
  reason: z.string().trim().max(200).optional(),
}).refine((v) => v.type !== 'PERCENT' || v.value <= 100, { message: 'El porcentaje debe estar entre 0 y 100' })
  .refine((v) => v.value === 0 || !!v.reason, { message: 'Captura el motivo del descuento' });
export type DiscountDto = z.infer<typeof DiscountSchema>;

export const LineDiscountSchema = z.object({
  type: z.enum(['PERCENT', 'AMOUNT']).default('PERCENT'),
  value: z.number().int().min(0).default(0),
  isCourtesy: z.boolean().default(false),
  reason: z.string().trim().max(200).optional(),
}).refine((v) => v.type !== 'PERCENT' || v.value <= 100, { message: 'El porcentaje debe estar entre 0 y 100' })
  .refine((v) => (v.value === 0 && !v.isCourtesy) || !!v.reason, { message: 'Captura el motivo' });
export type LineDiscountDto = z.infer<typeof LineDiscountSchema>;

export const TipSchema = z.object({
  percent: z.number().int().min(0).max(100).optional(),
  amountCents: z.number().int().min(0).optional(),
}).refine((v) => !(v.percent !== undefined && v.amountCents !== undefined), { message: 'Indica porcentaje o monto, no ambos' });

export const SplitSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('lines'), lineIds: z.array(id).min(1) }),
  z.object({ mode: z.literal('equal'), parts: z.number().int().min(2).max(30) }),
]);

export const MergeSchema = z.object({ sourceTicketId: id });
export const MoveSchema = z.object({ tableId: id });
export const PrintTicketSchema = z.object({ kind: z.enum(['bill', 'kitchen']).default('bill') });

export const OpenCashSchema = z.object({
  openingCents: z.number().int().min(0),
  branchId: id.optional(),
});
export const CloseCashSchema = z.object({
  countedCents: z.number().int().min(0),
  notes: z.string().max(500).optional(),
});
export const RangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});
