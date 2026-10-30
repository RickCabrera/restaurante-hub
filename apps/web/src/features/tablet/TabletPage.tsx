import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlarmClock, ArrowLeft, ClipboardList, CloudOff, Expand, LayoutGrid, MessageCircle, RefreshCw, Repeat2, Search, ShoppingBasket,
  Star, Trash2, Unplug, UserRound, Wifi, WifiOff, X,
} from 'lucide-react';
import { RT, roundQty } from '@rh/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { getSocket, useRealtime } from '@/lib/socket';
import { sounds, vibrate } from '@/lib/sound';
import { readableOn } from '@/lib/theme';
import { assetUrl } from '@/lib/config';
import { timeAgo } from '@/lib/format';
import { Avatar, Button, confirm, EmptyState, ErrorState, Modal, PageLoader, Spinner, toast } from '@/ui';
import { StaffPin } from '@/components/StaffPin';
import { SupplyIcon } from '@/icons/supplies';
import { AreaIcon, isOpen, statusLabel } from '@/features/common-req/meta';
import { qtyLabel, SupplyTile } from '@/features/common-req/SupplyTile';
import { newClientId, upsertRequisition, useChatUnread } from '@/features/common-req/hooks';
import type { CatalogSupply, ChatMessage, Requisition, RequisitionTemplate } from '@/features/common-req/types';
import { getFrequency, recordFrequency, useCart } from './cart';
import { outbox, useOutbox } from './outbox';
import { CartSheet } from './CartSheet';
import { QtyModal } from './QtyModal';
import { MyOrders } from './MyOrders';
import { TabletMessages } from './TabletMessages';
import { useLastRequisition, useMyRequisitions, useTabletCatalog, useTemplates } from './useTabletData';

type View = 'grid' | 'orders' | 'messages';
const INACTIVITY_MS = 5 * 60_000;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Estado del socket. Se re-suscribe al cambiar el PIN (getSocket crea un socket nuevo con el staffToken). */
function useSocketOnline() {
  const session = useAuth((s) => s.session);
  const staffToken = useAuth((s) => s.staff?.token);
  const [on, setOn] = useState(() => getSocket().connected);
  useEffect(() => {
    const s = getSocket();
    const up = () => setOn(true);
    const down = () => setOn(false);
    s.on('connect', up);
    s.on('disconnect', down);
    setOn(s.connected);
    return () => {
      s.off('connect', up);
      s.off('disconnect', down);
    };
  }, [session, staffToken]);
  return on;
}

function useOnline() {
  const socketOn = useSocketOnline();
  const [net, setNet] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setNet(true);
    const off = () => setNet(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return net && socketOn;
}

/** Pulsación larga oculta (3 s) para el menú de mantenimiento. */
function useHiddenPress(ms: number, fn: () => void) {
  const t = useRef<number>();
  const cancel = () => window.clearTimeout(t.current);
  return {
    onPointerDown: () => {
      cancel();
      t.current = window.setTimeout(fn, ms);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

export function TabletPage() {
  const qc = useQueryClient();
  const session = useAuth((s) => s.session);
  const business = useAuth((s) => s.business);
  const staff = useAuth((s) => s.staff);
  const clearStaff = useAuth((s) => s.clearStaff);
  const catalogQ = useTabletCatalog();
  const reqsQ = useMyRequisitions();
  const unreadQ = useChatUnread();
  const online = useOnline();
  const pending = useOutbox((s) => s.count);
  const cart = useCart();

  const [view, setView] = useState<View>('grid');
  const [cat, setCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [longSupply, setLongSupply] = useState<CatalogSupply | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ folio: string | null; offline: boolean } | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [kioskOpen, setKioskOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [windowMsg, setWindowMsg] = useState<string | null>(null);
  const [blink, setBlink] = useState(false);

  const device = session?.kind === 'device' ? session.device : null;
  const catalog = catalogQ.data;
  const area = catalog?.area ?? device?.area ?? { id: '', name: 'Área', color: '#E85D04', icon: 'chef' };
  const accent = area.color;
  const onAccent = readableOn(accent);
  const requirePin = !!business?.requirePin;

  const suppliesById = useMemo(() => new Map((catalog?.supplies ?? []).map((s) => [s.id, s])), [catalog]);

  // ---------------------------------------------------------- frecuentes
  const lastQ = useLastRequisition();
  const templatesQ = useTemplates();
  const frequent = useMemo(() => {
    const score: Record<string, number> = { ...getFrequency() };
    for (const it of lastQ.data?.items ?? []) score[it.supplyId] = (score[it.supplyId] ?? 0) + 2;
    for (const t of templatesQ.data ?? []) for (const it of t.items) score[it.supplyId] = (score[it.supplyId] ?? 0) + 1;
    for (const r of reqsQ.data?.items ?? []) for (const it of r.items) score[it.supplyId] = (score[it.supplyId] ?? 0) + 1;
    return Object.entries(score)
      .filter(([id]) => suppliesById.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([id]) => suppliesById.get(id)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastQ.data, templatesQ.data, reqsQ.data, suppliesById, done]);

  const visible = useMemo(() => {
    const all = catalog?.supplies ?? [];
    if (search.trim()) {
      const t = norm(search.trim());
      return all.filter((s) => norm(s.name).includes(t));
    }
    if (cat === 'freq') return frequent;
    if (cat === 'all') return all;
    return all.filter((s) => s.categoryId === cat);
  }, [catalog, cat, search, frequent]);

  // ---------------------------------------------------------- inactividad → quitar PIN
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    const touch = () => (lastActivity.current = Date.now());
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    const iv = window.setInterval(() => {
      if (useAuth.getState().staff && Date.now() - lastActivity.current > INACTIVITY_MS) {
        clearStaff();
        setView('grid');
      }
    }, 15_000);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      window.clearInterval(iv);
    };
  }, [clearStaff]);

  // ---------------------------------------------------------- sin zoom con pellizco
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', prevent);
    const multi = (e: TouchEvent) => e.touches.length > 1 && e.preventDefault();
    document.addEventListener('touchmove', multi, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('touchmove', multi);
    };
  }, []);

  // ---------------------------------------------------------- cola sin conexión
  const flush = useCallback(async () => {
    const sent = await outbox.flush();
    if (sent.length) {
      sounds.success();
      toast.success(sent.length === 1 ? `Pedido ${sent[0].folio} enviado` : `${sent.length} pedidos enviados`);
      for (const r of sent) upsertRequisition(qc, r);
    }
  }, [qc]);
  const staffToken = staff?.token;
  useEffect(() => {
    void outbox.refreshCount().then(flush);
    const s = getSocket();
    const onConnect = () => void flush();
    s.on('connect', onConnect);
    window.addEventListener('online', onConnect);
    const iv = window.setInterval(() => {
      if (useOutbox.getState().count) void flush();
    }, 20_000);
    return () => {
      s.off('connect', onConnect);
      window.removeEventListener('online', onConnect);
      window.clearInterval(iv);
    };
  }, [flush, staffToken]);

  // ---------------------------------------------------------- tiempo real
  useRealtime<Requisition>(RT.REQUISITION_UPDATED, (r) => {
    upsertRequisition(qc, r);
    sounds.message();
    toast.info(`${r.folio}: ${statusLabel(r.status)}`, r.status === 'SURTIDA' ? 'Confirma la recepción en “Mis pedidos”' : undefined);
  });
  useRealtime<Requisition>(RT.REQUISITION_CREATED, (r) => upsertRequisition(qc, r));
  useRealtime<ChatMessage>(RT.MESSAGE_CREATED, (m) => {
    void qc.invalidateQueries({ queryKey: ['chat-unread'] });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
    if (m.authorSide !== 'AREA' && view !== 'messages') {
      sounds.message();
      setBlink(true);
      if (m.isBroadcast || m.conversation?.type === 'GENERAL') toast.info('Aviso de la dueña', m.body ?? '');
    }
  });
  useRealtime(RT.MESSAGE_READ, () => void qc.invalidateQueries({ queryKey: ['chat-unread'] }));
  useRealtime<{ message: string; minutesLeft: number; until: string }>(RT.REQUISITION_WINDOW_CLOSING, (p) => {
    sounds.urgent();
    setWindowMsg(p.message || `Quedan ${p.minutesLeft} min para pedir (hasta las ${p.until})`);
  });
  useEffect(() => {
    if (view === 'messages') setBlink(false);
  }, [view]);

  // ---------------------------------------------------------- carrito
  const lines = cart.order.map((id) => cart.lines[id]).filter((l) => l && suppliesById.has(l.supplyId));
  const tap = (s: CatalogSupply) => {
    const cur = cart.lines[s.id]?.qty ?? 0;
    const next = roundQty(cur + s.step);
    if (s.maxPerOrder != null && next > s.maxPerOrder + 1e-9) {
      sounds.error();
      vibrate([30, 30, 30]);
      toast.warning(`Máximo ${qtyLabel(s.maxPerOrder, s.unit)} de ${s.name}`);
      return;
    }
    sounds.tap();
    vibrate(10);
    cart.setQty(s.id, next);
  };
  const minus = (s: CatalogSupply) => {
    sounds.tap();
    vibrate(10);
    cart.setQty(s.id, roundQty((cart.lines[s.id]?.qty ?? 0) - s.step));
  };

  const send = async () => {
    if (requirePin && !useAuth.getState().staff) {
      setPinOpen(true);
      return;
    }
    const body = {
      clientRequestId: newClientId(),
      priority: cart.priority,
      note: cart.note.trim() || undefined,
      items: lines.map((l) => ({ supplyId: l.supplyId, quantity: l.qty, note: l.note?.trim() || undefined })),
    };
    setSending(true);
    try {
      const r = await api.post<Requisition>('/requisitions', body);
      recordFrequency(body.items.map((i) => i.supplyId));
      upsertRequisition(qc, r);
      void qc.invalidateQueries({ queryKey: ['req-last'] });
      sounds.success();
      vibrate([20, 40, 20]);
      cart.clear();
      setCartOpen(false);
      setDone({ folio: r.folio, offline: false });
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        await outbox.add(body);
        recordFrequency(body.items.map((i) => i.supplyId));
        sounds.success();
        cart.clear();
        setCartOpen(false);
        setDone({ folio: null, offline: true });
      } else {
        sounds.error();
        toast.fromError(e);
        if (e instanceof ApiError && e.status === 400 && /PIN/i.test(e.message)) setPinOpen(true);
      }
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setDone(null), 3000);
    return () => window.clearTimeout(t);
  }, [done]);

  const saveTemplate = async () => {
    const name = await confirm({ title: 'Guardar como plantilla', description: 'Ponle un nombre para cargarlo después con un toque.', input: { label: 'Nombre', placeholder: 'Pedido de lunes', required: true }, confirmText: 'Guardar' });
    if (!name) return;
    try {
      await api.post('/requisition-templates', { name: name.trim().slice(0, 60), items: lines.map((l) => ({ supplyId: l.supplyId, quantity: l.qty })) });
      void qc.invalidateQueries({ queryKey: ['req-templates'] });
      toast.success('Plantilla guardada');
    } catch (e) {
      toast.fromError(e);
    }
  };

  const loadItems = async (items: { supplyId: string; quantity: number; available: boolean }[], label: string) => {
    const avail = items.filter((i) => i.available && suppliesById.has(i.supplyId));
    if (!avail.length) return toast.warning('Esos insumos ya no están disponibles');
    let replace = true;
    if (lines.length) {
      const ok = await confirm({ title: 'Ya tienes insumos en el pedido', description: '¿Quieres reemplazarlos? (Cancelar = sumarlos)', confirmText: 'Reemplazar', cancelText: 'Sumar' });
      replace = !!ok;
    }
    cart.load(avail, replace);
    sounds.success();
    setRepeatOpen(false);
    setView('grid');
    toast.success(`${label} cargado`, avail.length < items.length ? `${items.length - avail.length} insumos ya no están disponibles` : undefined);
  };

  const openCount = (reqsQ.data?.items ?? []).filter((r) => isOpen(r.status)).length;
  const toReceive = (reqsQ.data?.items ?? []).filter((r) => r.status === 'SURTIDA').length;
  const unread = unreadQ.data?.unread ?? 0;
  const hidden = useHiddenPress(3000, () => {
    vibrate(50);
    setKioskOpen(true);
  });

  // ---------------------------------------------------------- PIN obligatorio
  if (requirePin && !staff) {
    return (
      <div className="flex h-full flex-col bg-surface no-select">
        <div className="flex h-20 items-center gap-3 px-5" style={{ background: accent, color: onAccent }} {...hidden}>
          <AreaIcon icon={area.icon} className="h-10 w-10" />
          <span className="h-display text-3xl font-bold">{area.name}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <StaffPin title="¿Quién pide?" />
        </div>
        {kioskOpen && <KioskMenu onClose={() => setKioskOpen(false)} />}
      </div>
    );
  }

  if (pinOpen) {
    return (
      <div className="h-full overflow-y-auto bg-surface">
        <StaffPin title="¿Quién pide?" onCancel={() => setPinOpen(false)} onDone={() => setPinOpen(false)} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface" style={{ touchAction: 'pan-x pan-y' }}>
      {/* ------------------------------------------------ encabezado */}
      <header className="flex shrink-0 items-center gap-2 px-3 py-2.5 shadow-sm sm:gap-3 sm:px-4 no-select" style={{ background: accent, color: onAccent }}>
        {view !== 'grid' ? (
          <button onClick={() => setView('grid')} className="flex h-16 items-center gap-2 rounded-2xl bg-black/15 px-4 text-xl font-bold active:scale-95">
            <ArrowLeft className="h-8 w-8" /> Insumos
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-3" {...hidden}>
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-black/15">
              <AreaIcon icon={area.icon} className="h-9 w-9" />
            </span>
            <span className="min-w-0">
              <span className="h-display block truncate text-3xl font-bold leading-none">{area.name}</span>
              <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold opacity-90">
                {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                {online ? 'En línea' : 'Sin conexión'}
              </span>
            </span>
          </div>
        )}
        <div className="flex-1" />
        {staff ? (
          <button onClick={() => setPinOpen(true)} className="flex h-16 items-center gap-2 rounded-2xl bg-black/15 py-1 pl-1.5 pr-3 active:scale-95" aria-label="Cambiar persona">
            <Avatar name={staff.staff.name} color={staff.staff.avatarColor} size={48} className="ring-2 ring-white/70" />
            <span className="hidden max-w-[8rem] truncate text-lg font-bold lg:block">{staff.staff.name.split(' ')[0]}</span>
          </button>
        ) : (
          <button onClick={() => setPinOpen(true)} className="flex h-16 items-center gap-2 rounded-2xl bg-black/15 px-4 text-lg font-bold active:scale-95">
            <UserRound className="h-7 w-7" /> <span className="hidden md:inline">¿Quién pide?</span>
          </button>
        )}
        <HeaderBtn label="Repetir" icon={<Repeat2 className="h-8 w-8" />} onClick={() => setRepeatOpen(true)} />
        <HeaderBtn label="Mis pedidos" icon={<ClipboardList className="h-8 w-8" />} count={openCount} alert={toReceive > 0} active={view === 'orders'} onClick={() => setView(view === 'orders' ? 'grid' : 'orders')} />
        <HeaderBtn
          label="Mensajes"
          icon={<MessageCircle className="h-8 w-8" />}
          count={unread}
          blink={blink || unread > 0}
          active={view === 'messages'}
          onClick={() => setView(view === 'messages' ? 'grid' : 'messages')}
        />
      </header>

      {/* ------------------------------------------------ avisos */}
      {pending > 0 && (
        <div className="flex shrink-0 items-center gap-3 bg-warn px-4 py-3 text-lg font-bold text-white">
          <CloudOff className="h-7 w-7 shrink-0" />
          <span className="flex-1">
            Sin conexión — se enviará al reconectar ({pending} {pending === 1 ? 'pendiente' : 'pendientes'})
          </span>
          <button onClick={() => void flush()} className="flex h-12 items-center gap-2 rounded-xl bg-black/15 px-4 active:scale-95">
            {useOutbox.getState().flushing ? <Spinner className="h-5 w-5" /> : <RefreshCw className="h-5 w-5" />} Reintentar
          </button>
        </div>
      )}
      {windowMsg && (
        <div className="flex shrink-0 items-center gap-3 bg-danger px-4 py-3 text-lg font-bold text-white">
          <AlarmClock className="h-7 w-7 shrink-0 animate-pulse" />
          <span className="flex-1">{windowMsg}</span>
          <button onClick={() => setWindowMsg(null)} className="grid h-12 w-12 place-items-center rounded-xl bg-black/15" aria-label="Cerrar aviso">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
      {!online && pending === 0 && view === 'grid' && (
        <div className="flex shrink-0 items-center gap-2 bg-surface-sunken px-4 py-2 text-ink-soft">
          <WifiOff className="h-5 w-5" /> Sin conexión. Puedes armar tu pedido; se enviará cuando regrese el internet.
        </div>
      )}

      {/* ------------------------------------------------ contenido */}
      <div className="min-h-0 flex-1">
        {view === 'orders' && (
          <div className="h-full overflow-y-auto scroll-thin">
            <MyOrders accent={accent} />
          </div>
        )}
        {view === 'messages' && <TabletMessages accent={accent} />}
        {view === 'grid' && (
          <div className="flex h-full flex-col">
            {/* pestañas */}
            <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-raised px-3 py-2.5 no-select">
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5 scroll-thin">
                <CatTab active={!search && cat === 'all'} accent={accent} onClick={() => { setSearch(''); setCat('all'); }} icon={<LayoutGrid className="h-8 w-8" />} label="Todos" />
                {frequent.length > 0 && (
                  <CatTab active={!search && cat === 'freq'} accent={accent} onClick={() => { setSearch(''); setCat('freq'); }} icon={<Star className="h-8 w-8" />} label="Frecuentes" />
                )}
                {(catalog?.categories ?? [])
                  .filter((c) => catalog?.supplies.some((s) => s.categoryId === c.id))
                  .map((c) => (
                    <CatTab key={c.id} active={!search && cat === c.id} accent={accent} onClick={() => { setSearch(''); setCat(c.id); }} icon={<SupplyIcon icon={c.icon} label={c.name} size={36} />} label={c.name} />
                  ))}
              </div>
              <label className="relative hidden shrink-0 sm:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-ink-mute" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar"
                  className="input h-16 w-44 rounded-2xl pl-11 text-lg lg:w-56"
                  type="search"
                  aria-label="Buscar insumo"
                />
              </label>
            </div>
            {/* cuadrícula */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3 scroll-thin sm:p-4 no-select">
              <label className="relative mb-3 block sm:hidden">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-6 w-6 -translate-y-1/2 text-ink-mute" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar insumo" className="input h-14 rounded-2xl pl-11 text-lg" type="search" />
              </label>
              {catalogQ.isLoading && !catalog ? (
                <PageLoader label="Cargando insumos…" />
              ) : catalogQ.error && !catalog ? (
                <ErrorState error={catalogQ.error} onRetry={() => catalogQ.refetch()} />
              ) : visible.length === 0 ? (
                <EmptyState title={search ? 'No encontramos ese insumo' : 'Sin insumos'} description={search ? 'Prueba con otra palabra.' : 'La dueña aún no asigna insumos a esta área.'} />
              ) : (
                <div className="grid grid-cols-2 gap-3 min-[560px]:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 xl:grid-cols-6">
                  {visible.map((s) => {
                    const q = cart.lines[s.id]?.qty ?? 0;
                    return (
                      <SupplyTile
                        key={s.id}
                        supply={s}
                        qty={q}
                        accent={accent}
                        onTap={() => tap(s)}
                        onMinus={() => minus(s)}
                        onLongPress={() => {
                          vibrate(30);
                          setLongSupply(s);
                        }}
                        atMax={s.maxPerOrder != null && q >= s.maxPerOrder - 1e-9}
                      />
                    );
                  })}
                </div>
              )}
              <div className="h-4" />
            </div>
            {/* barra del carrito */}
            <CartBar lines={lines} supplies={suppliesById} accent={accent} onOpen={() => setCartOpen(true)} urgent={cart.priority === 'URGENTE'} onClear={async () => {
              if (await confirm({ title: '¿Vaciar el pedido?', danger: true, confirmText: 'Vaciar' })) cart.clear();
            }} />
          </div>
        )}
      </div>

      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} supplies={suppliesById} accent={accent} sending={sending} onSend={send} onSaveTemplate={saveTemplate} />
      <QtyModal
        supply={longSupply}
        qty={longSupply ? cart.lines[longSupply.id]?.qty ?? 0 : 0}
        note={longSupply ? cart.lines[longSupply.id]?.note : ''}
        onClose={() => setLongSupply(null)}
        onSave={(q, n) => longSupply && cart.setQty(longSupply.id, q, n)}
      />
      {repeatOpen && (
        <RepeatModal
          onClose={() => setRepeatOpen(false)}
          last={lastQ.data}
          templates={templatesQ.data ?? []}
          loading={lastQ.isLoading || templatesQ.isLoading}
          onLoad={loadItems}
          onDeleteTemplate={async (t) => {
            if (!(await confirm({ title: `¿Borrar “${t.name}”?`, danger: true, confirmText: 'Borrar' }))) return;
            try {
              await api.del(`/requisition-templates/${t.id}`);
              void qc.invalidateQueries({ queryKey: ['req-templates'] });
            } catch (e) {
              toast.fromError(e);
            }
          }}
        />
      )}
      {kioskOpen && <KioskMenu onClose={() => setKioskOpen(false)} />}
      {done && <SentOverlay folio={done.folio} offline={done.offline} accent={accent} onClose={() => setDone(null)} />}
    </div>
  );
}

function HeaderBtn({ label, icon, count, onClick, active, blink, alert }: { label: string; icon: React.ReactNode; count?: number; onClick: () => void; active?: boolean; blink?: boolean; alert?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative flex h-16 min-w-[4rem] items-center justify-center gap-2 rounded-2xl px-3 text-lg font-bold transition active:scale-95',
        active ? 'bg-surface-raised text-ink shadow-card' : 'bg-black/15',
      )}
      aria-label={label}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
      {!!count && (
        <span className={clsx('absolute -right-1.5 -top-1.5 grid h-8 min-w-[2rem] place-items-center rounded-full border-2 border-white px-1.5 text-base font-black text-white', alert || blink ? 'bg-danger' : 'bg-ink')}>
          {count > 99 ? '99+' : count}
        </span>
      )}
      {blink && !active && <span className="pointer-events-none absolute inset-0 animate-ring rounded-2xl" />}
    </button>
  );
}

function CatTab({ active, onClick, icon, label, accent }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; accent: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx('flex h-16 shrink-0 items-center gap-2 rounded-2xl border-2 px-4 text-lg font-bold transition active:scale-95', active ? 'text-white shadow-card' : 'border-line bg-surface text-ink-soft')}
      style={active ? { background: accent, borderColor: accent, color: readableOn(accent) } : undefined}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function CartBar({ lines, supplies, accent, onOpen, onClear, urgent }: { lines: { supplyId: string; qty: number }[]; supplies: Map<string, CatalogSupply>; accent: string; onOpen: () => void; onClear: () => void; urgent: boolean }) {
  if (!lines.length) {
    return (
      <div className="shrink-0 border-t border-line bg-surface-raised px-4 py-4 text-center text-lg text-ink-mute safe-bottom no-select">
        Toca un insumo para agregarlo · mantén presionado para escribir la cantidad
      </div>
    );
  }
  return (
    <div className="shrink-0 border-t border-line bg-surface-raised px-3 py-3 shadow-lift safe-bottom no-select sm:px-4">
      <div className="flex items-center gap-3">
        <button onClick={onClear} className="grid h-20 w-16 shrink-0 place-items-center rounded-2xl bg-surface-sunken text-ink-mute active:scale-95" aria-label="Vaciar pedido">
          <Trash2 className="h-7 w-7" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="h-display text-2xl font-bold leading-tight">
            {lines.length} {lines.length === 1 ? 'insumo' : 'insumos'}
            {urgent && <span className="ml-2 rounded-full bg-danger px-2.5 py-0.5 align-middle text-sm font-black text-white">URGENTE</span>}
          </p>
          <div className="mt-1 flex gap-1.5 overflow-hidden">
            {lines.slice(0, 8).map((l) => {
              const s = supplies.get(l.supplyId);
              if (!s) return null;
              return (
                <span key={l.supplyId} className="flex shrink-0 items-center gap-1 rounded-full bg-surface-sunken py-0.5 pl-0.5 pr-2.5 text-sm font-semibold">
                  <SupplyIcon icon={s.icon} imageUrl={assetUrl(s.imageUrl)} label={s.name} size={24} />
                  {qtyLabel(l.qty, s.unit)}
                </span>
              );
            })}
            {lines.length > 8 && <span className="shrink-0 rounded-full bg-surface-sunken px-2.5 py-0.5 text-sm font-semibold">+{lines.length - 8}</span>}
          </div>
        </div>
        <button
          onClick={onOpen}
          className="flex h-20 shrink-0 items-center gap-3 rounded-3xl px-6 text-2xl font-black text-white shadow-lift active:scale-95 sm:px-8"
          style={{ background: urgent ? 'rgb(var(--danger))' : accent, color: urgent ? '#fff' : readableOn(accent) }}
        >
          <ShoppingBasket className="h-9 w-9" />
          Ver pedido
        </button>
      </div>
    </div>
  );
}

function SentOverlay({ folio, offline, accent, onClose }: { folio: string | null; offline: boolean; accent: string; onClose: () => void }) {
  return (
    <button onClick={onClose} className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 text-white animate-slide-up" style={{ background: offline ? 'rgb(var(--warn))' : 'rgb(var(--ok))' }}>
      <span className="grid h-48 w-48 place-items-center rounded-full bg-white/20 animate-pop">
        {offline ? (
          <CloudOff className="h-28 w-28" strokeWidth={2.5} />
        ) : (
          <svg viewBox="0 0 24 24" className="h-32 w-32" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
      <p className="h-display text-6xl font-bold">{offline ? 'Guardado' : '¡Enviado!'}</p>
      {folio && <p className="h-display rounded-2xl bg-white/20 px-6 py-2 text-4xl font-bold tracking-wide">{folio}</p>}
      <p className="max-w-xl px-6 text-center text-2xl font-medium opacity-90">{offline ? 'No hay internet. Se enviará solo en cuanto regrese la conexión.' : 'La dueña ya lo tiene en su celular.'}</p>
      <span className="sr-only" style={{ color: accent }} />
    </button>
  );
}

function RepeatModal({
  onClose,
  last,
  templates,
  loading,
  onLoad,
  onDeleteTemplate,
}: {
  onClose: () => void;
  last?: { requisition: { folio: string; createdAt: string } | null; items: { supplyId: string; quantity: number; available: boolean; supplyName: string; unit: CatalogSupply['unit']; icon: string | null; imageUrl: string | null }[] };
  templates: RequisitionTemplate[];
  loading: boolean;
  onLoad: (items: { supplyId: string; quantity: number; available: boolean }[], label: string) => void;
  onDeleteTemplate: (t: RequisitionTemplate) => void;
}) {
  const Preview = ({ items }: { items: RequisitionTemplate['items'] }) => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.slice(0, 10).map((i) => (
        <span key={i.supplyId} className={clsx('flex items-center gap-1 rounded-full bg-surface-sunken py-0.5 pl-0.5 pr-2.5 text-sm font-semibold', !i.available && 'line-through opacity-50')}>
          <SupplyIcon icon={i.icon} imageUrl={assetUrl(i.imageUrl)} label={i.supplyName} size={24} />
          {qtyLabel(i.quantity, i.unit)}
        </span>
      ))}
      {items.length > 10 && <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-sm font-semibold">+{items.length - 10}</span>}
    </div>
  );
  return (
    <Modal open onClose={onClose} size="lg" title="Repetir un pedido">
      {loading ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          {last?.requisition && last.items.length > 0 ? (
            <div className="card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold uppercase tracking-wide text-ink-mute">Último pedido</p>
                  <p className="h-display text-2xl font-bold">
                    {last.requisition.folio} <span className="text-base font-medium text-ink-mute">· {timeAgo(last.requisition.createdAt)}</span>
                  </p>
                </div>
                <Button size="xl" icon={<Repeat2 className="h-7 w-7" />} onClick={() => onLoad(last.items, 'Último pedido')}>
                  Repetir último
                </Button>
              </div>
              <Preview items={last.items} />
            </div>
          ) : (
            <p className="rounded-2xl bg-surface-sunken p-4 text-center text-ink-mute">Aún no hay un pedido anterior.</p>
          )}
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-mute">Plantillas</p>
            {templates.length === 0 ? (
              <p className="rounded-2xl bg-surface-sunken p-4 text-center text-ink-mute">Arma un pedido y toca “Guardar plantilla” para tenerlo aquí.</p>
            ) : (
              <div className="space-y-3">
                {templates.map((t) => (
                  <div key={t.id} className="card p-4">
                    <div className="flex items-center gap-3">
                      <p className="h-display flex-1 text-xl font-bold">{t.name}</p>
                      <button onClick={() => onDeleteTemplate(t)} className="grid h-14 w-14 place-items-center rounded-2xl text-ink-mute active:scale-90" aria-label="Borrar plantilla">
                        <Trash2 className="h-6 w-6" />
                      </button>
                      <Button size="lg" className="h-14 px-6 text-lg" onClick={() => onLoad(t.items, t.name)}>
                        Cargar
                      </Button>
                    </div>
                    <Preview items={t.items} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function KioskMenu({ onClose }: { onClose: () => void }) {
  const unpair = async () => {
    const ok = await confirm({ title: '¿Desvincular esta tablet?', description: 'Tendrás que emparejarla otra vez con un código nuevo.', danger: true, confirmText: 'Desvincular' });
    if (!ok) return;
    useAuth.getState().logout();
    window.location.href = '/emparejar';
  };
  const Item = ({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
    <button onClick={onClick} className={clsx('flex h-16 w-full items-center gap-3 rounded-2xl bg-surface-sunken px-4 text-lg font-semibold active:scale-[0.98]', danger && 'text-danger')}>
      {icon}
      {label}
    </button>
  );
  return (
    <Modal open onClose={onClose} size="sm" title="Mantenimiento">
      <div className="space-y-2">
        <Item icon={<RefreshCw className="h-6 w-6" />} label="Recargar" onClick={() => window.location.reload()} />
        <Item
          icon={<Expand className="h-6 w-6" />}
          label="Pantalla completa"
          onClick={() => {
            void document.documentElement.requestFullscreen?.().catch(() => toast.error('No se pudo activar'));
            onClose();
          }}
        />
        <Item icon={<Unplug className="h-6 w-6" />} label="Desvincular tablet" danger onClick={unpair} />
      </div>
    </Modal>
  );
}
