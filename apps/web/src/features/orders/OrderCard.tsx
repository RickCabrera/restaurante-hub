import clsx from 'clsx';
import '@/features/delivery-common/delivery.css';
import { Bike, Clock, MapPin, StickyNote } from 'lucide-react';
import { money, minutesSince } from '@/lib/format';
import { ChannelIcon, CHANNEL_LABEL, fmtElapsed, OrderStatusBadge, TypeBadge, type OrderView } from '@/features/delivery-common';
import { OrderActions } from './actions';

/** P-000123 → P-123 */
export const shortFolio = (f: string) => f.replace(/^([A-Z]+-)0+(?=\d)/, '$1');

/** Tono del tiempo transcurrido: pedidos nuevos esperan poco; los demás contra su tiempo estimado. */
export function orderTimeTone(o: OrderView): 'ok' | 'warn' | 'danger' {
  const m = minutesSince(o.createdAt);
  if (o.status === 'NUEVO') return m >= 8 ? 'danger' : m >= 3 ? 'warn' : 'ok';
  const eta = o.estimatedMinutes ?? 40;
  return m >= eta ? 'danger' : m >= eta * 0.75 ? 'warn' : 'ok';
}

const toneText = { ok: 'text-ink-mute', warn: 'text-warn', danger: 'text-danger' };

export function ElapsedChip({ order }: { order: OrderView }) {
  const tone = orderTimeTone(order);
  return (
    <span className={clsx('inline-flex items-center gap-1 text-sm font-semibold tabular-nums', toneText[tone])} title="Tiempo desde que llegó">
      <Clock className="h-3.5 w-3.5" />
      {fmtElapsed(minutesSince(order.createdAt))}
    </span>
  );
}

export function OrderCard({ order, flash, onOpen, onAccepted }: { order: OrderView; flash?: boolean; onOpen: () => void; onAccepted?: () => void }) {
  const items = order.items;
  const preview = items.slice(0, 3);
  const isNew = order.status === 'NUEVO';
  return (
    <article
      // Ignora clics que vienen de modales (portales) de las acciones
      onClick={(e) => e.currentTarget.contains(e.target as Node) && onOpen()}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onOpen()}
      tabIndex={0}
      aria-label={`Pedido ${order.folio} de ${order.customerName}`}
      className={clsx(
        'card cursor-pointer p-3.5 transition hover:shadow-lift focus-within:ring-2 focus-within:ring-brand/40',
        isNew && 'border-brand/60',
        flash && 'rh-order-flash',
      )}
    >
      <header className="flex items-center gap-2">
        <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', isNew ? 'bg-brand text-white' : 'bg-surface-sunken text-ink-soft')} title={CHANNEL_LABEL[order.channel]}>
          <ChannelIcon channel={order.channel} className="h-4 w-4" />
        </span>
        <span className="h-display whitespace-nowrap text-lg font-bold leading-none">{shortFolio(order.folio)}</span>
        <span className="ml-auto"><ElapsedChip order={order} /></span>
      </header>
      <div className="mt-2 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-medium">{order.customerName}</p>
        <p className="font-bold tabular-nums">{money(order.totalCents)}</p>
      </div>

      <ul className="mt-2 space-y-0.5 text-sm">
        {preview.map((it) => (
          <li key={it.id} className="flex gap-1.5">
            <span className="font-semibold tabular-nums text-brand">{it.quantity}×</span>
            <span className="min-w-0 flex-1 truncate">
              {it.productName}
              {it.modifiers.length > 0 && <span className="text-ink-mute"> · {it.modifiers.map((m) => m.name).join(', ')}</span>}
            </span>
          </li>
        ))}
        {items.length > 3 && <li className="text-xs text-ink-mute">+{items.length - 3} producto{items.length - 3 > 1 ? 's' : ''} más</li>}
      </ul>

      {(order.notes || order.addressText) && (
        <div className="mt-2 space-y-0.5 text-xs text-ink-mute">
          {order.type === 'DOMICILIO' && order.addressText && <p className="flex gap-1 truncate"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{order.addressText}</span></p>}
          {order.notes && <p className="flex gap-1 text-warn"><StickyNote className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{order.notes}</span></p>}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
        <TypeBadge type={order.type} />
        {!isNew && <OrderStatusBadge status={order.status} />}
        <span className={clsx('chip', order.paid ? 'bg-ok/15 text-ok' : 'bg-surface-sunken text-ink-soft')}>
          {order.paymentLabel}{order.paid ? ' · pagado' : order.changeCents ? ` · cambio ${money(order.changeCents)}` : ''}
        </span>
        {order.driver && (
          <span className="chip bg-surface-sunken text-ink-soft"><Bike className="h-3.5 w-3.5" />{order.driver.name.split(' ')[0]}</span>
        )}
      </div>

      <div className="mt-3">
        <OrderActions order={order} compact onAccepted={onAccepted} />
      </div>
    </article>
  );
}
