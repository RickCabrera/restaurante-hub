// Formas de salida de pedidos: objeto completo para el panel y objeto público de seguimiento.
import { OrderStatus, OrderStatusLabel, PaymentMethodLabel } from '@rh/shared';
import type { OrderChannel, OrderType, PaymentMethod } from '@rh/shared';
import { orderItems, orders } from '../../../db/schema';

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;

export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  WHATSAPP: 'WhatsApp', WEB: 'Web', TELEFONO: 'Teléfono', MOSTRADOR: 'Mostrador', MESA: 'Mesa',
};
export const TYPE_LABEL: Record<OrderType, string> = { DOMICILIO: 'Domicilio', PASAR_A_RECOGER: 'Pasar a recoger' };

export interface OrderView extends OrderRow {
  items: OrderItemRow[];
  driver: { id: string; name: string; phone: string | null } | null;
  branchName: string | null;
  statusLabel: string;
  channelLabel: string;
  typeLabel: string;
  paymentLabel: string;
  changeCents: number | null;
  mapsUrl: string | null;
  trackingUrl: string;
  customerOrdersCount: number | null;
}

export function toOrderView(
  o: OrderRow & { items?: OrderItemRow[]; driver?: { id: string; name: string; phone: string | null } | null; branch?: { name: string } | null; customer?: { ordersCount: number } | null },
  appUrl: string,
): OrderView {
  const { branch, customer, ...rest } = o;
  return {
    ...rest,
    items: o.items ?? [],
    driver: o.driver ? { id: o.driver.id, name: o.driver.name, phone: o.driver.phone } : null,
    branchName: branch?.name ?? null,
    statusLabel: OrderStatusLabel[o.status],
    channelLabel: CHANNEL_LABEL[o.channel],
    typeLabel: TYPE_LABEL[o.type],
    paymentLabel: PaymentMethodLabel[o.paymentMethod as PaymentMethod],
    changeCents: o.paymentMethod === 'EFECTIVO' && o.cashGivenCents != null ? Math.max(0, o.cashGivenCents - o.totalCents) : null,
    mapsUrl: o.lat != null && o.lng != null ? `https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}` : null,
    trackingUrl: `${appUrl.replace(/\/$/, '')}/pedido/${o.publicToken}`,
    customerOrdersCount: customer?.ordersCount ?? null,
  };
}

export interface TrackingStep { status: OrderStatus; label: string; at: string | null; done: boolean; current: boolean }

export interface TrackingView {
  folio: string;
  publicToken: string;
  status: OrderStatus;
  statusLabel: string;
  type: OrderType;
  typeLabel: string;
  channel: OrderChannel;
  createdAt: string;
  estimatedMinutes: number | null;
  /** hora estimada de entrega / listo para recoger */
  etaAt: string | null;
  timeline: TrackingStep[];
  items: { name: string; quantity: number; modifiers: string[]; note: string | null; totalCents: number }[];
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentLabel: string;
  paid: boolean;
  driverName: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  business: { name: string; phone: string | null; logoUrl: string | null; primaryColor: string; accentColor: string; slug: string };
  branch: { name: string; address: string | null; phone: string | null } | null;
  active: boolean;
}

export function stepTimestamps(o: OrderRow): Partial<Record<OrderStatus, Date | null>> {
  return {
    NUEVO: o.createdAt,
    ACEPTADO: o.acceptedAt,
    EN_PREPARACION: o.preparingAt,
    LISTO: o.readyAt,
    EN_CAMINO: o.dispatchedAt,
    ENTREGADO: o.type === 'DOMICILIO' ? o.deliveredAt : null,
    RECOGIDO: o.type === 'PASAR_A_RECOGER' ? o.deliveredAt : null,
    RECHAZADO: o.cancelledAt,
    CANCELADO: o.cancelledAt,
  };
}

export function toTracking(
  o: OrderRow & { items: OrderItemRow[]; driver?: { name: string } | null; branch?: { name: string; address: string | null; phone: string | null } | null },
  business: { name: string; phone: string | null; logoUrl: string | null; primaryColor: string; accentColor: string; slug: string },
): TrackingView {
  const flow: OrderStatus[] = o.type === 'DOMICILIO'
    ? ['NUEVO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO', 'ENTREGADO']
    : ['NUEVO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO', 'RECOGIDO'];
  const ts = stepTimestamps(o);
  const terminalBad = o.status === 'RECHAZADO' || o.status === 'CANCELADO';
  const idx = flow.indexOf(o.status);
  const timeline: TrackingStep[] = flow
    .filter((s) => !terminalBad || ts[s])
    .map((s, i) => ({
      status: s,
      label: OrderStatusLabel[s],
      at: ts[s]?.toISOString() ?? null,
      done: !terminalBad && (i <= idx || !!ts[s]),
      current: s === o.status,
    }));
  if (terminalBad) timeline.push({ status: o.status, label: OrderStatusLabel[o.status], at: o.cancelledAt?.toISOString() ?? null, done: true, current: true });
  const base = o.acceptedAt ?? o.createdAt;
  const active = !['ENTREGADO', 'RECOGIDO', 'RECHAZADO', 'CANCELADO'].includes(o.status);
  return {
    folio: o.folio,
    publicToken: o.publicToken,
    status: o.status,
    statusLabel: OrderStatusLabel[o.status],
    type: o.type,
    typeLabel: TYPE_LABEL[o.type],
    channel: o.channel,
    createdAt: o.createdAt.toISOString(),
    estimatedMinutes: o.estimatedMinutes,
    etaAt: active && o.estimatedMinutes ? new Date(base.getTime() + o.estimatedMinutes * 60_000).toISOString() : null,
    timeline,
    items: o.items.map((i) => ({
      name: i.productName,
      quantity: i.quantity,
      modifiers: i.modifiers.map((m) => (m.quantity > 1 ? `${m.quantity}× ${m.name}` : m.name)),
      note: i.note,
      totalCents: i.totalCents,
    })),
    subtotalCents: o.subtotalCents,
    discountCents: o.discountCents,
    deliveryFeeCents: o.deliveryFeeCents,
    totalCents: o.totalCents,
    paymentMethod: o.paymentMethod,
    paymentLabel: PaymentMethodLabel[o.paymentMethod],
    paid: o.paid,
    driverName: o.driver?.name?.split(' ')[0] ?? null,
    rejectReason: o.rejectReason,
    cancelReason: o.cancelReason,
    business,
    branch: o.branch ? { name: o.branch.name, address: o.branch.address, phone: o.branch.phone } : null,
    active,
  };
}
