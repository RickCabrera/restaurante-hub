import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, LogOut, Menu, Wifi, WifiOff, X, MoreHorizontal } from 'lucide-react';
import { RT } from '@rh/shared';
import { NAV, SECTION_LABEL, type NavItem } from '@/app/nav';
import { useAuth, useEffectiveRole } from '@/lib/auth-store';
import { api } from '@/lib/api';
import { useRealtime, useSocketStatus, disconnectSocket } from '@/lib/socket';
import { sounds } from '@/lib/sound';
import { timeAgo } from '@/lib/format';
import { assetUrl } from '@/lib/config';
import { Avatar, Modal, toast } from '@/ui';
import { useBadges } from '@/app/badges';
import { useGlobalBadges } from '@/app/useGlobalBadges';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function useVisibleNav(): NavItem[] {
  const role = useEffectiveRole();
  const modules = useAuth((s) => s.business?.modules);
  return useMemo(
    () =>
      NAV.filter((n) => {
        if (n.module && modules && !modules[n.module]) return false;
        if (n.module === 'pos' && !modules) return false;
        if (n.roles && role && role !== 'OWNER' && !n.roles.includes(role)) return false;
        return true;
      }),
    [role, modules],
  );
}

export function AdminLayout() {
  const nav = useVisibleNav();
  const [drawer, setDrawer] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const online = useSocketStatus();
  const business = useAuth((s) => s.business);
  const session = useAuth((s) => s.session);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const badges = useBadges((s) => s.counts);
  const location = useLocation();
  useGlobalBadges();

  const notif = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ items: NotificationItem[]; unread: number }>('/notifications', { limit: 30 }),
    refetchInterval: 60_000,
  });

  useRealtime<NotificationItem>(RT.NOTIFICATION, (n) => {
    qc.invalidateQueries({ queryKey: ['notifications'] });
    // El monitor de pedidos tiene su propia alarma y tarjetas: no duplicar sonido ni aviso ahí.
    if (n.type === 'ORDER_NEW' && window.location.pathname.startsWith('/admin/pedidos')) return;
    const urgent = n.type.includes('URGENT') || n.type === 'HUMAN_HANDOFF' || n.type === 'PRINT_ERROR';
    if (urgent) sounds.urgent();
    else if (n.type.startsWith('ORDER_NEW') || n.type === 'REQUISITION_NEW') sounds.newOrder();
    else sounds.message();
    toast.info(n.title, n.body);
  });

  const user = session?.kind === 'user' ? session.user : null;
  const sections = Object.keys(SECTION_LABEL) as NavItem['section'][];
  const mobileNav = nav.filter((n) => n.mobile).slice(0, 4);

  const doLogout = async () => {
    const s = useAuth.getState().session;
    if (s?.kind === 'user') await api.post('/auth/logout', { refreshToken: s.refreshToken }).catch(() => undefined);
    logout();
    disconnectSocket();
    qc.clear();
    navigate('/login');
  };

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-5">
        {business?.logoUrl ? (
          <img src={assetUrl(business.logoUrl)} alt="" className="h-10 w-10 rounded-xl object-cover" />
        ) : (
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand font-display text-lg font-bold text-white">
            {business?.name?.[0] ?? 'R'}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-display font-semibold leading-tight">{business?.name ?? 'Restaurante Hub'}</p>
          <p className="flex items-center gap-1 text-xs text-ink-mute">
            {online ? <Wifi className="h-3 w-3 text-ok" /> : <WifiOff className="h-3 w-3 text-danger" />}
            {online ? 'En línea' : 'Sin conexión'}
          </p>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4 scroll-thin">
        {sections.map((sec) => {
          const items = nav.filter((n) => n.section === sec);
          if (!items.length) return null;
          return (
            <div key={sec}>
              {SECTION_LABEL[sec] && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-mute">{SECTION_LABEL[sec]}</p>}
              {items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/admin'}
                  onClick={() => setDrawer(false)}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                      isActive ? 'bg-brand-100 text-brand-700' : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
                    )
                  }
                >
                  <n.icon className="h-[18px] w-[18px]" />
                  <span className="flex-1">{n.label}</span>
                  {n.badge && badges[n.badge] ? (
                    <span className="rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">{badges[n.badge]}</span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>
      {user && (
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <Avatar name={user.name} color={user.avatarColor} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-ink-mute">{user.email ?? user.phone}</p>
          </div>
          <button onClick={doLogout} className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken" title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface-raised lg:block">{sidebar}</aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface-raised shadow-lift animate-slide-up">
            <button className="absolute right-2 top-4 grid h-9 w-9 place-items-center" onClick={() => setDrawer(false)} aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur lg:px-6">
          <button className="grid h-10 w-10 place-items-center rounded-xl lg:hidden" onClick={() => setDrawer(true)} aria-label="Menú">
            <Menu className="h-5 w-5" />
          </button>
          <p className="truncate font-display font-semibold lg:hidden">{business?.name}</p>
          <div className="flex-1" />
          <button onClick={() => setBellOpen(true)} className="relative grid h-10 w-10 place-items-center rounded-xl hover:bg-surface-sunken" aria-label="Notificaciones">
            <Bell className="h-5 w-5" />
            {!!notif.data?.unread && (
              <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-[18px] text-white">
                {notif.data.unread > 99 ? '99+' : notif.data.unread}
              </span>
            )}
          </button>
        </header>

        <main key={location.pathname.split('/').slice(0, 3).join('/')} className="flex-1 overflow-y-auto px-3 py-4 pb-24 sm:px-6 lg:pb-8">
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface-raised safe-bottom lg:hidden" style={{ gridTemplateColumns: `repeat(${mobileNav.length + 1}, 1fr)` }}>
          {mobileNav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/admin'}
              className={({ isActive }) => clsx('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand' : 'text-ink-mute')}
            >
              <n.icon className="h-5 w-5" />
              {n.label}
              {n.badge && badges[n.badge] ? <span className="absolute right-[22%] top-1 h-2.5 w-2.5 rounded-full bg-danger" /> : null}
            </NavLink>
          ))}
          <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-ink-mute">
            <MoreHorizontal className="h-5 w-5" />
            Más
          </button>
        </nav>
      </div>

      <Modal open={bellOpen} onClose={() => setBellOpen(false)} title="Notificaciones" size="md">
        <div className="-mx-2 space-y-1">
          {notif.data?.items.length ? (
            notif.data.items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setBellOpen(false);
                  void api.post('/notifications/read', { ids: [n.id] }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
                  if (n.link) navigate(n.link);
                }}
                className={clsx('flex w-full gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-sunken', !n.readAt && 'bg-brand-50')}
              >
                <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{n.title}</span>
                  <span className="block text-sm text-ink-mute">{n.body}</span>
                  <span className="block text-xs text-ink-mute">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))
          ) : (
            <p className="py-10 text-center text-sm text-ink-mute">Sin notificaciones</p>
          )}
        </div>
        {!!notif.data?.unread && (
          <button
            className="mt-3 w-full text-center text-sm font-semibold text-brand"
            onClick={() => api.post('/notifications/read', {}).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))}
          >
            Marcar todas como leídas
          </button>
        )}
      </Modal>
    </div>
  );
}
