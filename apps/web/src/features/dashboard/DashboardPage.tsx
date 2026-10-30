import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, BarChart3, Boxes, ClipboardList, MessagesSquare, ShoppingBag, ShoppingCart, Tablet, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { timeAgo } from '@/lib/format';
import { useModuleEnabled } from '@/app/session';
import { EmptyState, Skeleton, StatCard } from '@/ui';
import { ReqCard } from '@/features/common-req/ReqCard';
import { AreaBadge } from '@/features/common-req/meta';
import { useDevices, useManagerBadges } from '@/features/common-req/hooks';
import type { Paged, Requisition } from '@/features/common-req/types';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function DashboardPage() {
  const user = useAuth((s) => (s.session?.kind === 'user' ? s.session.user : null));
  const reqOn = useModuleEnabled('requisitions');
  const deliveryOn = useModuleEnabled('delivery');
  const { stats, unread } = useManagerBadges();
  const open = useQuery({
    queryKey: ['requisitions', 'dashboard-open'],
    queryFn: () => api.get<Paged<Requisition>>('/requisitions', { open: 1, status: 'ENVIADA,VISTA', limit: 50 }),
    enabled: reqOn,
  });
  const devices = useDevices();

  const byArea = useMemo(() => {
    const items = [...(open.data?.items ?? [])].sort((a, b) => Number(b.priority === 'URGENTE') - Number(a.priority === 'URGENTE') || a.createdAt.localeCompare(b.createdAt));
    const groups = new Map<string, { area: Requisition['area']; items: Requisition[]; urgent: number }>();
    for (const r of items) {
      const g = groups.get(r.areaId) ?? { area: r.area, items: [], urgent: 0 };
      g.items.push(r);
      if (r.priority === 'URGENTE') g.urgent++;
      groups.set(r.areaId, g);
    }
    return [...groups.values()].sort((a, b) => b.urgent - a.urgent);
  }, [open.data]);

  const tablets = (devices.data ?? []).filter((d) => d.purpose === 'AREA');
  const onlineCount = tablets.filter((d) => d.online).length;
  const t = stats.data?.totals;
  const first = user?.name.replace(/\s*\(.*\)/, '').split(' ')[0];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-ink-mute">{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1 className="h-display text-3xl font-bold sm:text-4xl">
          {greeting()}{first ? `, ${first}` : ''} 👋
        </h1>
      </div>

      {reqOn && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Link to="/admin/requisiciones" className="contents">
            <StatCard label="Por revisar" value={t?.toReview ?? '—'} icon={<ClipboardList className="h-5 w-5" />} tone="brand" />
          </Link>
          <StatCard label="Urgentes" value={t?.urgent ?? '—'} icon={<AlertTriangle className="h-5 w-5" />} tone={t?.urgent ? 'danger' : undefined} />
          <StatCard label="En compra" value={t?.byStatus.EN_COMPRA ?? '—'} icon={<ShoppingCart className="h-5 w-5" />} tone="warn" />
          <StatCard label="Mensajes sin leer" value={unread.data?.unread ?? '—'} icon={<MessagesSquare className="h-5 w-5" />} tone={unread.data?.unread ? 'brand' : undefined} />
          <StatCard label="Tablets en línea" value={devices.data ? `${onlineCount}/${tablets.length}` : '—'} icon={<Tablet className="h-5 w-5" />} tone={tablets.length && onlineCount === tablets.length ? 'ok' : 'warn'} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {deliveryOn && (
            <Link to="/admin/pedidos" className="card flex items-center gap-4 p-4 transition hover:shadow-lift">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-info/15 text-info">
                <ShoppingBag className="h-6 w-6" />
              </span>
              <span className="flex-1">
                <span className="block font-display text-lg font-semibold">Pedidos de delivery</span>
                <span className="block text-sm text-ink-mute">Ver pedidos activos de WhatsApp y web</span>
              </span>
              <ArrowRight className="h-5 w-5 text-ink-mute" />
            </Link>
          )}

          {reqOn && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="h-display text-xl font-bold">Por revisar</h2>
                <Link to="/admin/requisiciones" className="text-sm font-semibold text-brand">Ver todas</Link>
              </div>
              {open.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-28" />
                  <Skeleton className="h-28" />
                </div>
              ) : byArea.length === 0 ? (
                <div className="card">
                  <EmptyState title="¡Todo al día!" description="No hay requisiciones esperando tu revisión." />
                </div>
              ) : (
                <div className="space-y-5">
                  {byArea.map((g) => (
                    <div key={g.area.id}>
                      <div className="mb-2 flex items-center gap-2">
                        <AreaBadge area={g.area} size={28} />
                        <h3 className="font-display font-semibold">{g.area.name}</h3>
                        <span className="text-sm text-ink-mute">· {g.items.length}</span>
                        {g.urgent > 0 && <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-black text-white">{g.urgent} URGENTE</span>}
                      </div>
                      <div className="space-y-3">
                        {g.items.map((r) => (
                          <ReqCard key={r.id} r={r} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          {reqOn && stats.data && (
            <section className="card p-4">
              <h2 className="mb-3 font-display text-lg font-semibold">Por área</h2>
              <ul className="space-y-2">
                {stats.data.byArea.map((a) => (
                  <li key={a.area.id} className="flex items-center gap-3">
                    <AreaBadge area={a.area} size={32} />
                    <span className="flex-1 font-medium">{a.area.name}</span>
                    {a.toReview > 0 ? (
                      <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-bold', a.urgent ? 'bg-danger text-white' : 'bg-brand-100 text-brand-700')}>{a.toReview} por revisar</span>
                    ) : (
                      <span className="text-xs text-ink-mute">{a.total ? `${a.total} abiertas` : 'Al día'}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Tablets</h2>
              <Link to="/admin/equipo" className="text-sm font-semibold text-brand">Administrar</Link>
            </div>
            {devices.isLoading ? (
              <Skeleton className="h-20" />
            ) : !devices.data?.length ? (
              <p className="text-sm text-ink-mute">
                Aún no hay tablets. <Link to="/admin/equipo" className="font-semibold text-brand">Emparejar una</Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {devices.data.map((d) => (
                  <li key={d.id} className="flex items-center gap-3">
                    <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', d.online ? 'bg-ok' : 'bg-ink-mute/40')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{d.name}</span>
                      <span className="block text-xs text-ink-mute">{d.area?.name ?? (d.purpose === 'POS' ? 'Caja' : '—')} · {d.online ? 'En línea' : d.lastSeenAt ? `Visto ${timeAgo(d.lastSeenAt)}` : 'Nunca conectada'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid grid-cols-2 gap-3">
            {[
              { to: '/admin/compras', label: 'Lista de compras', icon: ShoppingCart, show: reqOn },
              { to: '/admin/insumos', label: 'Insumos', icon: Boxes, show: reqOn },
              { to: '/admin/equipo', label: 'Equipo', icon: Users, show: true },
              { to: '/admin/reportes', label: 'Reportes', icon: BarChart3, show: true },
            ]
              .filter((l) => l.show)
              .map((l) => (
                <Link key={l.to} to={l.to} className="card flex flex-col items-start gap-2 p-4 transition hover:shadow-lift">
                  <l.icon className="h-5 w-5 text-brand" />
                  <span className="text-sm font-semibold">{l.label}</span>
                </Link>
              ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
