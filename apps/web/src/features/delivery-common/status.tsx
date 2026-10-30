/**
 * delivery-common/status — Colores y badges de estado/canal/tipo de pedido.
 *
 * Exporta:
 * - `STATUS_META[status]` → { label, tone: 'brand'|'info'|'ok'|'purple'|'muted'|'danger', dot: CSS color }
 * - `PURPLE` → color CSS para EN_CAMINO (funciona en claro y oscuro)
 * - `<OrderStatusBadge status pulse? className? />`
 * - `<ChannelIcon channel className? />` (ícono lucide por canal) y `<ChannelBadge channel />`
 * - `<TypeBadge type />` (Domicilio / Recoger)
 * - `ACTIVE_STATUSES`, `CLOSED_STATUSES`
 */
import clsx from 'clsx';
import { Bike, Globe, MessageCircle, Phone, Store, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import type { OrderChannel, OrderStatus, OrderType } from '@rh/shared';
import { OrderStatusLabel } from '@rh/shared';
import { CHANNEL_LABEL, TYPE_SHORT } from './format';

type Tone = 'brand' | 'info' | 'ok' | 'purple' | 'muted' | 'danger';
export const PURPLE = 'rgb(139 92 246)';

export const STATUS_META: Record<OrderStatus, { label: string; tone: Tone; dot: string }> = {
  NUEVO: { label: OrderStatusLabel.NUEVO, tone: 'brand', dot: 'rgb(var(--brand))' },
  ACEPTADO: { label: OrderStatusLabel.ACEPTADO, tone: 'info', dot: 'rgb(var(--info))' },
  EN_PREPARACION: { label: OrderStatusLabel.EN_PREPARACION, tone: 'info', dot: 'rgb(var(--info))' },
  LISTO: { label: OrderStatusLabel.LISTO, tone: 'ok', dot: 'rgb(var(--ok))' },
  EN_CAMINO: { label: OrderStatusLabel.EN_CAMINO, tone: 'purple', dot: PURPLE },
  ENTREGADO: { label: OrderStatusLabel.ENTREGADO, tone: 'muted', dot: 'rgb(var(--ink-mute))' },
  RECOGIDO: { label: OrderStatusLabel.RECOGIDO, tone: 'muted', dot: 'rgb(var(--ink-mute))' },
  RECHAZADO: { label: OrderStatusLabel.RECHAZADO, tone: 'danger', dot: 'rgb(var(--danger))' },
  CANCELADO: { label: OrderStatusLabel.CANCELADO, tone: 'danger', dot: 'rgb(var(--danger))' },
};

export const ACTIVE_STATUSES: OrderStatus[] = ['NUEVO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO'];
export const CLOSED_STATUSES: OrderStatus[] = ['ENTREGADO', 'RECOGIDO', 'RECHAZADO', 'CANCELADO'];

const toneCls: Record<Tone, string> = {
  brand: 'bg-brand text-white',
  info: 'bg-info/15 text-info',
  ok: 'bg-ok/15 text-ok',
  purple: '',
  muted: 'bg-surface-sunken text-ink-mute',
  danger: 'bg-danger/15 text-danger',
};

export function OrderStatusBadge({ status, pulse, className }: { status: OrderStatus; pulse?: boolean; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span
      className={clsx('chip whitespace-nowrap', toneCls[m.tone], pulse && status === 'NUEVO' && 'animate-pulse', className)}
      style={m.tone === 'purple' ? { background: 'rgb(139 92 246 / 0.16)', color: PURPLE } : undefined}
    >
      {m.label}
    </span>
  );
}

export function ChannelIcon({ channel, className }: { channel: OrderChannel; className?: string }) {
  const cls = className ?? 'h-4 w-4';
  switch (channel) {
    case 'WHATSAPP':
      return <MessageCircle className={cls} aria-label="WhatsApp" />;
    case 'WEB':
      return <Globe className={cls} aria-label="Web" />;
    case 'TELEFONO':
      return <Phone className={cls} aria-label="Teléfono" />;
    case 'MOSTRADOR':
      return <Store className={cls} aria-label="Mostrador" />;
    default:
      return <UtensilsCrossed className={cls} aria-label={CHANNEL_LABEL[channel]} />;
  }
}

export function ChannelBadge({ channel }: { channel: OrderChannel }) {
  return (
    <span className="chip bg-surface-sunken text-ink-soft" title={`Canal: ${CHANNEL_LABEL[channel]}`}>
      <ChannelIcon channel={channel} className="h-3.5 w-3.5" />
      {CHANNEL_LABEL[channel]}
    </span>
  );
}

export function TypeBadge({ type }: { type: OrderType }) {
  return (
    <span className={clsx('chip', type === 'DOMICILIO' ? 'bg-brand/15 text-brand' : 'bg-info/15 text-info')}>
      {type === 'DOMICILIO' ? <Bike className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
      {TYPE_SHORT[type]}
    </span>
  );
}
