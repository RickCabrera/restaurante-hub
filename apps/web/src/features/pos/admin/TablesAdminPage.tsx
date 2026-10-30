import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Circle, LayoutGrid, Pencil, Plus, RectangleHorizontal, Save, Square, Trash2, Undo2 } from 'lucide-react';
import { RT } from '@rh/shared';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/socket';
import { Button, EmptyState, ErrorState, IconButton, Input, Modal, PageHeader, PageLoader, Select, confirm, toast } from '@/ui';
import type { DiningArea, DiningTable, TableShape } from '../api';
import { floorBounds, tableSize } from '../components/floor';

const GRID = 10;
const snap = (v: number) => Math.max(0, Math.round(v / GRID) * GRID);
const SHAPES: { value: TableShape; label: string; icon: typeof Square }[] = [
  { value: 'square', label: 'Cuadrada', icon: Square },
  { value: 'round', label: 'Redonda', icon: Circle },
  { value: 'rect', label: 'Rectangular', icon: RectangleHorizontal },
];

export function TablesAdminPage() {
  const qc = useQueryClient();
  const areasQ = useQuery({ queryKey: ['pos', 'admin', 'areas'], queryFn: () => api.get<DiningArea[]>('/pos/dining-areas') });
  const tablesQ = useQuery({ queryKey: ['pos', 'admin', 'tables'], queryFn: () => api.get<DiningTable[]>('/pos/tables') });
  const [areaId, setAreaId] = useState<string | null>(null);
  const [areaModal, setAreaModal] = useState<DiningArea | 'new' | null>(null);
  const [tableModal, setTableModal] = useState<DiningTable | 'new' | null>(null);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [saving, setSaving] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['pos', 'admin'] });
    void qc.invalidateQueries({ queryKey: ['pos', 'floor'] });
  };
  useRealtime(RT.TABLE_UPDATED, (p: { layoutChanged?: boolean }) => {
    if (p?.layoutChanged && !Object.keys(pos).length) refresh();
  });

  const areas = areasQ.data ?? [];
  const area = areas.find((a) => a.id === areaId) ?? areas[0];
  const tables = useMemo(() => (tablesQ.data ?? []).filter((t) => t.active && t.diningAreaId === area?.id), [tablesQ.data, area?.id]);
  const dirty = Object.keys(pos).length > 0;

  useEffect(() => setPos({}), [area?.id]);

  if (areasQ.isLoading || tablesQ.isLoading) return <PageLoader />;
  if (areasQ.error) return <ErrorState error={areasQ.error} onRetry={() => areasQ.refetch()} />;

  const saveLayout = async () => {
    setSaving(true);
    try {
      await api.put('/pos/tables/layout', Object.entries(pos).map(([id, p]) => ({ id, posX: p.x, posY: p.y })));
      toast.success('Plano guardado');
      setPos({});
      refresh();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSaving(false);
    }
  };

  const moveArea = async (i: number, d: -1 | 1) => {
    const ids = areas.map((a) => a.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await api.put('/pos/dining-areas/reorder', { ids });
      refresh();
    } catch (e) {
      toast.fromError(e);
    }
  };
  const deleteArea = async (a: DiningArea) => {
    if (!(await confirm({ title: `¿Eliminar el salón “${a.name}”?`, description: 'También se eliminan sus mesas.', danger: true, confirmText: 'Eliminar' }))) return;
    try {
      await api.del(`/pos/dining-areas/${a.id}`);
      toast.success('Salón eliminado');
      refresh();
    } catch (e) {
      toast.fromError(e);
    }
  };

  return (
    <div>
      <PageHeader
        title="Mesas y salones"
        subtitle="Acomoda las mesas como están en tu restaurante. Arrastra para moverlas."
        actions={<Button icon={<Plus className="h-4 w-4" />} variant="outline" onClick={() => setAreaModal('new')}>Nuevo salón</Button>}
      />
      {areas.length === 0 ? (
        <EmptyState icon={<LayoutGrid className="h-7 w-7" />} title="Aún no tienes salones" description="Crea un salón (p. ej. “Salón”, “Terraza”) y agrega sus mesas." action={<Button onClick={() => setAreaModal('new')}>Crear salón</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <aside className="card h-fit p-2">
            <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-mute">Salones</p>
            <ul className="space-y-1">
              {areas.map((a, i) => (
                <li key={a.id} className={clsx('flex items-center gap-1 rounded-xl pl-3', a.id === area?.id ? 'bg-brand/10 text-brand' : 'hover:bg-surface-sunken')}>
                  <button className="min-w-0 flex-1 truncate py-2.5 text-left font-medium" onClick={() => setAreaId(a.id)}>
                    {a.name}
                    <span className="ml-1.5 text-xs text-ink-mute">{(tablesQ.data ?? []).filter((t) => t.active && t.diningAreaId === a.id).length}</span>
                  </button>
                  <IconButton size="sm" label="Subir" icon={<ArrowUp className="h-4 w-4" />} disabled={i === 0} onClick={() => moveArea(i, -1)} />
                  <IconButton size="sm" label="Bajar" icon={<ArrowDown className="h-4 w-4" />} disabled={i === areas.length - 1} onClick={() => moveArea(i, 1)} />
                  <IconButton size="sm" label="Editar salón" icon={<Pencil className="h-4 w-4" />} onClick={() => setAreaModal(a)} />
                  <IconButton size="sm" label="Eliminar salón" icon={<Trash2 className="h-4 w-4 text-danger" />} onClick={() => deleteArea(a)} />
                </li>
              ))}
            </ul>
          </aside>
          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="h-display text-xl font-bold">{area?.name}</h2>
              <span className="text-sm text-ink-mute">{tables.length} mesas</span>
              <div className="ml-auto flex gap-2">
                {dirty && <Button variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={() => setPos({})}>Descartar</Button>}
                <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setTableModal('new')}>Agregar mesa</Button>
                <Button icon={<Save className="h-4 w-4" />} disabled={!dirty} loading={saving} onClick={saveLayout}>Guardar plano</Button>
              </div>
            </div>
            {tables.length === 0 ? (
              <div className="card"><EmptyState title="Sin mesas en este salón" action={<Button onClick={() => setTableModal('new')}>Agregar mesa</Button>} /></div>
            ) : (
              <LayoutEditor tables={tables} pos={pos} setPos={setPos} onEdit={(t) => setTableModal(t)} />
            )}
            <p className="mt-2 text-xs text-ink-mute">Consejo: toca una mesa sin moverla para editar nombre, lugares o forma. La cuadrícula ajusta cada 10 px.</p>
          </section>
        </div>
      )}
      <AreaModal value={areaModal} onClose={() => setAreaModal(null)} onSaved={(a) => { setAreaId(a.id); refresh(); }} />
      {area && <TableModal value={tableModal} areas={areas} areaId={area.id} existing={tables} onClose={() => setTableModal(null)} onSaved={refresh} />}
    </div>
  );
}

function LayoutEditor({ tables, pos, setPos, onEdit }: {
  tables: DiningTable[]; pos: Record<string, { x: number; y: number }>;
  setPos: (f: (p: Record<string, { x: number; y: number }>) => Record<string, { x: number; y: number }>) => void; onEdit: (t: DiningTable) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean; scale: number } | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const at = (t: DiningTable) => pos[t.id] ?? { x: t.posX, y: t.posY };
  const b = floorBounds(tables.map((t) => ({ ...t, posX: at(t).x, posY: at(t).y })), 140);
  const scale = width ? Math.min(1, width / b.w) : 1;

  const down = (e: React.PointerEvent, t: DiningTable) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = at(t);
    drag.current = { id: t.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false, scale };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.scale;
    const dy = (e.clientY - d.sy) / d.scale;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setPos((p) => ({ ...p, [d.id]: { x: Math.min(10_000, snap(d.ox + dx)), y: Math.min(10_000, snap(d.oy + dy)) } }));
  };
  const up = (t: DiningTable) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) onEdit(t);
  };

  return (
    <div ref={wrap} className="card overflow-hidden p-0">
      <div
        className="relative touch-none select-none"
        style={{
          height: b.h * scale,
          backgroundImage: 'radial-gradient(rgb(var(--line)) 1px, transparent 1px)',
          backgroundSize: `${GRID * 2 * scale}px ${GRID * 2 * scale}px`,
        }}
      >
        {tables.map((t) => {
          const p = at(t);
          const s = tableSize(t.shape as TableShape);
          const moved = !!pos[t.id];
          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              aria-label={`Mesa ${t.name}`}
              onPointerDown={(e) => down(e, t)}
              onPointerMove={move}
              onPointerUp={() => up(t)}
              onKeyDown={(e) => e.key === 'Enter' && onEdit(t)}
              className={clsx(
                'absolute flex cursor-grab flex-col items-center justify-center border-2 bg-surface-raised shadow-card active:cursor-grabbing',
                t.shape === 'round' ? 'rounded-full' : 'rounded-2xl',
                moved ? 'border-brand' : 'border-line',
              )}
              style={{ left: p.x * scale, top: p.y * scale, width: s.w * scale, height: s.h * scale }}
            >
              <span className="h-display text-2xl font-bold leading-none">{t.name}</span>
              <span className="text-xs text-ink-mute">{t.capacity} lug.</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AreaModal({ value, onClose, onSaved }: { value: DiningArea | 'new' | null; onClose: () => void; onSaved: (a: DiningArea) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(value && value !== 'new' ? value.name : ''), [value]);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const a = value === 'new' ? await api.post<DiningArea>('/pos/dining-areas', { name: name.trim() }) : await api.patch<DiningArea>(`/pos/dining-areas/${value!.id}`, { name: name.trim() });
      toast.success('Salón guardado');
      onSaved(a);
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!value} onClose={onClose} size="sm" title={value === 'new' ? 'Nuevo salón' : 'Editar salón'} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!name.trim()} onClick={save}>Guardar</Button></>}>
      <Input label="Nombre" autoFocus placeholder="Ej. Terraza" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
    </Modal>
  );
}

function TableModal({ value, areas, areaId, existing, onClose, onSaved }: {
  value: DiningTable | 'new' | null; areas: DiningArea[]; areaId: string; existing: DiningTable[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({ name: '', capacity: 4, shape: 'square' as TableShape, diningAreaId: areaId });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) return;
    if (value === 'new') {
      const nums = existing.map((t) => parseInt(t.name.replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
      setF({ name: String((nums.length ? Math.max(...nums) : 0) + 1), capacity: 4, shape: 'square', diningAreaId: areaId });
    } else setF({ name: value.name, capacity: value.capacity, shape: value.shape as TableShape, diningAreaId: value.diningAreaId });
  }, [value, areaId, existing]);

  const save = async () => {
    setBusy(true);
    try {
      if (value === 'new') {
        const maxY = existing.reduce((m, t) => Math.max(m, t.posY + tableSize(t.shape as TableShape).h), 0);
        await api.post('/pos/tables', { ...f, name: f.name.trim(), posX: 20, posY: existing.length ? snap(maxY + 30) : 20 });
      } else await api.patch(`/pos/tables/${value!.id}`, { ...f, name: f.name.trim() });
      toast.success('Mesa guardada');
      onSaved();
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (value === 'new' || !value) return;
    if (!(await confirm({ title: `¿Eliminar la mesa ${value.name}?`, danger: true, confirmText: 'Eliminar' }))) return;
    try {
      const r = await api.del<{ deactivated: boolean }>(`/pos/tables/${value.id}`);
      toast.success(r?.deactivated ? 'Mesa desactivada (tiene historial)' : 'Mesa eliminada');
      onSaved();
      onClose();
    } catch (e) {
      toast.fromError(e);
    }
  };
  return (
    <Modal
      open={!!value}
      onClose={onClose}
      size="sm"
      title={value === 'new' ? 'Nueva mesa' : `Mesa ${value ? (value as DiningTable).name : ''}`}
      footer={
        <>
          {value !== 'new' && <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Eliminar</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} disabled={!f.name.trim()} onClick={save}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nombre o número" maxLength={20} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input label="Lugares" type="number" min={1} max={50} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />
        </div>
        <div>
          <span className="label">Forma</span>
          <div className="grid grid-cols-3 gap-2">
            {SHAPES.map((s) => (
              <button key={s.value} onClick={() => setF({ ...f, shape: s.value })} className={clsx('flex h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 text-xs font-semibold', f.shape === s.value ? 'border-brand bg-brand/10 text-brand' : 'border-line')}>
                <s.icon className="h-5 w-5" /> {s.label}
              </button>
            ))}
          </div>
        </div>
        {value !== 'new' && <Select label="Salón" value={f.diningAreaId} onChange={(e) => setF({ ...f, diningAreaId: e.target.value })} options={areas.map((a) => ({ value: a.id, label: a.name }))} />}
      </div>
    </Modal>
  );
}
