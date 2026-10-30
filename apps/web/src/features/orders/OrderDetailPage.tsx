import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Bike, Copy, ExternalLink, MapPin, MessageCircle, Phone, StickyNote, User } from 'lucide-react';
import type { OrderStatus } from '@rh/shared';
import { api } from '@/lib/api';
import { fmtDateTime, fmtTime, money } from '@/lib/format';
import { Avatar, Button, ErrorState, PageLoader, toast } from '@/ui';
import {
  ChannelBadge, dk, fmtPhone, MapView, OrderStatusBadge, STATUS_META, TypeBadge, telLink, useOrderRealtime, waLink, type OrderView,
} from '@/features/delivery-common';
import { OrderActions, DriverPickerModal } from './actions';
import { ElapsedChip, shortFolio } from './OrderCard';
import { useState } from 'react';

function timeline(o: OrderView): { status: OrderStatus; label: string; at: string | null }[] {
  const base: { status: OrderStatus; at: string | null }[] = [
    { status: 'NUEVO', at: o.createdAt },
    { status: 'ACEPTADO', at: o.acceptedAt },
    { status: 'EN_PREPARACION', at: o.preparingAt },
    { status: 'LISTO', at: o.readyAt },
  ];
  if (o.type === 'DOMICILIO') base.push({ status: 'EN_CAMINO', at: o.dispatchedAt }, { status: 'ENTREGADO', at: o.deliveredAt });
  else base.push({ status: 'RECOGIDO', at: o.deliveredAt });
  if (o.status === 'RECHAZADO' || o.status === 'CANCELADO') {
    const done = base.filter((b) => b.at);
    done.push({ status: o.status, at: o.cancelledAt ?? o.updatedAt ?? null });
    return done.map((b) => ({ ...b, label: STATUS_META[b.status].label }));
  }
  return base.map((b) => ({ ...b, label: STATUS_META[b.status].label }));
}

async function copy(text: string, msg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(msg);
  } catch {
    window.prompt('Copia el enlace', text);
  }
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: dk.order(id), queryFn: () => api.get<OrderView>(`/orders/${id}`) });
  useOrderRealtime();
  const [driverOpen, setDriverOpen] = useState(false);

  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;
  const tl = timeline(o);
  const closed = ['ENTREGADO', 'RECOGIDO', 'RECHAZADO', 'CANCELADO'].includes(o.status);

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/admin/pedidos" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-mute hover:text-ink"><ArrowLeft className="h-4 w-4" />Pedidos</Link>
      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="h-display text-3xl font-bold">{shortFolio(o.folio)}</h1>
            <OrderStatusBadge status={o.status} pulse className="!text-sm" />
            {!closed && <ElapsedChip order={o} />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-mute">
            <ChannelBadge channel={o.channel} />
            <TypeBadge type={o.type} />
            <span>{fmtDateTime(o.createdAt)}</span>
            {o.estimatedMinutes && !closed && <span>· estimado {o.estimatedMinutes} min</span>}
          </div>
        </div>
        <Button variant="outline" icon={<Copy className="h-4 w-4" />} onClick={() => copy(o.trackingUrl, 'Enlace de seguimiento copiado')} className="hidden sm:inline-flex">Copiar seguimiento</Button>
      </div>

      {(o.rejectReason || o.cancelReason) && (
        <div className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger"><b>{o.status === 'RECHAZADO' ? 'Rechazado' : 'Cancelado'}:</b> {o.rejectReason ?? o.cancelReason}</div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {/* Acciones */}
          {!['RECHAZADO', 'CANCELADO'].includes(o.status) && (
            <section className="card p-4"><OrderActions order={o} /></section>
          )}

          {/* Productos */}
          <section className="card p-4">
            <h2 className="h-display mb-3 font-semibold">Productos</h2>
            <ul className="divide-y divide-line">
              {o.items.map((it) => (
                <li key={it.id} className="flex gap-3 py-2.5">
                  <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-brand/15 px-1.5 text-sm font-bold text-brand">{it.quantity}×</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{it.productName}</p>
                    {it.modifiers.length > 0 && (
                      <ul className="text-sm text-ink-mute">
                        {it.modifiers.map((m, i) => (
                          <li key={i}>{m.groupName}: {m.name}{m.priceCents > 0 && ` (+${money(m.priceCents)})`}</li>
                        ))}
                      </ul>
                    )}
                    {it.note && <p className="mt-0.5 flex items-center gap-1 text-sm text-warn"><StickyNote className="h-3.5 w-3.5" />{it.note}</p>}
                  </div>
                  <span className="font-semibold tabular-nums">{money(it.totalCents)}</span>
                </li>
              ))}
            </ul>
            {o.notes && <p className="mt-2 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn"><b>Nota del cliente:</b> {o.notes}</p>}
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <Row label="Subtotal" value={money(o.subtotalCents)} />
              {o.discountCents > 0 && <Row label={`Descuento${o.couponCode ? ` (${o.couponCode})` : ''}`} value={`−${money(o.discountCents)}`} className="text-ok" />}
              {o.type === 'DOMICILIO' && <Row label="Envío" value={o.deliveryFeeCents ? money(o.deliveryFeeCents) : 'Gratis'} />}
              <Row label="Total" value={money(o.totalCents)} className="pt-1 text-lg font-bold" />
            </dl>
          </section>

          {/* Pago */}
          <section className="card p-4">
            <h2 className="h-display mb-2 font-semibold">Pago</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip bg-surface-sunken text-ink-soft !text-sm">{o.paymentLabel}</span>
              <span className={clsx('chip !text-sm', o.paid ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn')}>{o.paid ? 'Pagado' : 'Por cobrar'}</span>
            </div>
            {o.paymentMethod === 'EFECTIVO' && o.cashGivenCents != null && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-surface-sunken p-3"><p className="text-xs text-ink-mute">Paga con</p><p className="text-lg font-bold tabular-nums">{money(o.cashGivenCents)}</p></div>
                <div className="rounded-2xl bg-brand/10 p-3"><p className="text-xs text-brand">Llevar cambio</p><p className="text-lg font-bold tabular-nums text-brand">{money(o.changeCents ?? 0)}</p></div>
              </div>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          {/* Cliente */}
          <section className="card p-4">
            <div className="flex items-center gap-3">
              <Avatar name={o.customerName} size={44} color="rgb(var(--brand))" />
              <div className="min-w-0 flex-1">
                <Link to={`/admin/clientes/${o.customerId}`} className="block truncate font-semibold hover:underline">{o.customerName}</Link>
                <p className="text-sm text-ink-mute">{fmtPhone(o.customerPhone)}{o.customerOrdersCount != null && ` · ${o.customerOrdersCount} pedido${o.customerOrdersCount === 1 ? '' : 's'}`}</p>
              </div>
              {o.customerOrdersCount === 1 && <span className="chip bg-brand/15 text-brand">Nuevo</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={telLink(o.customerPhone)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line font-medium hover:bg-surface-sunken"><Phone className="h-4 w-4" />Llamar</a>
              <a href={waLink(o.customerPhone)} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line font-medium hover:bg-surface-sunken"><MessageCircle className="h-4 w-4 text-ok" />WhatsApp</a>
            </div>
          </section>

          {/* Entrega */}
          {o.type === 'DOMICILIO' ? (
            <section className="card p-4">
              <h2 className="h-display mb-2 flex items-center gap-1.5 font-semibold"><MapPin className="h-4 w-4 text-brand" />Entrega</h2>
              <p className="font-medium">{o.addressText ?? 'Sin dirección'}</p>
              {o.addressRefs && <p className="text-sm text-ink-mute">Referencias: {o.addressRefs}</p>}
              {o.lat != null && o.lng != null && (
                <MapView className="mt-3" height={220} markers={[{ id: 'o', lat: o.lat, lng: o.lng, color: 'rgb(var(--brand))' }]} />
              )}
              {o.mapsUrl && (
                <a href={o.mapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">Abrir en Google Maps<ExternalLink className="h-3.5 w-3.5" /></a>
              )}
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface-sunken p-3">
                <Bike className="h-5 w-5 text-ink-mute" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink-mute">Repartidor</p>
                  <p className="font-medium">{o.driver?.name ?? 'Sin asignar'}</p>
                </div>
                {!closed && <Button size="sm" variant={o.driver ? 'outline' : 'primary'} onClick={() => setDriverOpen(true)}>{o.driver ? 'Cambiar' : 'Asignar'}</Button>}
              </div>
            </section>
          ) : (
            <section className="card flex items-center gap-3 p-4">
              <User className="h-5 w-5 text-info" />
              <p className="text-sm">El cliente pasa a recoger{o.branchName ? ` en ${o.branchName}` : ''}.</p>
            </section>
          )}

          {/* Línea de tiempo */}
          <section className="card p-4">
            <h2 className="h-display mb-3 font-semibold">Seguimiento</h2>
            <ol className="relative space-y-3 pl-6">
              <span className="absolute bottom-2 left-[7px] top-2 w-0.5 bg-line" aria-hidden />
              {tl.map((s) => (
                <li key={s.status} className="relative">
                  <span className={clsx('absolute -left-6 top-0.5 h-4 w-4 rounded-full border-2', s.at ? 'border-transparent' : 'border-line bg-surface-raised')} style={s.at ? { background: STATUS_META[s.status].dot } : undefined} />
                  <p className={clsx('text-sm', s.at ? 'font-semibold' : 'text-ink-mute')}>{s.label}</p>
                  {s.at && <p className="text-xs text-ink-mute">{fmtTime(s.at)}</p>}
                </li>
              ))}
            </ol>
            <button onClick={() => copy(o.trackingUrl, 'Enlace copiado')} className="mt-4 flex w-full items-center gap-2 rounded-xl bg-surface-sunken px-3 py-2 text-left text-xs text-ink-mute hover:text-ink">
              <Copy className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 truncate">{o.trackingUrl}</span>
            </button>
          </section>
        </div>
      </div>
      <DriverPickerModal order={o} open={driverOpen} onClose={() => setDriverOpen(false)} />
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={clsx('flex justify-between gap-3', className)}>
      <dt className={clsx(!className?.includes('font-bold') && 'text-ink-mute')}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
