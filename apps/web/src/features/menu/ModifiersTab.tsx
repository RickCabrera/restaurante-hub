import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { Button, EmptyState, ErrorState, Input, Modal, Skeleton, confirm, toast } from '@/ui';
import { groupRuleText, MoneyInput, type MenuModifier, type MenuModifierGroup } from '@/features/delivery-common';
import { mk, useGroups, useProducts } from './api';
import { SortableList } from './sortable';
import { SoldOutToggle } from './MenuPage';

/** Explicación en lenguaje claro de min/max. */
export function ruleSentence(min: number, max: number): string {
  if (min > 0 && min === max) return `El cliente debe elegir ${min === 1 ? '1 opción (obligatorio)' : `exactamente ${min} opciones`}.`;
  if (min > 0) return `Obligatorio elegir al menos ${min}; puede elegir hasta ${max}.`;
  if (max === 1) return 'Opcional: puede elegir 1 o ninguna.';
  return `Opcional: hasta ${max} extras.`;
}

export function ModifiersTab() {
  const qc = useQueryClient();
  const groups = useGroups();
  const products = useProducts();
  const [editing, setEditing] = useState<MenuModifierGroup | 'new' | null>(null);
  const list = (groups.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const reorder = async (next: MenuModifierGroup[]) => {
    const prev = groups.data;
    qc.setQueryData(mk.groups, next.map((g, i) => ({ ...g, sortOrder: i + 1 })));
    try {
      await api.put('/menu/modifier-groups/reorder', { ids: next.map((g) => g.id) });
    } catch (e) {
      qc.setQueryData(mk.groups, prev);
      toast.fromError(e);
    }
  };

  if (groups.isError) return <ErrorState error={groups.error} onRetry={() => groups.refetch()} />;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-ink-mute">Grupos como “Término”, “Salsa” o “Extras” que se agregan a los productos.</p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Grupo</Button>
      </div>
      {groups.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : !list.length ? (
        <EmptyState icon={<ListChecks className="h-7 w-7" />} title="Sin grupos de modificadores" action={<Button onClick={() => setEditing('new')}>Crear grupo</Button>} />
      ) : (
        <SortableList
          className="space-y-2"
          items={list}
          onReorder={reorder}
          render={(g, handle) => {
            const used = (products.data ?? []).filter((p) => p.modifierGroupIds.includes(g.id)).length;
            return (
              <div className="card flex items-start gap-2 p-3">
                {handle}
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(g)}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{g.name}</span>
                    <span className={clsx('chip', g.minSelect > 0 ? 'bg-brand/15 text-brand' : 'bg-surface-sunken text-ink-soft')}>{groupRuleText(g)}</span>
                  </span>
                  <span className="mt-1 block text-sm text-ink-mute">
                    {g.modifiers.map((m) => `${m.name}${m.priceCents ? ` +${money(m.priceCents)}` : ''}${m.available ? '' : ' (agotado)'}`).join(' · ') || 'Sin opciones'}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-mute">En {used} producto{used === 1 ? '' : 's'}</span>
                </button>
                <Button variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} aria-label={`Editar ${g.name}`} onClick={() => setEditing(g)} />
              </div>
            );
          }}
        />
      )}
      <GroupEditor open={!!editing} group={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    </>
  );
}

interface DraftMod { id?: string; key: string; name: string; priceCents: number; available: boolean }

function GroupEditor({ open, group, onClose }: { open: boolean; group: MenuModifierGroup | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(1);
  const [mods, setMods] = useState<DraftMod[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? '');
    setMin(group?.minSelect ?? 0);
    setMax(group?.maxSelect ?? 1);
    setMods((group?.modifiers ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map((m) => ({ id: m.id, key: m.id, name: m.name, priceCents: m.priceCents, available: m.available })));
    setRemoved([]);
  }, [open, group]);

  const presets = [
    { label: 'Obligatorio, elige 1', min: 1, max: 1 },
    { label: 'Opcional, 1', min: 0, max: 1 },
    { label: 'Hasta 3 extras', min: 0, max: 3 },
    { label: 'Hasta 5 extras', min: 0, max: 5 },
  ];

  const update = (key: string, patch: Partial<DraftMod>) => setMods((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  const toggleAvailability = async (m: DraftMod) => {
    update(m.key, { available: !m.available });
    if (!group || !m.id) return;
    try {
      await api.patch(`/menu/modifier-groups/${group.id}/modifiers/${m.id}/availability`, { available: !m.available });
      void qc.invalidateQueries({ queryKey: mk.groups });
    } catch (e) {
      update(m.key, { available: m.available });
      toast.fromError(e);
    }
  };

  const save = async () => {
    if (!name.trim()) return toast.error('Escribe el nombre del grupo');
    if (min > max) return toast.error('El mínimo no puede ser mayor que el máximo');
    const clean = mods.filter((m) => m.name.trim());
    if (min > clean.length) return toast.error(`Agrega al menos ${min} opciones`);
    setSaving(true);
    try {
      if (!group) {
        await api.post('/menu/modifier-groups', { name: name.trim(), minSelect: min, maxSelect: max, modifiers: clean.map((m, i) => ({ name: m.name.trim(), priceCents: m.priceCents, available: m.available, sortOrder: i + 1 })) });
      } else {
        await api.patch(`/menu/modifier-groups/${group.id}`, { name: name.trim(), minSelect: min, maxSelect: max });
        for (const id of removed) await api.del(`/menu/modifier-groups/${group.id}/modifiers/${id}`);
        const ids: string[] = [];
        for (const m of clean) {
          const orig = group.modifiers.find((x) => x.id === m.id);
          if (!m.id) {
            const c = await api.post<MenuModifier>(`/menu/modifier-groups/${group.id}/modifiers`, { name: m.name.trim(), priceCents: m.priceCents, available: m.available });
            ids.push(c.id);
          } else {
            if (orig && (orig.name !== m.name.trim() || orig.priceCents !== m.priceCents)) await api.patch(`/menu/modifier-groups/${group.id}/modifiers/${m.id}`, { name: m.name.trim(), priceCents: m.priceCents });
            ids.push(m.id);
          }
        }
        if (ids.length) await api.put(`/menu/modifier-groups/${group.id}/modifiers/reorder`, { ids });
      }
      await qc.invalidateQueries({ queryKey: ['menu-admin'] });
      toast.success('Grupo guardado');
      onClose();
    } catch (e) {
      toast.fromError(e);
      void qc.invalidateQueries({ queryKey: mk.groups });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!group) return;
    if (!(await confirm({ title: `¿Eliminar ${group.name}?`, description: 'Se quitará de todos los productos.', danger: true, confirmText: 'Eliminar' }))) return;
    try {
      await api.del(`/menu/modifier-groups/${group.id}`);
      await qc.invalidateQueries({ queryKey: ['menu-admin'] });
      onClose();
    } catch (e) {
      toast.fromError(e);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={group ? 'Editar grupo' : 'Nuevo grupo de opciones'} size="lg"
      footer={<>{group && <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Eliminar</Button>}<Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Guardar</Button></>}>
      <div className="space-y-5">
        <Input label="Nombre del grupo" value={name} onChange={(e) => setName(e.target.value)} placeholder="Término de la carne, Salsa, Extras…" maxLength={80} />
        <div>
          <span className="label">¿Cuántas opciones puede elegir?</span>
          <div className="mb-3 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p.label} type="button" onClick={() => { setMin(p.min); setMax(p.max); }}
                className={clsx('chip h-9 border px-3 text-sm', min === p.min && max === p.max ? 'border-brand bg-brand text-white' : 'border-line bg-surface-raised text-ink-soft')}>{p.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Mínimo" type="number" min={0} max={20} value={min} onChange={(e) => setMin(Math.max(0, Math.min(20, +e.target.value || 0)))} />
            <Input label="Máximo" type="number" min={1} max={20} value={max} onChange={(e) => setMax(Math.max(1, Math.min(20, +e.target.value || 1)))} />
          </div>
          <p className={clsx('mt-2 rounded-xl px-3 py-2 text-sm', min > max ? 'bg-danger/10 text-danger' : 'bg-info/10 text-info')}>
            {min > max ? 'El mínimo no puede ser mayor que el máximo.' : ruleSentence(min, max)}
          </p>
        </div>
        <div>
          <span className="label">Opciones</span>
          {mods.length > 0 && (
            <SortableList
              className="space-y-2"
              items={mods.map((m) => ({ ...m, id: m.key }))}
              onReorder={(next) => setMods(next.map((n) => mods.find((m) => m.key === n.id)!))}
              render={(row, handle) => {
                const m = mods.find((x) => x.key === row.id)!;
                return (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface-raised p-2 sm:flex-nowrap">
                    {handle}
                    <input className="input h-10 min-w-0 flex-1 basis-[calc(100%-2.5rem)] sm:basis-auto" value={m.name} placeholder="Nombre" onChange={(e) => update(m.key, { name: e.target.value })} aria-label="Nombre de la opción" />
                    <MoneyInput className="ml-9 w-28 shrink-0 sm:ml-0 sm:w-24 [&_.input]:h-10" valueCents={m.priceCents} onChangeCents={(c) => update(m.key, { priceCents: c ?? 0 })} />
                    <SoldOutToggle small available={m.available} name={m.name} onChange={() => toggleAvailability(m)} />
                    <button type="button" className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger/10 sm:ml-0" aria-label="Quitar opción"
                      onClick={() => { if (m.id) setRemoved((r) => [...r, m.id!]); setMods((ms) => ms.filter((x) => x.key !== m.key)); }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              }}
            />
          )}
          <Button variant="outline" className="mt-2" icon={<Plus className="h-4 w-4" />} onClick={() => setMods((ms) => [...ms, { key: crypto.randomUUID(), name: '', priceCents: 0, available: true }])}>Agregar opción</Button>
          <p className="mt-1 text-xs text-ink-mute">Precio extra en pesos ($0 si no cuesta más).</p>
        </div>
      </div>
    </Modal>
  );
}
