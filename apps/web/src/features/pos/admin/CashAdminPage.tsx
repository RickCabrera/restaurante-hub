import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronRight, Wallet } from 'lucide-react';
import { RT } from '@rh/shared';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/socket';
import { useEffectiveRole } from '@/lib/auth-store';
import { money, fmtDateTime } from '@/lib/format';
import { Badge, Button, EmptyState, ErrorState, Modal, PageHeader, PageLoader, Skeleton, StatCard } from '@/ui';
import { useCurrentCash, type CashSession } from '../api';
import { CashSummaryView } from '../components/CashSummaryView';
import { DateRange, useRange } from './DateRange';

export function CashAdminPage() {
  const role = useEffectiveRole();
  const admin = role === 'OWNER' || role === 'ADMIN';
  const current = useCurrentCash(true);
  const range = useRange('30d');
  const list = useQuery({
    queryKey: ['pos', 'cash', 'list', range.from, range.to],
    queryFn: () => api.get<CashSession[]>('/pos/cash-sessions', { from: range.from, to: range.to }),
    enabled: admin,
  });
  const [detail, setDetail] = useState<string | null>(null);
  useRealtime(RT.POS_CASH_UPDATED, () => {
    void list.refetch();
    void current.refetch();
  });

  const rows = list.data ?? [];
  const closed = rows.filter((r) => r.closedAt);
  const totalDiff = closed.reduce((s, r) => s + (r.differenceCents ?? 0), 0);
  const openNow = rows.filter((r) => !r.closedAt);

  return (
    <div>
      <PageHeader title="Caja y cortes" subtitle="Aperturas, cortes Z y diferencias de cada cajero." actions={<Link to="/pos/caja"><Button icon={<Wallet className="h-4 w-4" />}>Ir a la caja</Button></Link>} />

      <section className="card mb-5 flex flex-wrap items-center gap-4 p-4">
        <span className={clsx('grid h-12 w-12 place-items-center rounded-2xl', current.data ? 'bg-ok/15 text-ok' : 'bg-surface-sunken text-ink-mute')}><Wallet className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-mute">Tu caja</p>
          {current.isLoading ? <Skeleton className="h-6 w-40" /> : current.data ? (
            <p className="font-semibold">{current.data.folio} abierta desde {fmtDateTime(current.data.openedAt)} · esperado {money(current.data.summary?.expectedCashCents)}</p>
          ) : (
            <p className="font-semibold">No tienes caja abierta</p>
          )}
        </div>
        {current.data && <Button variant="outline" onClick={() => setDetail(current.data!.id)}>Ver resumen</Button>}
      </section>

      {!admin ? (
        <p className="text-sm text-ink-mute">El historial de cortes lo ve el administrador.</p>
      ) : (
        <>
          <DateRange range={range} className="mb-4" />
          {list.isLoading ? (
            <PageLoader />
          ) : list.error ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : (
            <>
              <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Cortes" value={closed.length} />
                <StatCard label="Cajas abiertas" value={openNow.length} tone={openNow.length ? 'warn' : undefined} />
                <StatCard label="Efectivo esperado" value={money(closed.reduce((s, r) => s + (r.expectedCents ?? 0), 0))} />
                <StatCard label="Diferencia total" value={<span className={totalDiff < 0 ? 'text-danger' : totalDiff > 0 ? 'text-info' : 'text-ok'}>{signed(totalDiff)}</span>} />
              </div>
              {rows.length === 0 ? (
                <div className="card"><EmptyState icon={<Wallet className="h-7 w-7" />} title="Sin cajas en este periodo" /></div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="hidden w-full text-sm md:table">
                    <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-mute">
                      <tr><th className="px-4 py-2.5">Folio</th><th>Cajero</th><th>Apertura</th><th>Cierre</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="px-4 text-right">Diferencia</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {rows.map((r) => (
                        <tr key={r.id} className="cursor-pointer hover:bg-surface-sunken" onClick={() => setDetail(r.id)}>
                          <td className="px-4 py-3 font-semibold">{r.folio}</td>
                          <td>{r.cashierName}</td>
                          <td>{fmtDateTime(r.openedAt)}</td>
                          <td>{r.closedAt ? fmtDateTime(r.closedAt) : <Badge tone="ok">Abierta</Badge>}</td>
                          <td className="text-right tabular-nums">{r.expectedCents != null ? money(r.expectedCents) : '—'}</td>
                          <td className="text-right tabular-nums">{r.countedCents != null ? money(r.countedCents) : '—'}</td>
                          <td className="px-4 text-right"><Diff c={r.differenceCents} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ul className="divide-y divide-line md:hidden">
                    {rows.map((r) => (
                      <li key={r.id}>
                        <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setDetail(r.id)}>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{r.folio} · {r.cashierName}</p>
                            <p className="text-xs text-ink-mute">{fmtDateTime(r.openedAt)}</p>
                          </div>
                          {r.closedAt ? <Diff c={r.differenceCents} /> : <Badge tone="ok">Abierta</Badge>}
                          <ChevronRight className="h-4 w-4 text-ink-mute" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </>
      )}
      <SessionDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

const signed = (c: number) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${money(Math.abs(c))}`;
function Diff({ c }: { c: number | null }) {
  if (c == null) return <span className="text-ink-mute">—</span>;
  return <span className={clsx('font-semibold tabular-nums', c === 0 ? 'text-ok' : c > 0 ? 'text-info' : 'text-danger')}>{c === 0 ? 'Cuadra' : signed(c)}</span>;
}

function SessionDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['pos', 'cash', 'detail', id], queryFn: () => api.get<CashSession>(`/pos/cash-sessions/${id}`), enabled: !!id });
  return (
    <Modal open={!!id} onClose={onClose} size="xl" title={q.data ? `Caja ${q.data.folio} · ${q.data.cashierName ?? ''}` : 'Caja'}>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} /> : q.data?.summary ? (
        <>
          <p className="mb-3 text-sm text-ink-mute">
            {fmtDateTime(q.data.openedAt)} → {q.data.closedAt ? fmtDateTime(q.data.closedAt) : 'abierta'}{q.data.notes ? ` · Nota: ${q.data.notes}` : ''}
          </p>
          <CashSummaryView s={q.data.summary} />
        </>
      ) : null}
    </Modal>
  );
}

