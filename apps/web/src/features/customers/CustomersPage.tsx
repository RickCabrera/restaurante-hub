import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Contact, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { money, timeAgo } from '@/lib/format';
import { Avatar, Button, EmptyState, ErrorState, PageHeader, Skeleton } from '@/ui';
import { fmtPhone, type Customer } from '@/features/delivery-common';

const PAGE = 30;

export function CustomersPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => { setDq(q.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const list = useQuery({
    queryKey: ['customers', dq, page],
    queryFn: () => api.get<{ items: Customer[]; total: number }>('/customers', { q: dq || undefined, limit: PAGE, offset: page * PAGE }),
    placeholderData: (p) => p,
  });
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Clientes" subtitle={list.data ? `${total} cliente${total === 1 ? '' : 's'}` : undefined} />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
        <input className="input pl-9 pr-9" placeholder="Buscar por nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente" />
        {q && <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-mute" onClick={() => setQ('')} aria-label="Limpiar"><X className="h-4 w-4" /></button>}
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !list.data?.items.length ? (
        <EmptyState icon={<Contact className="h-7 w-7" />} title={dq ? 'Sin resultados' : 'Aún no hay clientes'} description={dq ? 'Prueba con otro nombre o número.' : 'Se registran solos al hacer su primer pedido por WhatsApp, web o teléfono.'} />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_90px_120px_120px] gap-3 border-b border-line bg-surface-sunken/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-mute md:grid">
              <span>Cliente</span><span>Teléfono</span><span className="text-right">Pedidos</span><span className="text-right">Total gastado</span><span className="text-right">Último pedido</span>
            </div>
            <ul className="divide-y divide-line">
              {list.data.items.map((c) => (
                <li key={c.id}>
                  <button onClick={() => navigate(`/admin/clientes/${c.id}`)} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_90px_120px_120px]">
                    <span className="flex min-w-0 items-center gap-3 md:col-auto">
                      <Avatar name={c.name || '?'} size={36} color="rgb(var(--brand))" />
                      <span className="min-w-0 md:block">
                        <span className="block truncate font-semibold">{c.name || 'Sin nombre'}</span>
                        <span className="block text-sm text-ink-mute md:hidden">{fmtPhone(c.phone)}</span>
                        {c.tags.length > 0 && <span className="mt-0.5 flex flex-wrap gap-1">{c.tags.slice(0, 3).map((t) => <span key={t} className="chip bg-surface-sunken text-ink-soft !text-[11px]">{t}</span>)}</span>}
                      </span>
                    </span>
                    <span className="hidden text-sm tabular-nums text-ink-soft md:block">{fmtPhone(c.phone)}</span>
                    <span className="hidden text-right tabular-nums md:block">{c.ordersCount}</span>
                    <span className="text-right md:block">
                      <span className="block font-semibold tabular-nums">{money(c.totalSpentCents)}</span>
                      <span className="block text-xs text-ink-mute md:hidden">{c.ordersCount} pedido{c.ordersCount === 1 ? '' : 's'}</span>
                    </span>
                    <span className="hidden text-right text-sm text-ink-mute md:block">{c.lastOrderAt ? timeAgo(c.lastOrderAt) : '—'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-ink-mute">Página {page + 1} de {pages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
