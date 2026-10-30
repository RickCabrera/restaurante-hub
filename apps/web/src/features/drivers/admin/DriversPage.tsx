import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Bike, CheckCircle2, MessageCircle, Phone, UserPlus, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtTime, money } from '@/lib/format';
import { sounds } from '@/lib/sound';
import { Avatar, Button, EmptyState, ErrorState, Modal, PageHeader, Skeleton, Spinner, StatCard, toast } from '@/ui';
import {
  dk, fmtPhone, PAYMENT_LABEL, telLink, useDrivers, useOrderRealtime, waLink, type Driver, type DriverSummary, type SettleResult,
} from '@/features/delivery-common';

export function DriversPage() {
  const drivers = useDrivers();
  useOrderRealtime();
  const [selected, setSelected] = useState<Driver | null>(null);
  const list = drivers.data ?? [];
  const totalCash = list.reduce((s, d) => s + d.unsettledCashCents, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Repartidores"
        subtitle={list.length ? `${list.filter((d) => d.activeOrders).length} con pedidos · ${money(totalCash)} por liquidar` : undefined}
        actions={<Link to="/admin/equipo"><Button variant="outline" icon={<UserPlus className="h-4 w-4" />}>Agregar repartidor</Button></Link>}
      />
      {drivers.isError ? (
        <ErrorState error={drivers.error} onRetry={() => drivers.refetch()} />
      ) : drivers.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : !list.length ? (
        <EmptyState icon={<Bike className="h-7 w-7" />} title="Aún no tienes repartidores" description="Crea un usuario con el rol “Repartidor” en Equipo; entrará a /repartidor desde su celular." action={<Link to="/admin/equipo"><Button>Ir a Equipo</Button></Link>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((d) => (
            <article key={d.id} className={clsx('card p-4', !d.active && 'opacity-60')}>
              <div className="flex items-center gap-3">
                <Avatar name={d.name} color={d.avatarColor ?? undefined} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{d.name}{!d.active && <span className="ml-2 chip bg-surface-sunken text-ink-mute">Inactivo</span>}</p>
                  <p className="text-sm text-ink-mute">{d.phone ? fmtPhone(d.phone) : 'Sin teléfono'}</p>
                </div>
                {d.phone && (
                  <div className="flex gap-1">
                    <a href={telLink(d.phone)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-sunken" aria-label={`Llamar a ${d.name}`}><Phone className="h-4 w-4" /></a>
                    <a href={waLink(d.phone)} target="_blank" rel="noreferrer" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-sunken" aria-label={`WhatsApp a ${d.name}`}><MessageCircle className="h-4 w-4 text-ok" /></a>
                  </div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-surface-sunken p-2"><p className="text-xl font-bold tabular-nums">{d.activeOrders}</p><p className="text-[11px] text-ink-mute">Asignados</p></div>
                <div className="rounded-xl bg-surface-sunken p-2"><p className="text-xl font-bold tabular-nums">{d.onTheWay}</p><p className="text-[11px] text-ink-mute">En camino</p></div>
                <div className={clsx('rounded-xl p-2', d.unsettledCashCents ? 'bg-warn/15 text-warn' : 'bg-surface-sunken')}>
                  <p className="text-xl font-bold tabular-nums">{money(d.unsettledCashCents).replace('.00', '')}</p>
                  <p className="text-[11px] opacity-80">Efectivo</p>
                </div>
              </div>
              <Button block variant={d.unsettledCashCents ? 'primary' : 'outline'} className="mt-3" icon={<Wallet className="h-4 w-4" />} onClick={() => setSelected(d)}>
                {d.unsettledCashCents ? `Ver y liquidar ${money(d.unsettledCashCents)}` : 'Ver resumen del día'}
              </Button>
            </article>
          ))}
        </div>
      )}
      {selected && <DriverSheet driver={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DriverSheet({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  const qc = useQueryClient();
  const sum = useQuery({ queryKey: ['driver-summary', driver.id], queryFn: () => api.get<DriverSummary>(`/drivers/${driver.id}/summary`) });
  const [confirming, setConfirming] = useState(false);
  const [settling, setSettling] = useState(false);
  const [result, setResult] = useState<SettleResult | null>(null);

  const settle = async () => {
    setSettling(true);
    try {
      const r = await api.post<SettleResult>(`/drivers/${driver.id}/settle`);
      setResult(r);
      setConfirming(false);
      sounds.success();
      void qc.invalidateQueries({ queryKey: dk.drivers });
      void qc.invalidateQueries({ queryKey: ['driver-summary', driver.id] });
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSettling(false);
    }
  };

  const s = sum.data;
  return (
    <Modal open onClose={onClose} title={driver.name} size="md"
      footer={result ? <Button onClick={onClose}>Listo</Button> : s?.cashToSettleCents ? (
        confirming ? (
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Volver</Button>
            <Button variant="success" size="lg" loading={settling} onClick={settle} icon={<CheckCircle2 className="h-5 w-5" />}>Recibí {money(s.cashToSettleCents)}</Button>
          </>
        ) : (
          <Button size="lg" block icon={<Wallet className="h-5 w-5" />} onClick={() => setConfirming(true)}>Liquidar {money(s.cashToSettleCents)}</Button>
        )
      ) : <Button variant="ghost" onClick={onClose}>Cerrar</Button>}>
      {sum.isLoading ? (
        <div className="grid place-items-center py-10"><Spinner /></div>
      ) : sum.isError || !s ? (
        <ErrorState error={sum.error} onRetry={() => sum.refetch()} />
      ) : result ? (
        <div className="py-4 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-12 w-12 text-ok" />
          <p className="h-display text-2xl font-bold">{money(result.totalCents)}</p>
          <p className="text-ink-soft">Liquidados {result.ordersCount} pedido{result.ordersCount === 1 ? '' : 's'} de {result.driverName}</p>
          <p className={clsx('mx-auto mt-3 max-w-sm rounded-xl px-3 py-2 text-sm', result.cashSessionId ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn')}>
            {result.cashSessionId ? 'Se registró como entrada en la caja abierta.' : 'No hay caja abierta: guarda el efectivo y regístralo al abrir caja.'}
          </p>
          <p className="mt-2 text-xs text-ink-mute">{fmtTime(result.settledAt)}</p>
        </div>
      ) : confirming ? (
        <div>
          <p className="mb-3 text-sm text-ink-soft">Confirma que recibiste el efectivo de estos pedidos entregados:</p>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {s.unsettledOrders.map((o) => (
              <li key={o.id} className="flex justify-between px-3 py-2 text-sm"><span className="font-medium">{o.folio}</span><span className="tabular-nums">{money(o.totalCents)}</span></li>
            ))}
            <li className="flex justify-between bg-surface-sunken px-3 py-2.5 font-bold"><span>Total a recibir</span><span className="tabular-nums">{money(s.cashToSettleCents)}</span></li>
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Entregas hoy" value={s.deliveredCount} />
            <StatCard label="Cobrado hoy" value={money(s.deliveredTotalCents)} hint={`Envíos ${money(s.deliveryFeesCents)}`} />
          </div>
          <div>
            <p className="label">Por método de pago (hoy)</p>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              {s.byMethod.map((m) => (
                <div key={m.method} className="rounded-xl bg-surface-sunken p-2">
                  <p className="font-semibold tabular-nums">{money(m.totalCents)}</p>
                  <p className="text-xs text-ink-mute">{PAYMENT_LABEL[m.method]} · {m.count}</p>
                </div>
              ))}
            </div>
          </div>
          <div className={clsx('rounded-2xl p-4', s.cashToSettleCents ? 'bg-warn/10' : 'bg-surface-sunken')}>
            <p className="text-sm text-ink-soft">Efectivo por liquidar</p>
            <p className={clsx('h-display text-3xl font-bold', s.cashToSettleCents ? 'text-warn' : '')}>{money(s.cashToSettleCents)}</p>
            <p className="text-xs text-ink-mute">{s.unsettledOrders.length} pedido{s.unsettledOrders.length === 1 ? '' : 's'} en efectivo sin liquidar</p>
          </div>
          {s.deliveries.length > 0 && (
            <div>
              <p className="label">Entregas de hoy</p>
              <ul className="divide-y divide-line text-sm">
                {s.deliveries.map((o) => (
                  <li key={o.id}>
                    <Link to={`/admin/pedidos/${o.id}`} className="flex items-center gap-2 py-2 hover:text-brand">
                      <span className="font-medium">{o.folio}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-mute">{o.customerName}</span>
                      <span className="text-xs text-ink-mute">{o.paymentMethod ? PAYMENT_LABEL[o.paymentMethod] : ''} · {fmtTime(o.deliveredAt)}</span>
                      <span className="tabular-nums">{money(o.totalCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
