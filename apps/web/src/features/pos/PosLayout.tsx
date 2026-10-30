import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Lock, LogOut, LayoutGrid, ShoppingBag, ListChecks, Wallet, Repeat } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useSocketStatus, disconnectSocket } from '@/lib/socket';
import { StaffPin, roleLabel } from '@/components/StaffPin';
import { Avatar, confirm } from '@/ui';
import { usePosRealtime, usePosRole, useCurrentCash } from './api';
import { TakeoutModal } from './components/TakeoutModal';
import { OpenTicketsSheet } from './components/OpenTicketsSheet';

/** Bloqueo automático de la caja/comandero (dispositivo) tras inactividad. */
export const POS_IDLE_LOCK_MS = 3 * 60_000;
const STAFF_ROLES = ['WAITER', 'CASHIER', 'ADMIN'] as const;

export function PosLayout() {
  const session = useAuth((s) => s.session);
  const staff = useAuth((s) => s.staff);
  const clearStaff = useAuth((s) => s.clearStaff);
  const { isDevice, identified } = usePosRole();
  const [switching, setSwitching] = useState(false);

  // Auto-bloqueo por inactividad (solo dispositivos con persona identificada)
  const last = useRef(Date.now());
  useEffect(() => {
    if (!isDevice || !staff) return;
    last.current = Date.now();
    const bump = () => (last.current = Date.now());
    const evs = ['pointerdown', 'keydown', 'wheel'] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      if (Date.now() - last.current > POS_IDLE_LOCK_MS) clearStaff();
    }, 10_000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(t);
    };
  }, [isDevice, staff, clearStaff]);

  if (!session) return null;

  if (isDevice && (!identified || switching)) {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-surface">
        <PinHeader />
        <StaffPin
          roles={[...STAFF_ROLES]}
          title={switching ? '¿Quién va a usar la caja?' : '¿Quién eres?'}
          onCancel={switching && staff ? () => setSwitching(false) : undefined}
          onDone={() => setSwitching(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <PosRealtime />
      <PosTopBar onSwitch={() => setSwitching(true)} />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

function PosRealtime() {
  usePosRealtime();
  return null;
}

function PinHeader() {
  const business = useAuth((s) => s.business);
  const session = useAuth((s) => s.session);
  return (
    <div className="flex items-center justify-between border-b border-line px-5 py-3">
      <span className="h-display text-lg font-bold">{business?.name ?? 'Punto de venta'}</span>
      <span className="text-sm text-ink-mute">{session?.kind === 'device' ? session.device.name : ''}</span>
    </div>
  );
}

function ConnectionDot() {
  const online = useSocketStatus();
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-mute" title={online ? 'En línea' : 'Sin conexión'}>
      <span className={clsx('h-2.5 w-2.5 rounded-full', online ? 'bg-ok' : 'bg-danger animate-pulse')} />
      <span className="hidden xl:inline">{online ? 'En línea' : 'Sin conexión'}</span>
    </span>
  );
}

function CashChip() {
  const { canCash } = usePosRole();
  const cash = useCurrentCash(canCash);
  if (!canCash) return null;
  const open = !!cash.data && !cash.data.closedAt;
  return (
    <NavLink
      to="/pos/caja"
      className={clsx(
        'hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold md:inline-flex',
        open ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn',
      )}
    >
      <span className={clsx('h-2 w-2 rounded-full', open ? 'bg-ok' : 'bg-warn')} />
      {cash.isLoading ? 'Caja…' : open ? `Caja abierta · ${cash.data?.cashierName?.split(' ')[0] ?? ''}` : 'Caja cerrada'}
    </NavLink>
  );
}

function PosTopBar({ onSwitch }: { onSwitch: () => void }) {
  const business = useAuth((s) => s.business);
  const session = useAuth((s) => s.session);
  const staff = useAuth((s) => s.staff);
  const clearStaff = useAuth((s) => s.clearStaff);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const { isDevice, role, canCash, isManager } = usePosRole();
  const [takeout, setTakeout] = useState(false);
  const [openList, setOpenList] = useState(false);

  const person = session?.kind === 'user' ? { name: session.user.name, color: session.user.avatarColor } : staff ? { name: staff.staff.name, color: staff.staff.avatarColor } : null;

  const exit = async () => {
    if (isDevice) return clearStaff();
    if (isManager || role === 'CASHIER') return navigate('/admin');
    const ok = await confirm({ title: '¿Cerrar sesión?', confirmText: 'Cerrar sesión' });
    if (ok) {
      disconnectSocket();
      logout();
      navigate('/login');
    }
  };

  const navBtn = 'flex h-14 min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 text-[11px] font-semibold text-ink-soft transition hover:bg-surface-sunken active:scale-95 sm:px-3';
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-raised px-2 py-1.5 sm:gap-3 sm:px-3">
      <div className="hidden min-w-0 shrink lg:block">
        <p className="h-display truncate text-base font-bold leading-tight">{business?.name ?? 'Punto de venta'}</p>
        <ConnectionDot />
      </div>
      <button
        onClick={isDevice ? onSwitch : undefined}
        className={clsx('flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left', isDevice && 'hover:bg-surface-sunken active:scale-95')}
        aria-label={isDevice ? 'Cambiar de persona' : undefined}
      >
        {person && <Avatar name={person.name} color={person.color} size={38} />}
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-semibold leading-tight">{person?.name}</span>
          <span className="flex items-center gap-1 text-xs text-ink-mute">
            {role ? roleLabel(role) : ''}
            {isDevice && <Repeat className="h-3 w-3" />}
          </span>
        </span>
      </button>
      <CashChip />
      <span className="lg:hidden"><ConnectionDot /></span>

      <nav className="ml-auto flex items-center gap-0.5 sm:gap-1">
        <NavLink to="/pos" end className={({ isActive }) => clsx(navBtn, isActive && 'bg-brand/10 text-brand')}>
          <LayoutGrid className="h-5 w-5" /> Mesas
        </NavLink>
        <button className={navBtn} onClick={() => setTakeout(true)}>
          <ShoppingBag className="h-5 w-5" /> <span className="whitespace-nowrap">Para llevar</span>
        </button>
        <button className={navBtn} onClick={() => setOpenList(true)}>
          <ListChecks className="h-5 w-5" /> Cuentas
        </button>
        <NavLink
          to="/pos/caja"
          className={({ isActive }) => clsx(navBtn, isActive && 'bg-brand/10 text-brand', !canCash && 'opacity-50')}
        >
          <span className="relative">
            <Wallet className="h-5 w-5" />
            {!canCash && <Lock className="absolute -right-2 -top-1 h-3 w-3" />}
          </span>
          Caja
        </NavLink>
        <button className={clsx(navBtn, 'text-danger')} onClick={exit}>
          {isDevice ? <Lock className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
          {isDevice ? 'Bloquear' : 'Salir'}
        </button>
      </nav>

      <TakeoutModal open={takeout} onClose={() => setTakeout(false)} />
      <OpenTicketsSheet open={openList} onClose={() => setOpenList(false)} />
    </header>
  );
}
