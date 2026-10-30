import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Banknote, Bike, CheckCircle2, ChevronDown, CreditCard, Landmark, LogOut, MapPin, MessageCircle, Navigation, Phone, RefreshCw, Wifi, WifiOff,
} from 'lucide-react';
import { RT, PaymentMethodLabel } from '@rh/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { useRealtime, useSocketStatus, disconnectSocket } from '@/lib/socket';
import { fmtTime, money, timeAgo } from '@/lib/format';
import { sounds, vibrate } from '@/lib/sound';
import { Modal, Button, Spinner, toast } from '@/ui';
import type { DriverOrder, DriverSummary } from './types';

const ACTIVE = ['ACEPTADO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO'];
const digits = (s?: string | null) => (s ?? '').replace(/\D/g, '');
const wa = (p?: string | null) => {
  const d = digits(p);
  return `https://wa.me/${d.length === 10 ? `52${d}` : d}`;
};
const gmaps = (o: DriverOrder) =>
  o.lat != null && o.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.addressText ?? '')}`;
const waze = (o: DriverOrder) =>
  o.lat != null && o.lng != null ? `https://waze.com/ul?ll=${o.lat},${o.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(o.addressText ?? '')}&navigate=yes`;

const PAY_ICON = { EFECTIVO: Banknote, TARJETA: CreditCard, TRANSFERENCIA: Landmark } as const;

/** /repartidor — app del repartidor en el celular (DRV-01). */
export function DriverApp() {
  const [tab, setTab] = useState<'pedidos' | 'dia'>('pedidos');
  const nav = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => (s.session?.kind === 'user' ? s.session.user : null));
  const connected = useSocketStatus();

  const orders = useQuery({
    queryKey: ['driver-orders'],
    queryFn: () => api.get<DriverOrder[]>('/driver/orders'),
    refetchInterval: 30_000,
  });
  const summary = useQuery({ queryKey: ['driver-summary'], queryFn: () => api.get<DriverSummary>('/driver/summary'), refetchInterval: 60_000 });

  // Avisar con sonido + vibración cuando llega un pedido nuevo
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!orders.data) return;
    const ids = new Set(orders.data.map((o) => o.id));
    if (known.current) {
      const fresh = orders.data.filter((o) => !known.current!.has(o.id));
      if (fresh.length) {
        sounds.newOrder();
        vibrate([200, 100, 200, 100, 300]);
        toast.info(fresh.length === 1 ? `Nuevo pedido ${fresh[0].folio}` : `${fresh.length} pedidos nuevos`, fresh[0].addressText ?? undefined);
      }
    }
    known.current = ids;
  }, [orders.data]);

  useRealtime<DriverOrder & { driverSettlement?: unknown }>(RT.ORDER_UPDATED, (o) => {
    if ((o as { driverSettlement?: unknown }).driverSettlement || !o?.id) {
      void qc.invalidateQueries({ queryKey: ['driver-summary'] });
      return;
    }
    qc.setQueryData<DriverOrder[]>(['driver-orders'], (prev = []) => {
      const mine = o.driverId === user?.id && ACTIVE.includes(o.status);
      const rest = prev.filter((x) => x.id !== o.id);
      return mine ? [...rest, o].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : rest;
    });
    if (['ENTREGADO'].includes(o.status)) void qc.invalidateQueries({ queryKey: ['driver-summary'] });
  });

  const logout = () => {
    useAuth.getState().logout();
    disconnectSocket();
    qc.clear();
    nav('/login', { replace: true });
  };

  const list = orders.data ?? [];
  const s = summary.data;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-surface-raised/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-white"><Bike className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold leading-tight">{user?.name ?? 'Repartidor'}</p>
            <p className={clsx('flex items-center gap-1 text-xs font-medium', connected ? 'text-ok' : 'text-warn')}>
              {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />} {connected ? 'En línea' : 'Reconectando…'}
            </p>
          </div>
          <button onClick={logout} className="grid h-11 w-11 place-items-center rounded-xl border border-line text-ink-soft" aria-label="Cerrar sesión">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        <button onClick={() => setTab('dia')} className="mt-3 flex w-full items-center justify-between rounded-2xl bg-surface-sunken px-4 py-2.5 text-left">
          <span className="text-sm text-ink-soft">Hoy: <b className="text-ink">{s?.deliveredCount ?? '—'}</b> {s?.deliveredCount === 1 ? 'entrega' : 'entregas'}</span>
          <span className="text-sm text-ink-soft">Efectivo por entregar: <b className="text-ink tabular-nums">{s ? money(s.cashToSettleCents) : '—'}</b></span>
        </button>
      </header>

      <main className="flex-1 px-3 pb-28 pt-3">
        {tab === 'pedidos' ? (
          orders.isLoading ? (
            <div className="grid h-60 place-items-center"><Spinner className="h-8 w-8 text-brand" /></div>
          ) : orders.error ? (
            <div className="py-16 text-center">
              <p className="font-semibold">No se pudieron cargar tus pedidos</p>
              <Button className="mt-4" size="lg" onClick={() => orders.refetch()} icon={<RefreshCw className="h-5 w-5" />}>Reintentar</Button>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <span className="text-6xl">🛵</span>
              <p className="mt-4 text-xl font-bold">Sin pedidos asignados</p>
              <p className="mt-1 max-w-xs text-ink-mute">Cuando te asignen uno, sonará y vibrará tu celular. Mantén esta pantalla abierta.</p>
              <Button variant="outline" size="lg" className="mt-6" onClick={() => orders.refetch()} loading={orders.isFetching} icon={<RefreshCw className="h-5 w-5" />}>Actualizar</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {list.map((o) => <OrderCard key={o.id} o={o} />)}
            </div>
          )
        ) : (
          <MyDay s={s} loading={summary.isLoading} />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)]">
        {(
          [
            ['pedidos', 'Mis pedidos', list.length],
            ['dia', 'Mi día', 0],
          ] as const
        ).map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx('relative flex h-16 items-center justify-center gap-2 text-base font-bold', tab === k ? 'text-brand' : 'text-ink-mute')}>
            {tab === k && <span className="absolute inset-x-8 top-0 h-1 rounded-b-full bg-brand" />}
            {label}
            {n > 0 && <span className="rounded-full bg-brand px-2 text-sm text-white">{n}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

function OrderCard({ o }: { o: DriverOrder }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const onTheWay = o.status === 'EN_CAMINO';
  const toCollect = o.paid || o.paymentMethod === 'TRANSFERENCIA' ? 0 : o.totalCents;
  const PayIcon = PAY_ICON[o.paymentMethod] ?? Banknote;

  const act = async (kind: 'dispatch' | 'delivered') => {
    setBusy(true);
    try {
      const updated = await api.post<DriverOrder>(`/driver/orders/${o.id}/${kind}`);
      qc.setQueryData<DriverOrder[]>(['driver-orders'], (prev = []) =>
        kind === 'delivered' ? prev.filter((x) => x.id !== o.id) : prev.map((x) => (x.id === o.id ? { ...x, ...updated } : x)),
      );
      if (kind === 'delivered') {
        sounds.success();
        toast.success(`${o.folio} entregado`, toCollect ? `Cobraste ${money(toCollect)}` : undefined);
        void qc.invalidateQueries({ queryKey: ['driver-summary'] });
      } else toast.success('¡Buen viaje!', 'Avisamos al cliente que vas en camino');
      vibrate(30);
    } catch (e) {
      toast.fromError(e);
      sounds.error();
      void qc.invalidateQueries({ queryKey: ['driver-orders'] });
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  return (
    <article className={clsx('overflow-hidden rounded-3xl border-2 bg-surface-raised shadow-card', onTheWay ? 'border-brand' : 'border-line')}>
      <div className={clsx('flex items-center justify-between px-4 py-2.5', onTheWay ? 'bg-brand text-white' : 'bg-surface-sunken')}>
        <span className="font-mono text-lg font-bold">{o.folio}</span>
        <span className="text-sm font-bold">{onTheWay ? `En camino · ${timeAgo(o.dispatchedAt)}` : o.statusLabel}</span>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <p className="text-2xl font-bold leading-tight">{o.customerName ?? 'Cliente'}</p>
          <p className="mt-2 flex items-start gap-2 text-lg leading-snug">
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-brand" /> {o.addressText ?? 'Sin dirección'}
          </p>
          {o.addressRefs && <p className="ml-7 mt-1 rounded-xl bg-warn/10 px-3 py-2 text-base text-ink">📝 {o.addressRefs}</p>}
          {o.notes && <p className="ml-7 mt-1 text-sm italic text-ink-soft">Nota: {o.notes}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a href={gmaps(o)} target="_blank" rel="noreferrer" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-info text-base font-bold text-white">
            <Navigation className="h-5 w-5" /> Google Maps
          </a>
          <a href={waze(o)} target="_blank" rel="noreferrer" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#33CCFF] text-base font-bold text-[#0b2b3a]">
            <Navigation className="h-5 w-5" /> Waze
          </a>
          {o.customerPhone && (
            <>
              <a href={`tel:${digits(o.customerPhone)}`} className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-line text-base font-bold">
                <Phone className="h-5 w-5" /> Llamar
              </a>
              <a href={wa(o.customerPhone)} target="_blank" rel="noreferrer" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-base font-bold text-white">
                <MessageCircle className="h-5 w-5" /> WhatsApp
              </a>
            </>
          )}
        </div>

        <div className="rounded-2xl bg-surface-sunken p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold"><PayIcon className="h-5 w-5" /> {o.paymentLabel ?? PaymentMethodLabel[o.paymentMethod]}</span>
            {o.paid && <span className="chip bg-ok/15 text-ok">Pagado</span>}
          </div>
          <p className="mt-1 text-sm text-ink-mute">{toCollect ? 'Cobrar al cliente' : o.paymentMethod === 'TRANSFERENCIA' ? 'Pago por transferencia: no cobrar' : 'Ya pagado: no cobrar'}</p>
          <p className="text-4xl font-extrabold tabular-nums">{money(toCollect)}</p>
          {o.paymentMethod === 'EFECTIVO' && o.cashGivenCents != null && o.cashGivenCents > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-base">
              <div className="rounded-xl bg-surface-raised px-3 py-2">Paga con<br /><b className="tabular-nums">{money(o.cashGivenCents)}</b></div>
              <div className="rounded-xl bg-ok/15 px-3 py-2 text-ok">Llevar cambio<br /><b className="tabular-nums">{money(o.changeCents ?? Math.max(0, o.cashGivenCents - o.totalCents))}</b></div>
            </div>
          )}
        </div>

        <div>
          <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between py-1 text-base font-semibold" aria-expanded={open}>
            {o.items.reduce((s, i) => s + i.quantity, 0)} productos
            <ChevronDown className={clsx('h-5 w-5 transition', open && 'rotate-180')} />
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5 text-base">
              {o.items.map((it) => (
                <li key={it.id}>
                  <b>{it.quantity}×</b> {it.productName}
                  {it.modifiers.length > 0 && <span className="block pl-6 text-sm text-ink-mute">{it.modifiers.map((m) => m.name).join(' · ')}</span>}
                  {it.note && <span className="block pl-6 text-sm italic text-ink-mute">“{it.note}”</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {onTheWay ? (
          <button onClick={() => setConfirmOpen(true)} disabled={busy} className="flex h-20 w-full items-center justify-center gap-3 rounded-2xl bg-ok text-2xl font-extrabold text-white shadow-lift active:scale-[0.98] disabled:opacity-60">
            {busy ? <Spinner className="h-7 w-7" /> : <CheckCircle2 className="h-8 w-8" />} Entregado
          </button>
        ) : (
          <button onClick={() => act('dispatch')} disabled={busy} className="flex h-20 w-full items-center justify-center gap-3 rounded-2xl bg-brand text-2xl font-extrabold text-white shadow-lift active:scale-[0.98] disabled:opacity-60">
            {busy ? <Spinner className="h-7 w-7" /> : <Bike className="h-8 w-8" />} Salí a entregar
          </button>
        )}
        {!onTheWay && o.status !== 'LISTO' && <p className="-mt-2 text-center text-xs text-ink-mute">La cocina aún lo marca como “{o.statusLabel}”. Al salir se marca como listo.</p>}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`¿Entregaste ${o.folio}?`}
        size="sm"
        footer={
          <div className="grid w-full grid-cols-2 gap-2">
            <Button variant="outline" size="xl" onClick={() => setConfirmOpen(false)}>No</Button>
            <Button variant="success" size="xl" loading={busy} onClick={() => act('delivered')}>Sí, entregado</Button>
          </div>
        }
      >
        <div className="py-2 text-center">
          <p className="text-ink-soft">{toCollect ? 'Confirma que cobraste' : 'Sin cobro'}</p>
          <p className="text-5xl font-extrabold tabular-nums">{money(toCollect)}</p>
          <p className="mt-1 text-sm text-ink-mute">{o.paymentLabel}</p>
        </div>
      </Modal>
    </article>
  );
}

function MyDay({ s, loading }: { s?: DriverSummary; loading: boolean }) {
  if (loading || !s) return <div className="grid h-60 place-items-center"><Spinner className="h-8 w-8 text-brand" /></div>;
  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-brand p-5 text-white">
        <p className="text-sm text-white/85">Efectivo por entregar a caja</p>
        <p className="text-5xl font-extrabold tabular-nums">{money(s.cashToSettleCents)}</p>
        <p className="mt-1 text-sm text-white/85">{s.unsettledOrders.length} {s.unsettledOrders.length === 1 ? 'pedido' : 'pedidos'} sin corte</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4"><p className="text-sm text-ink-mute">Entregas hoy</p><p className="text-3xl font-bold">{s.deliveredCount}</p></div>
        <div className="card p-4"><p className="text-sm text-ink-mute">Total entregado</p><p className="text-2xl font-bold tabular-nums">{money(s.deliveredTotalCents)}</p></div>
      </div>
      <div className="card divide-y divide-line">
        {s.byMethod.map((m) => {
          const Icon = PAY_ICON[m.method] ?? Banknote;
          return (
            <div key={m.method} className="flex items-center justify-between px-4 py-3 text-base">
              <span className="flex items-center gap-2"><Icon className="h-5 w-5 text-ink-mute" /> {PaymentMethodLabel[m.method]} <span className="text-sm text-ink-mute">({m.count})</span></span>
              <b className="tabular-nums">{money(m.totalCents)}</b>
            </div>
          );
        })}
      </div>
      <h2 className="px-1 pt-2 text-lg font-bold">Entregas</h2>
      {s.deliveries.length === 0 ? (
        <p className="px-1 text-ink-mute">Aún no tienes entregas hoy.</p>
      ) : (
        <ul className="card divide-y divide-line">
          {s.deliveries.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-mono font-bold">{d.folio}</p>
                <p className="text-sm text-ink-mute">{d.customerName ?? 'Cliente'} · {fmtTime(d.deliveredAt)} · {PaymentMethodLabel[d.paymentMethod]}</p>
              </div>
              <b className="tabular-nums">{money(d.totalCents)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
