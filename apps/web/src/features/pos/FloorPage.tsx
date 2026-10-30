import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { LayoutGrid, List, Minus, Plus, Users, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { money, minutesSince } from '@/lib/format';
import { Button, EmptyState, ErrorState, Modal, PageLoader, toast } from '@/ui';
import { useFloor, useSetTicket, type FloorTable, type Ticket } from './api';
import { floorBounds, tableSize, useMeasure } from './components/floor';

const VIEW_KEY = 'rh.pos.floorView';
const AREA_KEY = 'rh.pos.floorArea';
const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* noop */
    }
  },
};

const STATUS_STYLE = {
  LIBRE: 'bg-surface-raised border-ok/50 text-ink shadow-[inset_0_0_0_999px_rgb(var(--ok)/0.10)] hover:shadow-[inset_0_0_0_999px_rgb(var(--ok)/0.18)]',
  OCUPADA: 'bg-brand border-brand-700 text-white',
  POR_COBRAR: 'bg-warn border-warn text-white',
} as const;
const STATUS_LABEL = { LIBRE: 'Libre', OCUPADA: 'Ocupada', POR_COBRAR: 'Por cobrar' } as const;

export function FloorPage() {
  const floor = useFloor();
  const navigate = useNavigate();
  const [areaId, setAreaId] = useState<string | null>(() => ls.get(AREA_KEY));
  const [view, setView] = useState<'plan' | 'list'>(() => (ls.get(VIEW_KEY) === 'list' ? 'list' : 'plan'));
  const [opening, setOpening] = useState<FloorTable | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const areas = floor.data ?? [];
  const area = areas.find((a) => a.id === areaId) ?? areas[0];

  const counts = useMemo(() => {
    const all = areas.flatMap((a) => a.tables);
    return { libre: all.filter((t) => t.status === 'LIBRE').length, ocupada: all.filter((t) => t.status !== 'LIBRE').length };
  }, [areas]);

  if (floor.isLoading) return <PageLoader label="Cargando mesas…" />;
  if (floor.error) return <ErrorState error={floor.error} onRetry={() => floor.refetch()} />;
  if (!areas.length)
    return <EmptyState className="h-full" icon={<LayoutGrid className="h-7 w-7" />} title="No hay salones ni mesas" description="La dueña puede crearlos en Administración → Mesas. Mientras, usa “Para llevar”." />;

  const onTable = (t: FloorTable) => {
    if (t.ticket) navigate(`/pos/cuenta/${t.ticket.id}`);
    else setOpening(t);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pb-2 pt-3 sm:px-4">
        <div className="flex gap-1 overflow-x-auto scroll-thin">
          {areas.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setAreaId(a.id);
                ls.set(AREA_KEY, a.id);
              }}
              className={clsx(
                'h-12 shrink-0 rounded-xl px-5 text-base font-semibold transition active:scale-95',
                a.id === area?.id ? 'bg-ink text-surface' : 'bg-surface-sunken text-ink-soft',
              )}
            >
              {a.name}
              <span className="ml-2 text-xs opacity-70">{a.tables.filter((t) => t.status !== 'LIBRE').length}/{a.tables.length}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-3 text-xs text-ink-mute sm:flex">
            <Legend cls="bg-ok/30 border border-ok/50" label={`Libres ${counts.libre}`} />
            <Legend cls="bg-brand" label={`Ocupadas ${counts.ocupada}`} />
            <Legend cls="bg-warn" label="Por cobrar" />
          </span>
          <div className="flex rounded-xl bg-surface-sunken p-1">
            {(['plan', 'list'] as const).map((v) => (
              <button
                key={v}
                aria-label={v === 'plan' ? 'Ver plano' : 'Ver lista'}
                onClick={() => {
                  setView(v);
                  ls.set(VIEW_KEY, v);
                }}
                className={clsx('grid h-10 w-12 place-items-center rounded-lg', view === v ? 'bg-surface-raised shadow-sm' : 'text-ink-mute')}
              >
                {v === 'plan' ? <LayoutGrid className="h-5 w-5" /> : <List className="h-5 w-5" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-3 pb-3 sm:px-4">
        {area && (area.tables.length === 0 ? (
          <EmptyState title="Este salón no tiene mesas" />
        ) : view === 'plan' ? (
          <FloorPlan tables={area.tables} onTable={onTable} />
        ) : (
          <FloorList tables={area.tables} onTable={onTable} />
        ))}
      </div>

      <OpenTableModal table={opening} onClose={() => setOpening(null)} />
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx('h-3 w-3 rounded', cls)} />
      {label}
    </span>
  );
}

function FloorPlan({ tables, onTable }: { tables: FloorTable[]; onTable: (t: FloorTable) => void }) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const b = floorBounds(tables);
  const scale = size.width ? Math.min(size.width / b.w, size.height / b.h, 1.8) : 0;
  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden rounded-3xl border border-line bg-surface-sunken/60">
      {scale > 0 && (
        <div className="absolute left-1/2 top-1/2" style={{ width: b.w * scale, height: b.h * scale, transform: 'translate(-50%,-50%)' }}>
          {tables.map((t) => {
            const s = tableSize(t.shape);
            const mins = t.ticket ? minutesSince(t.ticket.openedAt) : 0;
            const fs = Math.max(0.75, Math.min(1.3, scale));
            return (
              <button
                key={t.id}
                onClick={() => onTable(t)}
                style={{ left: t.posX * scale, top: t.posY * scale, width: s.w * scale, height: s.h * scale, fontSize: `${fs}rem` }}
                className={clsx(
                  'absolute flex flex-col items-center justify-center border-2 p-1 text-center shadow-card transition active:scale-95',
                  t.shape === 'round' ? 'rounded-full' : 'rounded-2xl',
                  STATUS_STYLE[t.status],
                )}
                aria-label={`Mesa ${t.name}, ${STATUS_LABEL[t.status]}`}
              >
                <span className="h-display font-bold leading-none" style={{ fontSize: '1.6em' }}>{t.name}</span>
                {t.ticket ? (
                  <>
                    <span className="h-display font-semibold tabular-nums leading-tight" style={{ fontSize: '0.85em' }}>{money(t.ticket.totalCents)}</span>
                    <span className="leading-tight opacity-90" style={{ fontSize: '0.62em' }}>
                      {mins} min{t.ticket.waiterName ? ` · ${t.ticket.waiterName.split(' ')[0]}` : ''}
                    </span>
                  </>
                ) : (
                  <span className="flex items-center gap-0.5 text-ink-mute" style={{ fontSize: '0.65em' }}>
                    <Users className="h-[1em] w-[1em]" /> {t.capacity}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FloorList({ tables, onTable }: { tables: FloorTable[]; onTable: (t: FloorTable) => void }) {
  return (
    <div className="grid h-full auto-rows-min grid-cols-2 gap-3 overflow-y-auto pb-4 scroll-thin sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {tables.map((t) => (
        <button
          key={t.id}
          onClick={() => onTable(t)}
          className={clsx('flex min-h-[96px] flex-col items-start justify-between rounded-2xl border-2 p-3 text-left transition active:scale-95', STATUS_STYLE[t.status])}
        >
          <span className="flex w-full items-center justify-between">
            <span className="h-display text-2xl font-bold">Mesa {t.name}</span>
            <span className="text-xs font-semibold opacity-80">{STATUS_LABEL[t.status]}</span>
          </span>
          {t.ticket ? (
            <span className="flex w-full items-end justify-between gap-2">
              <span className="text-xs opacity-90">
                <Clock className="mr-0.5 inline h-3 w-3" />
                {minutesSince(t.ticket.openedAt)} min · {t.ticket.waiterName?.split(' ')[0] ?? ''}
              </span>
              <span className="h-display text-lg font-bold tabular-nums">{money(t.ticket.totalCents)}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm text-ink-mute"><Users className="h-4 w-4" /> {t.capacity} personas</span>
          )}
        </button>
      ))}
    </div>
  );
}

function OpenTableModal({ table, onClose }: { table: FloorTable | null; onClose: () => void }) {
  const [guests, setGuests] = useState(2);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const setTicket = useSetTicket();
  useEffect(() => {
    if (table) setGuests(Math.min(2, table.capacity));
  }, [table]);

  const open = async () => {
    if (!table) return;
    setBusy(true);
    try {
      const t = await api.post<Ticket>('/pos/tickets', { tableId: table.id, guests });
      setTicket(t);
      onClose();
      navigate(`/pos/cuenta/${t.id}`);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!table}
      onClose={onClose}
      size="sm"
      title={table ? `Abrir mesa ${table.name}` : ''}
      footer={
        <Button size="xl" block loading={busy} onClick={open}>
          Abrir mesa
        </Button>
      }
    >
      <p className="mb-4 text-center text-sm text-ink-mute">¿Cuántas personas?</p>
      <div className="flex items-center justify-center gap-6">
        <button aria-label="Menos personas" onClick={() => setGuests((g) => Math.max(1, g - 1))} className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-sunken active:scale-95">
          <Minus className="h-7 w-7" />
        </button>
        <span className="h-display w-20 text-center text-6xl font-bold tabular-nums">{guests}</span>
        <button aria-label="Más personas" onClick={() => setGuests((g) => Math.min(99, g + 1))} className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-sunken active:scale-95">
          <Plus className="h-7 w-7" />
        </button>
      </div>
      <div className="mt-5 grid grid-cols-6 gap-2">
        {[1, 2, 3, 4, 6, 8].map((n) => (
          <button key={n} onClick={() => setGuests(n)} className={clsx('h-12 rounded-xl font-semibold', guests === n ? 'bg-brand text-white' : 'bg-surface-sunken')}>
            {n}
          </button>
        ))}
      </div>
    </Modal>
  );
}
