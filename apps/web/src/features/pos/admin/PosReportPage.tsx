import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Ban, HandCoins, Percent, Receipt, TrendingUp, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { money, fmtDateTime } from '@/lib/format';
import { EmptyState, ErrorState, PageHeader, Skeleton, StatCard, Tabs } from '@/ui';
import { DateRange, useRange } from './DateRange';

interface Agg { id: string; name: string; tickets: number; salesCents: number; tipsCents: number; guests: number }
interface Report {
  totals: { tickets: number; guests: number; salesCents: number; tipsCents: number; discountsCents: number; averageTicketCents: number; cancelledTickets: number; cancelledLines: number };
  byWaiter: Agg[];
  tipsByWaiter: { id: string; name: string; tipsCents: number; tickets: number }[];
  byTable: Agg[];
  byDiningArea: Agg[];
  paymentsByMethod: { method: string; label: string; count: number; amountCents: number; tipsCents: number }[];
  hourly: { hour: number; tickets: number; salesCents: number }[];
  cancellations: {
    tickets: { id: string; folio: string; totalCents: number; reason: string | null; by: string | null; at: string }[];
    lines: { id: string; folio: string; product: string; quantity: number; amountCents: number; reason: string | null; by: string | null; at: string }[];
  };
  discounts: {
    tickets: { id: string; folio: string; discountCents: number; reason: string | null }[];
    lines: { id: string; folio: string; product: string; discountCents: number; reason: string | null }[];
    courtesies: { id: string; folio: string; product: string; quantity: number; amountCents: number; reason: string | null }[];
  };
}

const pesos = (c: number) => `$${Math.round(c / 100).toLocaleString('es-MX')}`;

export function PosReportPage() {
  const range = useRange('today');
  const q = useQuery({ queryKey: ['pos', 'report', range.from, range.to], queryFn: () => api.get<Report>('/pos/reports', { from: range.from, to: range.to }) });
  const [by, setBy] = useState<'waiter' | 'table' | 'area'>('waiter');
  const r = q.data;

  return (
    <div>
      <PageHeader title="Reporte del punto de venta" subtitle="Ventas en mesa, para llevar y mostrador (sin propina)." />
      <DateRange range={range} className="mb-5" />
      {q.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : r ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Ventas" value={money(r.totals.salesCents)} icon={<TrendingUp className="h-5 w-5" />} tone="brand" hint={`${r.totals.tickets} cuentas`} />
            <StatCard label="Ticket promedio" value={money(r.totals.averageTicketCents)} icon={<Receipt className="h-5 w-5" />} hint={`${r.totals.guests} personas`} />
            <StatCard label="Propinas" value={money(r.totals.tipsCents)} icon={<HandCoins className="h-5 w-5" />} tone="ok" />
            <StatCard label="Descuentos" value={money(r.totals.discountsCents)} icon={<Percent className="h-5 w-5" />} hint={`${r.totals.cancelledTickets} cuentas y ${r.totals.cancelledLines} productos cancelados`} tone={r.totals.cancelledTickets ? 'warn' : undefined} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Panel title="Ventas por hora">
              {r.totals.tickets === 0 ? <EmptyState title="Sin ventas en este periodo" /> : <HourlyChart data={r.hourly} />}
            </Panel>
            <Panel title="Pagos por método">
              <ul className="space-y-3">
                {r.paymentsByMethod.map((m) => {
                  const total = r.paymentsByMethod.reduce((s, x) => s + x.amountCents, 0) || 1;
                  return (
                    <li key={m.method}>
                      <div className="flex justify-between text-sm"><span className="font-medium">{m.label} <span className="text-ink-mute">({m.count})</span></span><span className="font-semibold tabular-nums">{money(m.amountCents)}</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full rounded-full bg-brand" style={{ width: `${(m.amountCents / total) * 100}%` }} /></div>
                      {m.tipsCents > 0 && <p className="mt-0.5 text-xs text-ink-mute">Propina capturada {money(m.tipsCents)}</p>}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Panel title="Ventas por" actions={<Tabs value={by} onChange={setBy} items={[{ value: 'waiter', label: 'Mesero' }, { value: 'table', label: 'Mesa' }, { value: 'area', label: 'Salón' }]} />}>
              <AggTable rows={by === 'waiter' ? r.byWaiter : by === 'table' ? r.byTable : r.byDiningArea} />
            </Panel>
            <Panel title="Propinas por mesero">
              {r.tipsByWaiter.length === 0 ? <Empty /> : (
                <ul className="divide-y divide-line">
                  {r.tipsByWaiter.map((w) => (
                    <li key={w.id} className="flex items-center gap-3 py-2 text-sm">
                      <Users className="h-4 w-4 text-ink-mute" />
                      <span className="flex-1 font-medium">{w.name}</span>
                      <span className="text-xs text-ink-mute">{w.tickets} cuentas</span>
                      <span className="w-24 text-right font-semibold tabular-nums">{money(w.tipsCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Cancelaciones" icon={<Ban className="h-4 w-4 text-danger" />}>
              {r.cancellations.tickets.length + r.cancellations.lines.length === 0 ? <Empty /> : (
                <SimpleTable
                  head={['Folio', 'Qué', 'Motivo', 'Quién', 'Monto']}
                  rows={[
                    ...r.cancellations.tickets.map((c) => [c.folio, 'Cuenta completa', c.reason ?? '—', c.by ?? '—', money(c.totalCents)]),
                    ...r.cancellations.lines.map((c) => [c.folio, `${c.quantity}× ${c.product}`, c.reason ?? '—', `${c.by ?? '—'} · ${fmtDateTime(c.at)}`, money(c.amountCents)]),
                  ]}
                />
              )}
            </Panel>
            <Panel title="Descuentos y cortesías" icon={<Percent className="h-4 w-4 text-info" />}>
              {r.discounts.tickets.length + r.discounts.lines.length + r.discounts.courtesies.length === 0 ? <Empty /> : (
                <SimpleTable
                  head={['Folio', 'Tipo', 'Motivo', 'Monto']}
                  rows={[
                    ...r.discounts.tickets.map((d) => [d.folio, 'Cuenta', d.reason ?? '—', money(d.discountCents)]),
                    ...r.discounts.lines.map((d) => [d.folio, d.product, d.reason ?? '—', money(d.discountCents)]),
                    ...r.discounts.courtesies.map((d) => [d.folio, `Cortesía: ${d.quantity}× ${d.product}`, d.reason ?? '—', money(d.amountCents)]),
                  ]}
                />
              )}
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Panel({ title, children, actions, icon }: { title: string; children: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <section className="card min-w-0 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">{icon}{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
const Empty = () => <p className="py-6 text-center text-sm text-ink-mute">Nada en este periodo.</p>;

function HourlyChart({ data }: { data: Report['hourly'] }) {
  const first = data.findIndex((d) => d.tickets > 0);
  const last = data.length - 1 - [...data].reverse().findIndex((d) => d.tickets > 0);
  const rows = data.slice(Math.max(0, Math.min(first, 8)), Math.max(last + 1, 23)).map((d) => ({ ...d, label: `${d.hour}h` }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--ink-mute))', fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: 'rgb(var(--ink-mute))', fontSize: 11 }} tickFormatter={pesos} width={64} />
          <Tooltip
            cursor={{ fill: 'rgb(var(--surface-sunken))' }}
            contentStyle={{ background: 'rgb(var(--surface-raised))', border: '1px solid rgb(var(--line))', borderRadius: 12, color: 'rgb(var(--ink))' }}
            formatter={(v: number, _n, p) => [`${money(v)} · ${(p.payload as { tickets: number }).tickets} cuentas`, 'Ventas']}
            labelFormatter={(l) => `${l}`}
          />
          <Bar dataKey="salesCents" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AggTable({ rows }: { rows: Agg[] }) {
  if (!rows.length) return <Empty />;
  const max = Math.max(...rows.map((r) => r.salesCents), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.id}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium">{r.name}</span>
            <span className="shrink-0 text-xs text-ink-mute">{r.tickets} cuentas · {r.guests} pers.</span>
            <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{money(r.salesCents)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken"><div className="h-full rounded-full bg-brand" style={{ width: `${(r.salesCents / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="-mx-4 overflow-x-auto scroll-thin">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-ink-mute">
          <tr>{head.map((h, i) => <th key={h} className={clsx('px-4 py-2', i === head.length - 1 && 'text-right')}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={clsx('px-4 py-2', j === 0 && 'font-semibold', j === r.length - 1 && 'text-right tabular-nums')}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
