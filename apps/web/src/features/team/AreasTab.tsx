import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { AREA_ICONS } from '@rh/shared';
import { api } from '@/lib/api';
import { Badge, Button, confirm, EmptyState, ErrorState, Input, Modal, Skeleton, Toggle, toast } from '@/ui';
import { useAreas } from '@/features/common-req/hooks';
import { AREA_ICON_LABEL, AREA_SWATCHES, AreaBadge, AreaIcon, WEEKDAYS } from '@/features/common-req/meta';
import { SortableList } from '@/features/common-req/Sortable';
import type { Area } from '@/features/common-req/types';

export function AreasTab() {
  const qc = useQueryClient();
  const q = useAreas(true);
  const [edit, setEdit] = useState<Area | 'new' | null>(null);
  const [order, setOrder] = useState<Area[] | null>(null);
  const list = order ?? q.data ?? [];
  const refresh = () => void qc.invalidateQueries({ queryKey: ['areas'] });

  const reorder = async (next: Area[]) => {
    setOrder(next);
    try {
      await api.post('/areas/reorder', { ids: next.map((a) => a.id) });
      refresh();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setOrder(null);
    }
  };
  const remove = async (a: Area) => {
    if (!(await confirm({ title: `¿Borrar “${a.name}”?`, description: 'Si ya tiene requisiciones, solo se desactiva.', danger: true, confirmText: 'Borrar' }))) return;
    try {
      await api.del(`/areas/${a.id}`);
      refresh();
      toast.success('Área eliminada');
    } catch (e) {
      toast.fromError(e);
    }
  };

  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex justify-between gap-2">
        <p className="text-sm text-ink-mute">Cada área tiene su tablet, su color y su lista de insumos.</p>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Área</Button>
      </div>
      {list.length === 0 ? (
        <EmptyState title="Sin áreas" />
      ) : (
        <SortableList
          items={list}
          onReorder={reorder}
          className="space-y-2"
          render={(a, handle) => {
            const days = Object.keys(a.orderWindow ?? {});
            return (
              <div className={clsx('card flex items-center gap-3 p-3', !a.active && 'opacity-50')}>
                {handle}
                <AreaBadge area={a} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {a.name}
                    {a.isProduction && <Badge tone="info">Producción</Badge>}
                    {!a.canRequisition && <Badge>No pide</Badge>}
                    {!a.active && <Badge>Inactiva</Badge>}
                  </p>
                  <p className="truncate text-xs text-ink-mute">
                    {a.deviceCount ?? 0} tablets · {days.length ? `Pide hasta las ${a.orderWindow[days[0]].until} (${days.length} días)` : 'Sin horario de pedido'}
                  </p>
                </div>
                <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken" onClick={() => setEdit(a)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken hover:text-danger" onClick={() => remove(a)} aria-label="Borrar"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          }}
        />
      )}
      <AreaModal value={edit} onClose={() => setEdit(null)} onSaved={refresh} />
    </div>
  );
}

function AreaModal({ value, onClose, onSaved }: { value: Area | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', color: AREA_SWATCHES[0], icon: 'chef', isProduction: true, canRequisition: true, active: true, orderWindow: {} as Record<string, { until: string }> });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value && value !== 'new') setF({ name: value.name, color: value.color, icon: value.icon, isProduction: value.isProduction, canRequisition: value.canRequisition, active: value.active, orderWindow: value.orderWindow ?? {} });
    else setF({ name: '', color: AREA_SWATCHES[0], icon: 'chef', isProduction: true, canRequisition: true, active: true, orderWindow: {} });
  }, [value]);
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, name: f.name.trim() };
      if (value === 'new') await api.post('/areas', body);
      else if (value) await api.patch(`/areas/${value.id}`, body);
      onSaved();
      onClose();
      toast.success('Área guardada');
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  const setDay = (d: number, until: string | null) => {
    const ow = { ...f.orderWindow };
    if (until) ow[String(d)] = { until };
    else delete ow[String(d)];
    setF({ ...f, orderWindow: ow });
  };
  return (
    <Modal open={!!value} onClose={onClose} size="lg" title={value === 'new' ? 'Nueva área' : 'Editar área'} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!f.name.trim()} onClick={save}>Guardar</Button></>}>
      <div className="space-y-5">
        <div className="flex items-end gap-3">
          <AreaBadge area={f} size={56} />
          <Input className="flex-1" label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej. Cocina" autoFocus />
        </div>
        <div>
          <span className="label">Color</span>
          <div className="flex flex-wrap gap-2">
            {AREA_SWATCHES.map((c) => (
              <button key={c} type="button" onClick={() => setF({ ...f, color: c })} className="grid h-10 w-10 place-items-center rounded-full ring-offset-2 ring-offset-surface-raised transition" style={{ background: c, boxShadow: f.color === c ? `0 0 0 3px ${c}55` : undefined }} aria-label={c}>
                {f.color === c && <Check className="h-5 w-5 text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Ícono</span>
          <div className="flex flex-wrap gap-2">
            {AREA_ICONS.map((k) => (
              <button key={k} type="button" onClick={() => setF({ ...f, icon: k })} className={clsx('flex h-16 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 text-[11px] font-semibold transition', f.icon === k ? 'text-white' : 'border-line text-ink-soft')} style={f.icon === k ? { background: f.color, borderColor: f.color } : undefined}>
                <AreaIcon icon={k} className="h-6 w-6" />
                {AREA_ICON_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-2xl bg-surface-sunken/60 p-4">
          <Toggle checked={f.canRequisition} onChange={(v) => setF({ ...f, canRequisition: v })} label="Puede hacer requisiciones" />
          <Toggle checked={f.isProduction} onChange={(v) => setF({ ...f, isProduction: v })} label="Área de producción" description="Recibe comandas de pedidos (cocina, barra)." />
          <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Activa" />
        </div>
        <div>
          <span className="label">Horario para pedir (hasta qué hora)</span>
          <p className="mb-2 text-xs text-ink-mute">Las tablets reciben un aviso 30 min antes. Lo que llegue después se marca “tarde”.</p>
          <div className="space-y-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const v = f.orderWindow[String(d)]?.until;
              return (
                <div key={d} className="flex items-center gap-3">
                  <label className="flex w-32 items-center gap-2 text-sm font-medium">
                    <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={!!v} onChange={(e) => setDay(d, e.target.checked ? '18:00' : null)} />
                    {WEEKDAYS[d]}
                  </label>
                  {v ? <input type="time" className="input h-9 w-32" value={v} onChange={(e) => setDay(d, e.target.value)} /> : <span className="text-sm text-ink-mute">Sin límite</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
