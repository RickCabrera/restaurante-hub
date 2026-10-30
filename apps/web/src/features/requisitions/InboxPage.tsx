import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Filter, Search, ShoppingCart, X } from 'lucide-react';
import { RT } from '@rh/shared';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/socket';
import { sounds } from '@/lib/sound';
import { Button, EmptyState, ErrorState, PageHeader, Select, Skeleton, Spinner, Tabs } from '@/ui';
import { ReqCard } from '@/features/common-req/ReqCard';
import { upsertRequisition, useAreas, useManagerBadges } from '@/features/common-req/hooks';
import type { Paged, Requisition } from '@/features/common-req/types';

type TabKey = 'review' | 'approved' | 'buying' | 'fulfilled' | 'history';
const TAB_STATUS: Record<TabKey, string | undefined> = {
  review: 'ENVIADA,VISTA',
  approved: 'APROBADA,APROBADA_PARCIAL',
  buying: 'EN_COMPRA',
  fulfilled: 'SURTIDA',
  history: undefined,
};

export function InboxPage() {
  const qc = useQueryClient();
  const { stats } = useManagerBadges();
  const areas = useAreas();
  const [tab, setTab] = useState<TabKey>('review');
  const [showFilters, setShowFilters] = useState(false);
  const [f, setF] = useState({ areaId: '', priority: '', from: '', to: '', q: '' });
  const [qDebounced, setQDebounced] = useState('');
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(f.q.trim()), 300);
    return () => clearTimeout(t);
  }, [f.q]);

  const params = {
    status: TAB_STATUS[tab],
    areaId: f.areaId || undefined,
    priority: f.priority || undefined,
    from: f.from || undefined,
    to: f.to || undefined,
    q: qDebounced || undefined,
    limit: 20,
  };
  const q = useInfiniteQuery({
    queryKey: ['requisitions', 'inbox', params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.get<Paged<Requisition>>('/requisitions', { ...params, cursor: pageParam }),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  });

  useRealtime<Requisition>(RT.REQUISITION_CREATED, (r) => {
    upsertRequisition(qc, r);
    if (r.priority === 'URGENTE') sounds.urgent();
    else sounds.newOrder();
    setFresh((s) => new Set(s).add(r.id));
    setTimeout(() => setFresh((s) => {
      const n = new Set(s);
      n.delete(r.id);
      return n;
    }), 6000);
  });

  // scroll infinito
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [q]);

  const items = useMemo(() => {
    const all = q.data?.pages.flatMap((p) => p.items) ?? [];
    if (tab !== 'review') return all;
    return [...all].sort((a, b) => Number(b.priority === 'URGENTE') - Number(a.priority === 'URGENTE') || a.createdAt.localeCompare(b.createdAt));
  }, [q.data, tab]);

  const by = stats.data?.totals.byStatus ?? {};
  const activeFilters = [f.areaId, f.priority, f.from, f.to].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Requisiciones"
        subtitle={stats.data ? `${stats.data.totals.toReview} por revisar${stats.data.totals.urgent ? ` · ${stats.data.totals.urgent} urgentes` : ''}` : undefined}
        actions={
          <Link to="/admin/compras">
            <Button variant="outline" icon={<ShoppingCart className="h-4 w-4" />}>
              Lista de compras
            </Button>
          </Link>
        }
      />
      <div className="sticky top-0 z-10 -mx-3 mb-4 space-y-3 bg-surface/90 px-3 pb-3 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'review', label: 'Por revisar', count: (by.ENVIADA ?? 0) + (by.VISTA ?? 0) },
            { value: 'approved', label: 'Aprobadas', count: (by.APROBADA ?? 0) + (by.APROBADA_PARCIAL ?? 0) },
            { value: 'buying', label: 'En compra', count: by.EN_COMPRA ?? 0 },
            { value: 'fulfilled', label: 'Surtidas', count: by.SURTIDA ?? 0 },
            { value: 'history', label: 'Historial' },
          ]}
        />
        <div className="flex gap-2">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <input className="input pl-9" placeholder="Buscar folio (REQ-000123)" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          </label>
          <Button variant={activeFilters ? 'primary' : 'outline'} onClick={() => setShowFilters((v) => !v)} icon={<Filter className="h-4 w-4" />}>
            <span className="hidden sm:inline">Filtros</span>
            {activeFilters > 0 && <span>({activeFilters})</span>}
          </Button>
        </div>
        {showFilters && (
          <div className="card grid gap-3 p-3 sm:grid-cols-4 animate-slide-up">
            <Select label="Área" value={f.areaId} onChange={(e) => setF({ ...f, areaId: e.target.value })} placeholder="Todas" options={(areas.data ?? []).map((a) => ({ value: a.id, label: a.name }))} />
            <Select label="Prioridad" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} placeholder="Todas" options={[{ value: 'URGENTE', label: 'Urgente' }, { value: 'NORMAL', label: 'Normal' }]} />
            <label>
              <span className="label">Desde</span>
              <input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            </label>
            <label>
              <span className="label">Hasta</span>
              <input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </label>
            {activeFilters > 0 && (
              <button className="flex items-center gap-1 text-sm font-semibold text-brand sm:col-span-4" onClick={() => setF({ areaId: '', priority: '', from: '', to: '', q: f.q })}>
                <X className="h-4 w-4" /> Quitar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={tab === 'review' ? '¡Todo al día!' : 'Nada por aquí'}
          description={tab === 'review' ? 'No hay requisiciones por revisar. Te avisaremos cuando llegue una.' : 'No hay requisiciones con estos filtros.'}
        />
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <ReqCard key={r.id} r={r} fresh={fresh.has(r.id)} />
          ))}
          <div ref={sentinel} className="flex h-12 items-center justify-center text-ink-mute">
            {q.isFetchingNextPage && <Spinner />}
          </div>
        </div>
      )}
    </div>
  );
}
