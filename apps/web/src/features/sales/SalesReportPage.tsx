import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Ban, Bike, Download, Percent, Receipt, ShoppingBag, Timer, TrendingUp, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton, StatCard, toast } from '@/ui';
import { endOfLocalDay, PAYMENT_LABEL, startOfLocalDay, toLocalDateInput, useBranches, type SalesReport } from '@/features/delivery-common';
import './sales.css';

type Preset = 'hoy' | 'ayer' | '7d' | '30d' | 'mes' | 'custom';
const PRESETS: { value: Preset; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'ayer', label: 'Ayer' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'mes', label: 'Este mes' },
  { value: 'custom', label: 'Personalizado' },
];

function rangeFor(p: Preset, from: string, to: string): { from: string; to: string } {
  const d = (n: number) => toLocalDateInput(new Date(Date.now() + n * 864e5));
  const now = new Date();
  switch (p) {
    case 'hoy': return { from: d(0), to: d(0) };
    case 'ayer': return { from: d(-1), to: d(-1) };
    case '7d': return { from: d(-6), to: d(0) };
    case '30d': return { from: d(-29), to: d(0) };
    case 'mes': return { from: toLocalDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), to: d(0) };
    default: return { from, to };
  }
}

/** Colores categóricos fijos por entidad (no por rango) — ver sales.css. */
const CHANNEL_SLOT: Record<string, number> = { WHATSAPP: 1, WEB: 2, TELEFONO: 3, MOSTRADOR: 4, MESA: 5 };
const PAYMENT_SLOT: Record<string, number> = { EFECTIVO: 1, TARJETA: 2, TRANSFERENCIA: 3 };
const TYPE_SLOT: Record<string, number> = { DOMICILIO: 1, PASAR_A_RECOGER: 2 };

const shortMoney = (c: number) => {
  const p = c / 100;
  if (p >= 1000) return `$${(p / 1000).toFixed(p >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(p)}`;
};

export function SalesReportPage() {
  const [preset, setPreset] = useState<Preset>('7d');
  const [cFrom, setCFrom] = useState(toLocalDateInput(new Date(Date.now() - 6 * 864e5)));
  const [cTo, setCTo] = useState(toLocalDateInput());
  const [branchId, setBranchId] = useState('');
  const [metric, setMetric] = useState<'sales' | 'orders'>('sales');
  const branches = useBranches();
  const r = rangeFor(preset, cFrom, cTo);
  const query = { from: startOfLocalDay(r.from).toISOString(), to: endOfLocalDay(r.to).toISOString(), branchId: branchId || undefined };
  const rep = useQuery({ queryKey: ['reports', 'sales', query], queryFn: () => api.get<SalesReport>('/reports/sales', query), placeholderData: (p) => p });
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.download('/reports/sales.csv', `ventas_${r.from}_${r.to}.csv`, query);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setExporting(false);
    }
  };

  const d = rep.data;
  const days = useMemo(() => {
    if (!d) return [];
    // Rellenar días sin ventas para que el eje sea continuo
    const map = new Map(d.byDay.map((x) => [x.date.slice(0, 10), x]));
    const out: { date: string; label: string; salesCents: number; ordersCount: number }[] = [];
    const start = startOfLocalDay(r.from);
    const end = startOfLocalDay(r.to);
    for (let t = new Date(start); t <= end && out.length < 400; t.setDate(t.getDate() + 1)) {
      const k = toLocalDateInput(t);
      const v = map.get(k);
      out.push({ date: k, label: t.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }), salesCents: v?.salesCents ?? 0, ordersCount: v?.ordersCount ?? 0 });
    }
    return out;
  }, [d, r.from, r.to]);

  const totalCustomers = (d?.customers.newCount ?? 0) + (d?.customers.returningCount ?? 0);

  return (
    <div className="mx-auto max-w-6xl rh-sales">
      <PageHeader
        title="Reporte de ventas"
        subtitle="Pedidos de delivery: WhatsApp, web, teléfono y mostrador"
        actions={<Button variant="outline" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={exportCsv}>Exportar CSV</Button>}
      />

      {/* Filtros */}
      <div className="mb-5 flex flex-wrap items-end gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface-sunken p-1 scroll-thin">
          {PRESETS.map((p) => (
            <button key={p.value} onClick={() => setPreset(p.value)} aria-pressed={preset === p.value}
              className={clsx('shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition', preset === p.value ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-mute hover:text-ink')}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <input type="date" className="input h-10 w-auto" value={cFrom} max={cTo} onChange={(e) => setCFrom(e.target.value)} aria-label="Desde" />
            <input type="date" className="input h-10 w-auto" value={cTo} min={cFrom} onChange={(e) => setCTo(e.target.value)} aria-label="Hasta" />
          </>
        )}
        {(branches.data?.length ?? 0) > 1 && (
          <select className="input h-10 w-auto" value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-label="Sucursal">
            <option value="">Todas las sucursales</option>
            {branches.data!.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {rep.isError ? (
        <ErrorState error={rep.error} onRetry={() => rep.refetch()} />
      ) : !d ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <div className={clsx('space-y-4 transition-opacity', rep.isFetching && 'opacity-60')}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Ventas" value={money(d.totals.salesCents)} icon={<TrendingUp className="h-5 w-5" />} tone="brand" hint="Sin cancelados ni rechazados" />
            <StatCard label="Pedidos" value={d.totals.ordersCount} icon={<Receipt className="h-5 w-5" />} />
            <StatCard label="Ticket promedio" value={money(d.totals.avgTicketCents)} icon={<ShoppingBag className="h-5 w-5" />} />
            <StatCard label="Descuentos" value={money(d.totals.discountCents)} icon={<Percent className="h-5 w-5" />} />
            <StatCard label="Envíos cobrados" value={money(d.totals.deliveryFeesCents)} icon={<Bike className="h-5 w-5" />} />
            <StatCard label="Cancelados" value={d.totals.cancelledCount + d.totals.rejectedCount} icon={<Ban className="h-5 w-5" />} tone={d.totals.cancelledCount + d.totals.rejectedCount ? 'danger' : undefined} hint={`${d.totals.cancelledCount} cancelados · ${d.totals.rejectedCount} rechazados`} />
          </div>

          {!d.totals.ordersCount ? (
            <div className="card"><EmptyState icon={<Receipt className="h-7 w-7" />} title="Sin ventas en este periodo" description="Elige otro rango de fechas." /></div>
          ) : (
            <>
              <section className="card p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="h-display mr-auto font-semibold">{metric === 'sales' ? 'Ventas por día' : 'Pedidos por día'}</h2>
                  <div className="flex gap-1 rounded-lg bg-surface-sunken p-0.5 text-xs">
                    {(['sales', 'orders'] as const).map((m) => (
                      <button key={m} onClick={() => setMetric(m)} aria-pressed={metric === m} className={clsx('rounded-md px-2.5 py-1 font-semibold', metric === m ? 'bg-surface-raised shadow-sm' : 'text-ink-mute')}>{m === 'sales' ? 'Ventas' : 'Pedidos'}</button>
                    ))}
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={days} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap={days.length > 20 ? 2 : '20%'}>
                      <CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="0" />
                      <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'rgb(var(--line))' }} tick={{ fill: 'rgb(var(--ink-mute))', fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                      <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: 'rgb(var(--ink-mute))', fontSize: 11 }} tickFormatter={(v: number) => (metric === 'sales' ? shortMoney(v) : String(v))} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: 'rgb(var(--ink) / 0.05)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload as (typeof days)[number];
                          return (
                            <div className="rounded-xl border border-line bg-surface-raised px-3 py-2 text-sm shadow-lift">
                              <p className="font-semibold">{p.label}</p>
                              <p className="tabular-nums">{money(p.salesCents)}</p>
                              <p className="text-xs text-ink-mute">{p.ordersCount} pedido{p.ordersCount === 1 ? '' : 's'}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey={metric === 'sales' ? 'salesCents' : 'ordersCount'} fill="var(--s1)" radius={[4, 4, 0, 0]} maxBarSize={44} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <div className="grid gap-4 md:grid-cols-3">
                <Breakdown title="Por canal" rows={d.byChannel.map((x) => ({ key: x.channel, label: x.label, cents: x.salesCents, count: x.ordersCount, slot: CHANNEL_SLOT[x.channel] ?? 5 }))} />
                <Breakdown title="Por método de pago" rows={d.byPaymentMethod.map((x) => ({ key: x.method, label: PAYMENT_LABEL[x.method as keyof typeof PAYMENT_LABEL] ?? x.method, cents: x.salesCents, count: x.ordersCount, slot: PAYMENT_SLOT[x.method] ?? 4 }))} />
                <Breakdown title="Por tipo de servicio" rows={d.byType.map((x) => ({ key: x.type, label: x.label, cents: x.salesCents, count: x.ordersCount, slot: TYPE_SLOT[x.type] ?? 3 }))} />
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <section className="card min-w-0 p-4">
                  <h2 className="h-display mb-2 font-semibold">Productos más vendidos</h2>
                  {!d.topProducts.length ? <p className="py-6 text-center text-sm text-ink-mute">Sin datos</p> : (
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-mute"><th className="py-1.5 font-semibold">#</th><th className="font-semibold">Producto</th><th className="text-right font-semibold">Piezas</th><th className="text-right font-semibold">Venta</th></tr></thead>
                      <tbody className="divide-y divide-line">
                        {d.topProducts.slice(0, 10).map((p, i) => {
                          const max = Math.max(1, ...d.topProducts.map((x) => x.salesCents));
                          return (
                            <tr key={p.productId}>
                              <td className="py-2 pr-2 tabular-nums text-ink-mute">{i + 1}</td>
                              <td className="w-full py-2 pr-3">
                                <span className="font-medium">{p.name}</span>
                                <span className="mt-1 block h-1 max-w-full rounded-full" style={{ width: `${Math.max(4, (p.salesCents / max) * 100)}%`, background: 'var(--s1)' }} />
                              </td>
                              <td className="py-2 text-right tabular-nums">{p.quantity}</td>
                              <td className="py-2 text-right font-semibold tabular-nums">{money(p.salesCents)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </section>
                <div className="min-w-0 space-y-4">
                  <Breakdown title="Por zona de reparto" single rows={d.byZone.map((z) => ({ key: z.zoneId ?? 'none', label: z.name, cents: z.salesCents, count: z.ordersCount, slot: 1 }))} />
                  <section className="card p-4">
                    <h2 className="h-display mb-3 flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-ink-mute" />Clientes</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <div><p className="h-display text-2xl font-bold tabular-nums">{d.customers.newCount}</p><p className="flex items-center gap-1.5 text-xs text-ink-mute"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--s2)' }} />Nuevos</p></div>
                      <div><p className="h-display text-2xl font-bold tabular-nums">{d.customers.returningCount}</p><p className="flex items-center gap-1.5 text-xs text-ink-mute"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--s1)' }} />Recurrentes</p></div>
                    </div>
                    {totalCustomers > 0 && (
                      <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${d.customers.newCount} nuevos, ${d.customers.returningCount} recurrentes`}>
                        <span style={{ flex: d.customers.newCount, background: 'var(--s2)' }} />
                        <span style={{ flex: d.customers.returningCount, background: 'var(--s1)' }} />
                      </div>
                    )}
                  </section>
                  <section className="card p-4">
                    <h2 className="h-display mb-3 flex items-center gap-2 font-semibold"><Timer className="h-4 w-4 text-ink-mute" />Tiempos promedio</h2>
                    <dl className="grid grid-cols-3 gap-2 text-center">
                      {[
                        ['Preparación', d.times.avgPrepMinutes],
                        ['Entrega', d.times.avgDeliveryMinutes],
                        ['Total', d.times.avgTotalMinutes],
                      ].map(([l, v]) => (
                        <div key={l as string} className="rounded-xl bg-surface-sunken p-2">
                          <dd className="h-display text-xl font-bold tabular-nums">{v != null ? Math.round(v as number) : '—'}<span className="text-xs font-normal text-ink-mute"> min</span></dd>
                          <dt className="text-[11px] text-ink-mute">{l}</dt>
                        </div>
                      ))}
                    </dl>
                  </section>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Barras horizontales etiquetadas (cada fila con nombre, monto, pedidos y %). */
function Breakdown({ title, rows, single }: { title: string; rows: { key: string; label: string; cents: number; count: number; slot: number }[]; single?: boolean }) {
  const total = rows.reduce((s, r) => s + r.cents, 0) || 1;
  const sorted = rows.slice().sort((a, b) => b.cents - a.cents);
  return (
    <section className="card p-4">
      <h2 className="h-display mb-3 font-semibold">{title}</h2>
      {!rows.length ? <p className="py-4 text-center text-sm text-ink-mute">Sin datos</p> : (
        <ul className="space-y-3">
          {sorted.map((r) => {
            const pct = (r.cents / total) * 100;
            return (
              <li key={r.key} title={`${r.label}: ${money(r.cents)} · ${r.count} pedidos`}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                    {!single && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: `var(--s${r.slot})` }} />}
                    {r.label}
                  </span>
                  <span className="shrink-0 tabular-nums"><b>{money(r.cents)}</b> <span className="text-xs text-ink-mute">· {r.count} · {Math.round(pct)}%</span></span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: `var(--s${single ? 1 : r.slot})` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
