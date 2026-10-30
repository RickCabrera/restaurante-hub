import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { BellOff, BellRing, History, LayoutGrid, Plus, Search, X } from 'lucide-react';
import type { OrderChannel, OrderStatus, OrderType } from '@rh/shared';
import { api } from '@/lib/api';
import { money, fmtDateTime } from '@/lib/format';
import { sounds, vibrate } from '@/lib/sound';
import { setBadge } from '@/app/badges';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton, Tabs, toast } from '@/ui';
import {
  ChannelIcon, CHANNEL_LABEL, OrderStatusBadge, STATUS_META, TypeBadge, toLocalDateInput, startOfLocalDay, endOfLocalDay,
  phoneDigits, useOrderRealtime, type OrderView,
} from '@/features/delivery-common';
import { OrderCard, shortFolio } from './OrderCard';
import { StoreBanner } from './StoreBanner';

type ColKey = 'new' | 'prep' | 'ready' | 'route';
const COLUMNS: { key: ColKey; label: string; short: string; statuses: OrderStatus[]; color: string }[] = [
  { key: 'new', label: 'Nuevos', short: 'Nuevos', statuses: ['NUEVO'], color: STATUS_META.NUEVO.dot },
  { key: 'prep', label: 'En preparación', short: 'Cocina', statuses: ['ACEPTADO', 'EN_PREPARACION'], color: STATUS_META.ACEPTADO.dot },
  { key: 'ready', label: 'Listos', short: 'Listos', statuses: ['LISTO'], color: STATUS_META.LISTO.dot },
  { key: 'route', label: 'En camino', short: 'En camino', statuses: ['EN_CAMINO'], color: STATUS_META.EN_CAMINO.dot },
];
const CHANNELS: OrderChannel[] = ['WHATSAPP', 'WEB', 'TELEFONO', 'MOSTRADOR'];

function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function MonitorPage() {
  const [params, setParams] = useSearchParams();
  const view = (params.get('vista') as 'tablero' | 'historial') ?? 'tablero';
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Pedidos"
        actions={
          <>
            <Tabs
              value={view}
              onChange={(v) => setParams(v === 'tablero' ? {} : { vista: v }, { replace: true })}
              items={[
                { value: 'tablero', label: <><LayoutGrid className="h-4 w-4" />En curso</> },
                { value: 'historial', label: <><History className="h-4 w-4" />Historial</> },
              ]}
            />
            <Link to="/admin/pedidos/nuevo"><Button icon={<Plus className="h-4 w-4" />}><span>Nuevo<span className="hidden sm:inline"> pedido</span></span></Button></Link>
          </>
        }
      />
      {view === 'tablero' ? <Board /> : <HistoryView />}
    </div>
  );
}

function Board() {
  useTick();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<OrderChannel | ''>('');
  const [type, setType] = useState<OrderType | ''>('');
  const [q, setQ] = useState('');
  const [mobileCol, setMobileCol] = useState<ColKey>('new');
  const [muted, setMuted] = useState(false);

  const orders = useQuery({
    queryKey: ['orders', { active: 1 }],
    queryFn: () => api.get<{ items: OrderView[]; total: number }>('/orders', { active: 1, limit: 300 }),
    refetchInterval: 60_000,
  });

  useOrderRealtime({
    onCreated: (o) => {
      if (o.status !== 'NUEVO') return;
      setMuted(false);
      sounds.newOrder();
      vibrate([200, 100, 200]);
      setMobileCol('new');
    },
  });

  const all = orders.data?.items ?? [];
  const newCount = all.filter((o) => o.status === 'NUEVO').length;

  useEffect(() => {
    setBadge('orders', newCount);
  }, [newCount]);

  // Alarma persistente cada 8 s mientras haya pedidos nuevos sin aceptar (hasta silenciar).
  const alarmOn = newCount > 0 && !muted;
  useEffect(() => {
    if (!alarmOn) return;
    const t = setInterval(() => {
      sounds.newOrder();
      vibrate([200, 100, 200]);
    }, 8000);
    return () => clearInterval(t);
  }, [alarmOn]);
  useEffect(() => {
    if (newCount === 0) setMuted(false);
  }, [newCount]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = phoneDigits(t);
    return all.filter((o) => {
      if (channel && o.channel !== channel) return false;
      if (type && o.type !== type) return false;
      if (!t) return true;
      return o.folio.toLowerCase().includes(t) || o.customerName.toLowerCase().includes(t) || (digits.length >= 3 && o.customerPhone.includes(digits));
    });
  }, [all, channel, type, q]);

  const byCol = useMemo(() => {
    const m: Record<ColKey, OrderView[]> = { new: [], prep: [], ready: [], route: [] };
    for (const c of COLUMNS) m[c.key] = filtered.filter((o) => c.statuses.includes(o.status)).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    return m;
  }, [filtered]);

  const anyFilter = !!(channel || type || q);

  return (
    <>
      <StoreBanner />
      {alarmOn && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-brand px-4 py-3 text-white shadow-lift">
          <BellRing className="h-6 w-6 shrink-0 animate-bounce motion-reduce:animate-none" />
          <p className="flex-1 font-semibold">
            {newCount === 1 ? 'Tienes 1 pedido nuevo esperando' : `Tienes ${newCount} pedidos nuevos esperando`}
            <span className="hidden text-sm font-normal opacity-90 sm:block">La alarma suena hasta que lo aceptes o la silencies.</span>
          </p>
          <Button variant="secondary" className="!bg-white/20 !text-white hover:!bg-white/30" icon={<BellOff className="h-4 w-4" />} onClick={() => setMuted(true)}>
            <span className="hidden sm:inline">Silenciar</span>
          </Button>
        </div>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input className="input h-10 pl-9 pr-8" placeholder="Folio, nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar pedido" />
          {q && <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-mute" onClick={() => setQ('')} aria-label="Limpiar búsqueda"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex gap-1 overflow-x-auto scroll-thin">
          {CHANNELS.map((c) => (
            <button key={c} onClick={() => setChannel(channel === c ? '' : c)}
              className={clsx('chip h-9 shrink-0 gap-1.5 border px-3 text-sm', channel === c ? 'border-brand bg-brand/15 text-brand' : 'border-line bg-surface-raised text-ink-soft')}
              aria-pressed={channel === c}>
              <ChannelIcon channel={c} className="h-4 w-4" />{CHANNEL_LABEL[c]}
            </button>
          ))}
          <span className="mx-1 w-px shrink-0 bg-line" />
          {(['DOMICILIO', 'PASAR_A_RECOGER'] as OrderType[]).map((t) => (
            <button key={t} onClick={() => setType(type === t ? '' : t)}
              className={clsx('chip h-9 shrink-0 border px-3 text-sm', type === t ? 'border-brand bg-brand/15 text-brand' : 'border-line bg-surface-raised text-ink-soft')}
              aria-pressed={type === t}>
              {t === 'DOMICILIO' ? 'Domicilio' : 'Recoger'}
            </button>
          ))}
        </div>
        {anyFilter && <button className="text-sm font-semibold text-brand" onClick={() => { setQ(''); setChannel(''); setType(''); }}>Quitar filtros</button>}
      </div>

      {orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
      ) : (
        <>
          {/* Celular: pestañas */}
          <div className="lg:hidden">
            <Tabs
              className="mb-3"
              value={mobileCol}
              onChange={setMobileCol}
              items={COLUMNS.map((c) => ({ value: c.key, label: c.short, count: byCol[c.key].length }))}
            />
            <Column col={COLUMNS.find((c) => c.key === mobileCol)!} items={byCol[mobileCol]} loading={orders.isLoading} onOpen={(id) => navigate(`/admin/pedidos/${id}`)} hideHeader filtered={anyFilter} />
          </div>
          {/* Escritorio: 4 columnas */}
          <div className="hidden gap-4 lg:grid lg:grid-cols-4">
            {COLUMNS.map((c) => (
              <Column key={c.key} col={c} items={byCol[c.key]} loading={orders.isLoading} onOpen={(id) => navigate(`/admin/pedidos/${id}`)} filtered={anyFilter} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

const EMPTY: Record<ColKey, string> = {
  new: 'Aquí aparecen los pedidos que llegan por WhatsApp, web o teléfono.',
  prep: 'Acepta un pedido para mandarlo a cocina.',
  ready: 'Los pedidos listos para entregar o recoger.',
  route: 'Pedidos que van con el repartidor.',
};

function Column({ col, items, loading, onOpen, hideHeader, filtered }: { col: (typeof COLUMNS)[number]; items: OrderView[]; loading: boolean; onOpen: (id: string) => void; hideHeader?: boolean; filtered: boolean }) {
  return (
    <section className="min-w-0 rounded-3xl bg-surface-sunken/60 p-2.5 lg:min-h-[60vh]">
      {!hideHeader && (
        <header className="mb-2.5 flex items-center gap-2 px-1.5 pt-1">
          <span className={clsx('h-2.5 w-2.5 rounded-full', col.key === 'new' && items.length && 'rh-pulse-brand')} style={{ background: col.color }} />
          <h2 className="h-display font-semibold">{col.label}</h2>
          <span className="ml-auto rounded-full bg-surface-raised px-2 py-0.5 text-xs font-bold tabular-nums text-ink-soft">{items.length}</span>
        </header>
      )}
      <div className="space-y-2.5">
        {loading ? (
          [0, 1].map((i) => <Skeleton key={i} className="h-44" />)
        ) : items.length ? (
          items.map((o) => <OrderCard key={o.id} order={o} flash={o.status === 'NUEVO'} onOpen={() => onOpen(o.id)} />)
        ) : (
          <p className="px-3 py-10 text-center text-sm text-ink-mute">{filtered ? 'Sin pedidos con estos filtros.' : EMPTY[col.key]}</p>
        )}
      </div>
    </section>
  );
}

// ---------------- Historial ----------------
const PAGE = 25;
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'ENTREGADO,RECOGIDO', label: 'Entregados / recogidos' },
  { value: 'CANCELADO,RECHAZADO', label: 'Cancelados / rechazados' },
  { value: 'NUEVO,ACEPTADO,EN_PREPARACION,LISTO,EN_CAMINO', label: 'En curso' },
];

function HistoryView() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(toLocalDateInput(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(toLocalDateInput());
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [page, setPage] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setDq(q.trim()); setPage(0); }, 300);
  }, [q]);
  useOrderRealtime();

  const params = { from: startOfLocalDay(from).toISOString(), to: endOfLocalDay(to).toISOString(), status: status || undefined, q: dq || undefined, limit: PAGE, offset: page * PAGE };
  const list = useQuery({ queryKey: ['orders', 'history', params], queryFn: () => api.get<{ items: OrderView[]; total: number }>('/orders', params), placeholderData: (p) => p });
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div>
      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
        <label><span className="label">Desde</span><input type="date" className="input" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /></label>
        <label><span className="label">Hasta</span><input type="date" className="input" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(0); }} /></label>
        <label><span className="label">Estado</span>
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
            {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label><span className="label">Buscar</span><input className="input" placeholder="Folio, nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !list.data?.items.length ? (
        <EmptyState icon={<History className="h-7 w-7" />} title="Sin pedidos en este periodo" description="Cambia las fechas o los filtros." />
      ) : (
        <>
          <div className="card divide-y divide-line overflow-hidden">
            {list.data.items.map((o) => (
              <button key={o.id} onClick={() => navigate(`/admin/pedidos/${o.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-sunken text-ink-soft"><ChannelIcon channel={o.channel} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{shortFolio(o.folio)}</span>
                    <OrderStatusBadge status={o.status} />
                    <span className="hidden sm:inline"><TypeBadge type={o.type} /></span>
                  </span>
                  <span className="block truncate text-sm text-ink-mute">{o.customerName} · {fmtDateTime(o.createdAt)}</span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold tabular-nums">{money(o.totalCents)}</span>
                  <span className="block text-xs text-ink-mute">{o.paymentLabel}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-ink-mute">{total} pedido{total === 1 ? '' : 's'} · página {page + 1} de {pages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
