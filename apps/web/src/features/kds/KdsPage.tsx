import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, Check, ChefHat, Eye, EyeOff, RotateCcw, Timer, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { RT } from '@rh/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { useRealtime, useSocketStatus } from '@/lib/socket';
import { sounds } from '@/lib/sound';
import { keepAwake } from '@/platform';
import { Button, EmptyState, ErrorState, PageLoader, toast } from '@/ui';

type Source = 'ORDER' | 'TICKET';
interface KdsItem { id: string; name: string; quantity: number; modifiers: { name: string; quantity: number }[]; note: string | null; doneAt: string | null }
interface KdsGroup { source: Source; id: string; folio: string; label: string; createdAt: string; elapsedMinutes: number; notes: string | null; items: KdsItem[] }
interface Area { id: string; name: string; color: string; isProduction?: boolean }

/** Minutos para pasar a amarillo / rojo. */
export const KDS_WARN_MIN = 10;
export const KDS_DANGER_MIN = 20;
const POLL_MS = 30_000;
const AREA_KEY = 'rh.kds.areaId';

function lsGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string | null) {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* noop */
  }
}

export function KdsPage() {
  const session = useAuth((s) => s.session);
  const deviceArea = session?.kind === 'device' ? session.device.area : null;
  const isDevice = session?.kind === 'device';
  const [picked, setPicked] = useState<string | null>(() => lsGet(AREA_KEY));
  const areas = useQuery({ queryKey: ['areas'], queryFn: () => api.get<Area[]>('/areas'), enabled: !isDevice });

  useEffect(() => {
    void keepAwake(true);
    return () => void keepAwake(false);
  }, []);

  if (isDevice) {
    if (!deviceArea) return <EmptyState className="h-full" title="Esta pantalla no tiene área asignada" description="La dueña puede asignarla en Equipo y tablets." />;
    return <Board areaId={deviceArea.id} areaName={deviceArea.name} />;
  }
  if (areas.isLoading) return <PageLoader />;
  if (areas.error) return <ErrorState error={areas.error} onRetry={() => areas.refetch()} />;
  const list = (areas.data ?? []).filter((a) => a.isProduction !== false);
  const area = list.find((a) => a.id === picked);
  if (!area) return <AreaPicker areas={list} onPick={(id) => { setPicked(id); lsSet(AREA_KEY, id); }} />;
  return <Board areaId={area.id} areaName={area.name} onChangeArea={() => { setPicked(null); lsSet(AREA_KEY, null); }} />;
}

function AreaPicker({ areas, onPick }: { areas: Area[]; onPick: (id: string) => void }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col justify-center p-6">
      <button onClick={() => navigate('/admin')} className="mb-6 flex items-center gap-1 self-start text-sm text-ink-mute"><ArrowLeft className="h-4 w-4" /> Volver al panel</button>
      <h1 className="h-display mb-2 text-3xl font-bold">Pantalla de cocina</h1>
      <p className="mb-6 text-ink-mute">¿Qué área quieres ver?</p>
      {areas.length === 0 ? <EmptyState title="No hay áreas de producción" /> : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {areas.map((a) => (
            <button key={a.id} onClick={() => onPick(a.id)} className="card flex h-32 flex-col items-center justify-center gap-2 text-xl font-bold transition hover:border-brand active:scale-95">
              <span className="h-4 w-4 rounded-full" style={{ background: a.color }} />
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const SOUND_KEY = 'rh.kds.sound';

function Board({ areaId, areaName, onChangeArea }: { areaId: string; areaName: string; onChangeArea?: () => void }) {
  const qc = useQueryClient();
  const [showDone, setShowDone] = useState(false);
  const [sound, setSound] = useState(() => lsGet(SOUND_KEY) !== 'off');
  const online = useSocketStatus();
  const now = useClock();
  const key = ['kds', areaId, showDone] as const;
  const q = useQuery({
    queryKey: key,
    queryFn: () => api.get<KdsGroup[]>('/kds/items', { areaId, includeDone: showDone ? 'true' : undefined }),
    refetchInterval: POLL_MS,
  });
  useRealtime(RT.KDS_UPDATED, () => void qc.invalidateQueries({ queryKey: ['kds', areaId] }));
  useRealtime(RT.ORDER_UPDATED, () => void qc.invalidateQueries({ queryKey: ['kds', areaId] }));

  // sonido y animación para tarjetas nuevas
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!q.data) return;
    const ids = new Set(q.data.map((g) => `${g.source}:${g.id}`));
    if (seen.current) {
      const nuevos = [...ids].filter((id) => !seen.current!.has(id));
      if (nuevos.length) {
        if (sound) sounds.newOrder();
        setFresh(new Set(nuevos));
        setTimeout(() => setFresh(new Set()), 4000);
      }
    }
    seen.current = ids;
  }, [q.data, sound]);

  const [undo, setUndo] = useState<{ source: Source; itemIds: string[]; label: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>();
  const offerUndo = (u: { source: Source; itemIds: string[]; label: string }) => {
    setUndo(u);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 8000);
  };

  const patchLocal = (fn: (gs: KdsGroup[]) => KdsGroup[]) => qc.setQueryData<KdsGroup[]>(key, (old) => (old ? fn(old) : old));

  const toggleItem = async (g: KdsGroup, it: KdsItem) => {
    const done = !it.doneAt;
    sounds.tap();
    patchLocal((gs) => gs.map((x) => (x.id === g.id && x.source === g.source ? { ...x, items: x.items.map((i) => (i.id === it.id ? { ...i, doneAt: done ? new Date().toISOString() : null } : i)) } : x)));
    try {
      await api.post(`/kds/items/${done ? 'done' : 'undo'}`, { source: g.source, itemIds: [it.id] });
      if (done) offerUndo({ source: g.source, itemIds: [it.id], label: `${it.quantity}× ${it.name}` });
    } catch (e) {
      toast.fromError(e);
    } finally {
      void qc.invalidateQueries({ queryKey: ['kds', areaId] });
    }
  };
  const groupDone = async (g: KdsGroup) => {
    sounds.success();
    const pending = g.items.filter((i) => !i.doneAt).map((i) => i.id);
    patchLocal((gs) => (showDone ? gs.map((x) => (x.id === g.id && x.source === g.source ? { ...x, items: x.items.map((i) => ({ ...i, doneAt: i.doneAt ?? new Date().toISOString() })) } : x)) : gs.filter((x) => !(x.id === g.id && x.source === g.source))));
    try {
      await api.post(`/kds/groups/${g.source}/${g.id}/done`);
      if (pending.length) offerUndo({ source: g.source, itemIds: pending, label: `${g.folio} · ${g.label}` });
    } catch (e) {
      toast.fromError(e);
    } finally {
      void qc.invalidateQueries({ queryKey: ['kds', areaId] });
    }
  };
  const doUndo = async () => {
    if (!undo) return;
    const u = undo;
    setUndo(null);
    try {
      await api.post('/kds/items/undo', { source: u.source, itemIds: u.itemIds });
      toast.info('Deshecho', u.label);
    } catch (e) {
      toast.fromError(e);
    } finally {
      void qc.invalidateQueries({ queryKey: ['kds', areaId] });
    }
  };

  const groups = useMemo(() => [...(q.data ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [q.data]);
  const pendingCount = groups.filter((g) => g.items.some((i) => !i.doneAt)).length;
  const clock = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(now);

  return (
    <div className="flex h-full flex-col bg-surface-sunken text-ink">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface-raised px-4 py-2">
        {onChangeArea && (
          <button onClick={onChangeArea} aria-label="Cambiar de área" className="grid h-12 w-12 place-items-center rounded-xl hover:bg-surface-sunken"><ArrowLeft className="h-6 w-6" /></button>
        )}
        <ChefHat className="h-7 w-7 text-brand" />
        <h1 className="h-display text-2xl font-bold sm:text-3xl">{areaName}</h1>
        <span className="rounded-full bg-brand px-3 py-1 text-lg font-bold tabular-nums text-white">{pendingCount}</span>
        <span className="ml-auto flex items-center gap-1.5 text-sm text-ink-mute">
          {online ? <Wifi className="h-5 w-5 text-ok" /> : <WifiOff className="h-5 w-5 animate-pulse text-danger" />}
          <span className="hidden sm:inline">{online ? 'En vivo' : 'Sin conexión'}</span>
        </span>
        <button onClick={() => { setSound((s) => !s); lsSet(SOUND_KEY, sound ? 'off' : 'on'); }} aria-label={sound ? 'Silenciar' : 'Activar sonido'} className="grid h-12 w-12 place-items-center rounded-xl hover:bg-surface-sunken">
          {sound ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6 text-ink-mute" />}
        </button>
        <button onClick={() => setShowDone((s) => !s)} className={clsx('flex h-12 items-center gap-2 rounded-xl px-3 text-sm font-semibold', showDone ? 'bg-ink text-surface' : 'bg-surface-sunken')}>
          {showDone ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          <span className="hidden sm:inline">{showDone ? 'Ocultar terminados' : 'Ver terminados'}</span>
        </button>
        <span className="h-display text-3xl font-bold tabular-nums">{clock}</span>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-3 scroll-thin">
        {q.isLoading ? (
          <PageLoader label="Cargando comandas…" />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState className="h-full" icon={<Check className="h-7 w-7 text-ok" />} title="Todo listo" description="Las comandas nuevas aparecen aquí con un aviso sonoro." />
        ) : (
          <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 2xl:columns-4 [column-fill:_balance]">
            {groups.map((g) => (
              <OrderCard key={`${g.source}:${g.id}`} g={g} now={now} fresh={fresh.has(`${g.source}:${g.id}`)} onItem={(it) => toggleItem(g, it)} onDone={() => groupDone(g)} />
            ))}
          </div>
        )}
      </main>

      {undo && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-4 rounded-2xl bg-ink px-5 py-3 text-surface shadow-lift animate-slide-up">
            <span className="text-base">Listo: <b>{undo.label}</b></span>
            <button onClick={doUndo} className="flex h-12 items-center gap-2 rounded-xl bg-surface/15 px-4 font-bold"><RotateCcw className="h-5 w-5" /> Deshacer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({ g, now, fresh, onItem, onDone }: { g: KdsGroup; now: number; fresh: boolean; onItem: (i: KdsItem) => void; onDone: () => void }) {
  const mins = Math.max(0, Math.floor((now - new Date(g.createdAt).getTime()) / 60000));
  const allDone = g.items.every((i) => i.doneAt);
  const tone = allDone ? 'done' : mins >= KDS_DANGER_MIN ? 'danger' : mins >= KDS_WARN_MIN ? 'warn' : 'ok';
  const head = { ok: 'bg-surface-raised', warn: 'bg-warn text-white', danger: 'bg-danger text-white', done: 'bg-ok text-white' }[tone];
  const border = { ok: 'border-line', warn: 'border-warn', danger: 'border-danger', done: 'border-ok' }[tone];
  return (
    <article className={clsx('mb-3 break-inside-avoid overflow-hidden rounded-2xl border-2 bg-surface-raised shadow-card', border, fresh && 'animate-slide-up ring-4 ring-brand/50', allDone && 'opacity-70')}>
      <header className={clsx('flex items-start justify-between gap-2 px-4 py-3', head)}>
        <div className="min-w-0">
          <p className="h-display text-3xl font-extrabold leading-none tracking-tight">{g.folio}</p>
          <p className="mt-1 truncate text-lg font-semibold leading-tight">{g.label}</p>
        </div>
        <span className={clsx('flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-2xl font-bold tabular-nums', tone === 'ok' && 'bg-surface-sunken', tone === 'danger' && 'animate-pulse')}>
          <Timer className="h-6 w-6" />{mins}′
        </span>
      </header>
      {g.notes && <p className="border-b border-line bg-warn/15 px-4 py-2 text-base font-semibold text-warn">⚠ {g.notes}</p>}
      <ul className="divide-y divide-line">
        {g.items.map((it) => (
          <li key={it.id}>
            <button onClick={() => onItem(it)} className={clsx('flex w-full items-start gap-3 px-4 py-3 text-left transition active:bg-surface-sunken', it.doneAt && 'opacity-45')}>
              <span className={clsx('h-display grid h-12 min-w-[48px] place-items-center rounded-xl text-3xl font-extrabold', it.doneAt ? 'bg-ok/20 text-ok' : 'bg-ink text-surface')}>
                {it.doneAt ? <Check className="h-7 w-7" /> : it.quantity}
              </span>
              <span className="min-w-0 flex-1">
                <span className={clsx('block text-2xl font-bold leading-tight', it.doneAt && 'line-through')}>{it.doneAt ? `${it.quantity}× ` : ''}{it.name}</span>
                {it.modifiers.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {it.modifiers.map((m, i) => (
                      <span key={i} className="rounded-lg bg-brand/15 px-2 py-0.5 text-base font-semibold text-brand">{m.quantity > 1 ? `${m.quantity}× ` : ''}{m.name}</span>
                    ))}
                  </span>
                )}
                {it.note && <span className="mt-1 block rounded-lg bg-warn/15 px-2 py-1 text-lg font-bold text-warn">“{it.note}”</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!allDone && (
        <div className="p-3">
          <Button size="xl" variant="success" block icon={<Check className="h-6 w-6" />} onClick={onDone}>Listo</Button>
        </div>
      )}
    </article>
  );
}
