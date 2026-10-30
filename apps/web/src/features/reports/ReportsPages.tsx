import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, ArrowRight, BarChart3, Boxes, ClipboardList, Clock, Download, Receipt, ShoppingBag, Timer, Truck } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatQty } from '@rh/shared';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useModuleEnabled } from '@/app/session';
import { Button, EmptyState, ErrorState, PageHeader, Select, Skeleton, StatCard, toast } from '@/ui';
import { useAreas } from '@/features/common-req/hooks';
import { AreaBadge } from '@/features/common-req/meta';

// ======================================================================= Hub
export function ReportsHub() {
  const reqOn = useModuleEnabled('requisitions');
  const deliveryOn = useModuleEnabled('delivery');
  const posOn = useModuleEnabled('pos');
  const cards = [
    { to: 'requisiciones', title: 'Requisiciones', desc: 'Consumo de insumos, tiempos de respuesta y diferencias por área.', icon: ClipboardList, show: reqOn },
    { to: 'ventas', title: 'Ventas delivery', desc: 'Ventas por día, canal, productos y zonas.', icon: ShoppingBag, show: deliveryOn },
    { to: 'pos', title: 'Punto de venta', desc: 'Ventas en sala, cortes de caja y meseros.', icon: Receipt, show: posOn },
  ].filter((c) => c.show);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Reportes" subtitle="Cómo va tu negocio" />
      {cards.length === 0 ? (
        <EmptyState icon={<BarChart3 className="h-7 w-7" />} title="Sin reportes" description="Activa un módulo en Configuración." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.to} to={`/admin/reportes/${c.to}`} className="card group flex flex-col gap-3 p-5 transition hover:shadow-lift">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-100 text-brand-700">
                <c.icon className="h-6 w-6" />
              </span>
              <span className="h-display text-xl font-bold">{c.title}</span>
              <span className="flex-1 text-sm text-ink-mute">{c.desc}</span>
              <span className="flex items-center gap-1 text-sm font-semibold text-brand">
                Ver reporte <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ======================================================================= Requisiciones
interface ReqReport {
  range: { from: string; to: string; timezone: string };
  totals: { requisitions: number; items: number; urgent: number };
  byStatus: Record<string, number>;
  bySupply: { supplyId: string; name: string; unit: string; unitLabel: string; approvedQty: number; requestedQty: number; receivedQty: number; requisitions: number }[];
  byArea: { areaId: string; name: string; color: string; count: number; items: number; urgent: number; late: number }[];
  avgResponseMinutes: number | null;
  avgFulfillMinutes: number | null;
  differencesCount: number;
  lateCount: number;
  daily: { date: string; count: number }[];
}

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function rangeFor(p: Preset): { from: string; to: string } {
  const now = new Date();
  const to = iso(now);
  const back = (n: number) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
  if (p === 'today') return { from: to, to };
  if (p === '7d') return { from: back(6), to };
  if (p === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  return { from: back(29), to };
}
function fmtMinutes(m: number | null) {
  if (m == null) return '—';
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${Math.round(m % 60)} min`;
}

export function RequisitionsReport() {
  const areas = useAreas();
  const [preset, setPreset] = useState<Preset>('30d');
  const [custom, setCustom] = useState(rangeFor('30d'));
  const [areaId, setAreaId] = useState('');
  const range = preset === 'custom' ? custom : rangeFor(preset);
  const q = useQuery({ queryKey: ['report-req', range, areaId], queryFn: () => api.get<ReqReport>('/reports/requisitions', { ...range, areaId: areaId || undefined }) });
  const d = q.data;
  const [downloading, setDownloading] = useState(false);

  const csv = async () => {
    setDownloading(true);
    try {
      await api.download('/reports/requisitions.csv', `requisiciones_${range.from}_${range.to}.csv`, { ...range, areaId: areaId || undefined });
    } catch (e) {
      toast.fromError(e);
    } finally {
      setDownloading(false);
    }
  };

  const daily = useMemo(() => (d?.daily ?? []).map((x) => ({ ...x, label: fmtDate(`${x.date}T12:00:00`) })), [d]);
  const topSupplies = (d?.bySupply ?? []).slice().sort((a, b) => b.requisitions - a.requisitions || b.approvedQty - a.approvedQty).slice(0, 10);
  const maxSupply = Math.max(1, ...topSupplies.map((s) => s.requisitions));
  const maxArea = Math.max(1, ...(d?.byArea ?? []).map((a) => a.count));

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/admin/reportes" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-mute hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Reportes
      </Link>
      <PageHeader
        title="Reporte de requisiciones"
        subtitle={d ? `${fmtDate(`${d.range.from}T12:00:00`)} – ${fmtDate(`${d.range.to}T12:00:00`)}` : undefined}
        actions={<Button variant="outline" loading={downloading} icon={<Download className="h-4 w-4" />} onClick={csv}>Exportar CSV</Button>}
      />
      <div className="mb-5 flex flex-wrap items-end gap-2">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface-sunken p-1">
          {([['today', 'Hoy'], ['7d', '7 días'], ['30d', '30 días'], ['month', 'Este mes'], ['custom', 'Personalizado']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPreset(k)} className={clsx('shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition', preset === k ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-mute hover:text-ink')}>
              {l}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <input type="date" className="input h-10 w-40" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="Desde" />
            <input type="date" className="input h-10 w-40" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="Hasta" />
          </>
        )}
        <Select className="w-52" value={areaId} onChange={(e) => setAreaId(e.target.value)} placeholder="Todas las áreas" options={(areas.data ?? []).map((a) => ({ value: a.id, label: a.name }))} aria-label="Área" />
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : q.error || !d ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Requisiciones" value={d.totals.requisitions} hint={d.totals.urgent ? `${d.totals.urgent} urgentes` : undefined} icon={<ClipboardList className="h-5 w-5" />} tone="brand" />
            <StatCard label="Renglones" value={d.totals.items} icon={<Boxes className="h-5 w-5" />} />
            <StatCard label="Respuesta prom." value={fmtMinutes(d.avgResponseMinutes)} hint="De enviada a revisada" icon={<Timer className="h-5 w-5" />} tone="ok" />
            <StatCard label="Surtido prom." value={fmtMinutes(d.avgFulfillMinutes)} hint="De enviada a surtida" icon={<Truck className="h-5 w-5" />} />
            <StatCard label="Con diferencias" value={d.differencesCount} hint="Al recibir" icon={<AlertTriangle className="h-5 w-5" />} tone={d.differencesCount ? 'warn' : undefined} />
            <StatCard label="Tarde" value={d.lateCount} hint="Fuera de horario" icon={<Clock className="h-5 w-5" />} tone={d.lateCount ? 'danger' : undefined} />
          </div>

          <section className="card p-4">
            <h2 className="mb-1 font-display text-lg font-semibold">Requisiciones por día</h2>
            <p className="mb-3 text-sm text-ink-mute">{d.totals.requisitions} en el periodo</p>
            {d.totals.requisitions === 0 ? (
              <EmptyState title="Sin requisiciones en este periodo" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="0" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--ink-mute))', fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--ink-mute))', fontSize: 11 }} />
                    <Tooltip
                      cursor={{ fill: 'rgb(var(--surface-sunken))' }}
                      contentStyle={{ background: 'rgb(var(--surface-raised))', border: '1px solid rgb(var(--line))', borderRadius: 12, color: 'rgb(var(--ink))' }}
                      labelStyle={{ color: 'rgb(var(--ink-mute))' }}
                      formatter={(v: number) => [v, 'Requisiciones']}
                    />
                    <Bar dataKey="count" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card p-4">
              <h2 className="mb-3 font-display text-lg font-semibold">Insumos más pedidos</h2>
              {topSupplies.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-mute">Sin datos</p>
              ) : (
                <ul className="space-y-2.5">
                  {topSupplies.map((s, i) => (
                    <li key={s.supplyId} className="group" title={`Pedido ${formatQty(s.requestedQty)} · aprobado ${formatQty(s.approvedQty)} · recibido ${formatQty(s.receivedQty)} ${s.unitLabel}`}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium"><span className="mr-1.5 text-ink-mute">{i + 1}.</span>{s.name}</span>
                        <span className="shrink-0 text-ink-soft">
                          <b className="text-ink">{formatQty(s.approvedQty)} {s.unitLabel}</b> · {s.requisitions} veces
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                        <div className="h-full rounded-full bg-brand transition-all group-hover:bg-brand-600" style={{ width: `${(s.requisitions / maxSupply) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card p-4">
              <h2 className="mb-3 font-display text-lg font-semibold">Por área</h2>
              {d.byArea.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-mute">Sin datos</p>
              ) : (
                <ul className="space-y-3">
                  {d.byArea.map((a) => {
                    const area = areas.data?.find((x) => x.id === a.areaId);
                    return (
                      <li key={a.areaId}>
                        <div className="mb-1 flex items-center gap-2 text-sm">
                          <AreaBadge area={{ color: a.color, icon: area?.icon ?? 'store', name: a.name }} size={26} />
                          <span className="flex-1 font-medium">{a.name}</span>
                          <span className="text-ink-soft"><b className="text-ink">{a.count}</b> req · {a.items} renglones</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                          <div className="h-full rounded-full" style={{ width: `${(a.count / maxArea) * 100}%`, background: a.color }} />
                        </div>
                        {(a.urgent > 0 || a.late > 0) && (
                          <p className="mt-1 text-xs text-ink-mute">
                            {a.urgent > 0 && `${a.urgent} urgentes`}{a.urgent > 0 && a.late > 0 && ' · '}{a.late > 0 && `${a.late} tarde`}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
