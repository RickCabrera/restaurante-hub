// Esquemas zod locales del módulo Delivery.
import { z } from 'zod';
import { AddressInput, CreateOrderSchema, QuoteOrderSchema, zDiscountType, zOrderChannel, zOrderType, zPaymentMethod } from '@rh/shared';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Hora inválida (HH:MM)');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');
const id = z.string().min(1);
const cents = z.number().int().min(0).max(100_000_000);
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

// ---------------- Sucursales ----------------
export const HoursSchema = z.record(z.enum(['0', '1', '2', '3', '4', '5', '6']), z.array(z.object({ open: hhmm, close: hhmm })).max(4));
export const BranchSchema = z.object({
  name: z.string().trim().min(1).max(80),
  address: optText(200),
  phone: optText(30),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  hours: HoursSchema.default({}),
  closedDates: z.array(dateStr).max(366).default([]),
  acceptsDelivery: z.boolean().default(true),
  acceptsPickup: z.boolean().default(true),
  prepMinutes: z.number().int().min(0).max(600).default(25),
  active: z.boolean().default(true),
});
export const BranchPatchSchema = BranchSchema.partial();
export const PauseSchema = z
  .object({
    minutes: z.number().int().min(1).max(7 * 24 * 60).optional(),
    until: z.coerce.date().optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.minutes || v.until, { message: 'Indica minutos o una hora de reanudación' });

// ---------------- Zonas ----------------
export const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.array(z.number()).min(2).max(3)).min(4)).min(1),
});
const ZoneBase = z.object({
  branchId: id,
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['RADIUS', 'POLYGON']).default('RADIUS'),
  polygon: PolygonSchema.nullable().optional(),
  radiusKm: z.number().positive().max(200).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#E76F51'),
  feeCents: cents.default(0),
  minOrderCents: cents.default(0),
  freeFromCents: cents.nullable().optional(),
  etaMinutes: z.number().int().min(1).max(600).default(40),
  priority: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
});
export const ZoneSchema = ZoneBase.refine((z1) => (z1.kind === 'RADIUS' ? z1.radiusKm != null : z1.polygon != null), {
  message: 'Una zona por radio requiere radiusKm y una zona por polígono requiere polygon',
});
export const ZonePatchSchema = ZoneBase.partial();

// ---------------- Geo ----------------
export const GeoQuerySchema = z.object({
  q: z.string().trim().min(3).max(200),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});
export const LatLngQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

// ---------------- Menú ----------------
export const CategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: optText(300),
  imageUrl: z.string().url().nullable().optional(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().optional(),
});
export const ProductSchema = z.object({
  categoryId: id,
  productionAreaId: id.nullable().optional(),
  name: z.string().trim().min(1).max(100),
  description: optText(500),
  imageUrl: z.string().url().nullable().optional(),
  priceCents: cents,
  available: z.boolean().default(true),
  showInWeb: z.boolean().default(true),
  showInWhatsapp: z.boolean().default(true),
  showInQr: z.boolean().default(true),
  showInPos: z.boolean().default(true),
  active: z.boolean().default(true),
  sortOrder: z.number().int().optional(),
  /** grupos de modificadores en el orden deseado */
  modifierGroupIds: z.array(id).max(20).optional(),
});
export const ProductPatchSchema = ProductSchema.partial();
export const ModifierSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceCents: cents.default(0),
  available: z.boolean().default(true),
  sortOrder: z.number().int().optional(),
});
export const ModifierGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    minSelect: z.number().int().min(0).max(20).default(0),
    maxSelect: z.number().int().min(1).max(20).default(1),
    sortOrder: z.number().int().optional(),
    /** al crear se pueden incluir opciones */
    modifiers: z.array(ModifierSchema).max(30).optional(),
  })
  .refine((g) => g.minSelect <= g.maxSelect, { message: 'El mínimo no puede ser mayor que el máximo' });
export const ModifierGroupPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  minSelect: z.number().int().min(0).max(20).optional(),
  maxSelect: z.number().int().min(1).max(20).optional(),
  sortOrder: z.number().int().optional(),
});
export const ReorderSchema = z.object({ ids: z.array(id).min(1).max(500) });
export const AvailabilitySchema = z.object({ available: z.boolean() });
export const BranchOverrideSchema = z.object({
  priceCents: cents.nullable().optional(),
  available: z.boolean().nullable().optional(),
});
export const MenuQuerySchema = z.object({
  channel: z.enum(['web', 'whatsapp', 'qr', 'pos']).default('pos'),
  branchId: id.optional(),
});
export const PublicMenuQuerySchema = z.object({
  channel: z.enum(['web', 'qr']).default('web'),
  branchId: id.optional(),
});

// ---------------- Clientes ----------------
export const CustomerListSchema = z.object({
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export const CustomerPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).nullable().optional(),
  notes: optText(1000),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
});
export const AddressSchema = AddressInput.omit({ id: true }).extend({
  neighborhood: optText(100),
  postalCode: optText(10),
  validated: z.boolean().optional(),
});
export const AddressPatchSchema = AddressSchema.partial();

// ---------------- Cupones / promociones ----------------
export const CouponSchema = z.object({
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, números, guion y guion bajo').transform((s) => s.toUpperCase()),
  description: optText(200),
  discountType: zDiscountType,
  value: z.number().int().min(0).max(100_000_000),
  maxDiscountCents: cents.nullable().optional(),
  minOrderCents: cents.default(0),
  freeDelivery: z.boolean().default(false),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  maxUsesPerCustomer: z.number().int().min(1).nullable().optional(),
  channels: z.array(zOrderChannel).default([]),
  customerId: id.nullable().optional(),
  active: z.boolean().default(true),
}).refine((c) => c.discountType !== 'PERCENT' || c.value <= 100, { message: 'El porcentaje debe ser de 0 a 100' });
export const CouponPatchSchema = z.object({
  description: optText(200),
  discountType: zDiscountType.optional(),
  value: z.number().int().min(0).optional(),
  maxDiscountCents: cents.nullable().optional(),
  minOrderCents: cents.optional(),
  freeDelivery: z.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  maxUsesPerCustomer: z.number().int().min(1).nullable().optional(),
  channels: z.array(zOrderChannel).optional(),
  active: z.boolean().optional(),
});
export const PromotionKind = z.enum(['PERCENT_OFF', 'AMOUNT_OFF', 'BUY_X_GET_Y', 'FREE_DELIVERY']);
const PromotionBase = z.object({
  name: z.string().trim().min(1).max(80),
  kind: PromotionKind,
  value: z.number().int().min(0).default(0),
  buyQty: z.number().int().min(2).max(20).nullable().optional(),
  getQty: z.number().int().min(1).max(19).nullable().optional(),
  minOrderCents: cents.default(0),
  productIds: z.array(id).default([]),
  categoryIds: z.array(id).default([]),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  timeFrom: hhmm.nullable().optional(),
  timeTo: hhmm.nullable().optional(),
  channels: z.array(zOrderChannel).default([]),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  active: z.boolean().default(true),
});
export const PromotionSchema = PromotionBase.refine(
  (p) => p.kind !== 'BUY_X_GET_Y' || (p.buyQty != null && p.getQty != null && p.getQty < p.buyQty),
  { message: '2x1/3x2 requiere buyQty y getQty (getQty menor que buyQty)' },
).refine((p) => p.kind !== 'PERCENT_OFF' || p.value <= 100, { message: 'El porcentaje debe ser de 0 a 100' });
export const PromotionPatchSchema = PromotionBase.partial();

// ---------------- Pedidos ----------------
export const QuoteSchema = QuoteOrderSchema;
export const ManagerQuoteSchema = QuoteOrderSchema.extend({ channel: zOrderChannel.default('TELEFONO') });
export const PublicCreateOrderSchema = CreateOrderSchema.omit({ channel: true });
export const ManagerCreateOrderSchema = CreateOrderSchema.extend({
  channel: z.enum(['TELEFONO', 'MOSTRADOR']).default('TELEFONO'),
});
export const OrderListSchema = z.object({
  status: z.string().optional(), // CSV
  channel: zOrderChannel.optional(),
  type: zOrderType.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().max(60).optional(),
  driverId: id.optional(),
  branchId: id.optional(),
  active: z.enum(['1', '0', 'true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export const AcceptSchema = z.object({ estimatedMinutes: z.number().int().min(1).max(600).optional() });
export const ReasonSchema = z.object({ reason: z.string().trim().min(1).max(300) });
export const StatusSchema = z.object({
  status: z.enum(['EN_PREPARACION', 'LISTO', 'EN_CAMINO', 'ENTREGADO', 'RECOGIDO']),
});
export const AssignDriverSchema = z.object({ driverId: id.nullable() });
export const PaidSchema = z.object({ paid: z.boolean() });
export const ReportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  branchId: id.optional(),
});

export { zPaymentMethod, zOrderType };
