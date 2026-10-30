import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { IconPicker, SupplyIcon } from '@/icons/supplies';
import { Badge, Button, confirm, EmptyState, ErrorState, Input, Modal, Skeleton, Textarea, Toggle, toast } from '@/ui';
import { QUICK_ICON_KEYS, QuickIcon, QUICK_TILE_COLORS, WEEKDAYS_SHORT, WEEKDAYS } from '@/features/common-req/meta';
import { SortableList } from '@/features/common-req/Sortable';
import type { Category, QuickMessage, Supplier } from '@/features/common-req/types';

// ======================================================================= Categorías
export function CategoriesTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['supply-categories'], queryFn: () => api.get<Category[]>('/supply-categories') });
  const [edit, setEdit] = useState<Category | 'new' | null>(null);
  const [order, setOrder] = useState<Category[] | null>(null);
  const list = order ?? q.data ?? [];

  const reorder = async (next: Category[]) => {
    setOrder(next);
    try {
      await api.post('/supply-categories/reorder', { ids: next.map((c) => c.id) });
      await qc.invalidateQueries({ queryKey: ['supply-categories'] });
    } catch (e) {
      toast.fromError(e);
    } finally {
      setOrder(null);
    }
  };
  const remove = async (c: Category) => {
    if (!(await confirm({ title: `¿Borrar “${c.name}”?`, danger: true, confirmText: 'Borrar' }))) return;
    try {
      await api.del(`/supply-categories/${c.id}`);
      void qc.invalidateQueries({ queryKey: ['supply-categories'] });
      toast.success('Categoría borrada');
    } catch (e) {
      toast.fromError(e);
    }
  };

  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex justify-between gap-2">
        <p className="text-sm text-ink-mute">Arrastra para cambiar el orden de las pestañas en las tablets.</p>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Categoría</Button>
      </div>
      {list.length === 0 ? (
        <EmptyState title="Sin categorías" />
      ) : (
        <SortableList
          items={list}
          onReorder={reorder}
          className="card divide-y divide-line"
          render={(c, handle) => (
            <div className="flex items-center gap-3 bg-surface-raised px-3 py-2.5">
              {handle}
              <SupplyIcon icon={c.icon} label={c.name} size={40} />
              <span className="flex-1 font-semibold">{c.name}</span>
              <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken" onClick={() => setEdit(c)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
              <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken hover:text-danger" onClick={() => remove(c)} aria-label="Borrar"><Trash2 className="h-4 w-4" /></button>
            </div>
          )}
        />
      )}
      <CategoryModal value={edit} onClose={() => setEdit(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['supply-categories'] })} />
    </div>
  );
}

function CategoryModal({ value, onClose, onSaved }: { value: Category | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('box');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value && value !== 'new') {
      setName(value.name);
      setIcon(value.icon);
    } else {
      setName('');
      setIcon('box');
    }
  }, [value]);
  const save = async () => {
    setBusy(true);
    try {
      if (value === 'new') await api.post('/supply-categories', { name: name.trim(), icon });
      else if (value) await api.patch(`/supply-categories/${value.id}`, { name: name.trim(), icon });
      onSaved();
      onClose();
      toast.success('Categoría guardada');
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!value} onClose={onClose} size="xl" title={value === 'new' ? 'Nueva categoría' : 'Editar categoría'} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!name.trim()} onClick={save}>Guardar</Button></>}>
      <div className="mb-4 flex items-end gap-3">
        <SupplyIcon icon={icon} label={name} size={56} />
        <Input className="flex-1" label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Verdura y fruta" autoFocus />
      </div>
      <IconPicker value={icon} onChange={setIcon} />
    </Modal>
  );
}

// ======================================================================= Proveedores
export function SuppliersTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get<Supplier[]>('/suppliers') });
  const [edit, setEdit] = useState<Supplier | 'new' | null>(null);
  const remove = async (s: Supplier) => {
    if (!(await confirm({ title: `¿Borrar “${s.name}”?`, description: 'Sus insumos quedarán sin proveedor.', danger: true, confirmText: 'Borrar' }))) return;
    try {
      await api.del(`/suppliers/${s.id}`);
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Proveedor borrado');
    } catch (e) {
      toast.fromError(e);
    }
  };
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Proveedor</Button>
      </div>
      {!q.data?.length ? (
        <EmptyState title="Sin proveedores" description="Agrega a tus proveedores para armar la lista de compras por WhatsApp." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.map((s) => (
            <div key={s.id} className={clsx('card p-4', !s.active && 'opacity-60')}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="h-display truncate text-lg font-bold">{s.name}</p>
                  <p className="text-sm text-ink-mute">{s.contactName ?? 'Sin contacto'}</p>
                </div>
                <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken" onClick={() => setEdit(s)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken hover:text-danger" onClick={() => remove(s)} aria-label="Borrar"><Trash2 className="h-4 w-4" /></button>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm">
                <Phone className="h-3.5 w-3.5 text-ink-mute" /> {s.phone ?? <span className="text-ink-mute">Sin teléfono</span>}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex gap-1">
                  {WEEKDAYS_SHORT.map((d, i) => (
                    <span key={i} title={WEEKDAYS[i]} className={clsx('grid h-7 w-7 place-items-center rounded-full text-xs font-bold', s.deliveryDays.includes(i) ? 'bg-brand text-white' : 'bg-surface-sunken text-ink-mute')}>{d}</span>
                  ))}
                </div>
                <Badge>{s.supplyCount ?? 0} insumos</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
      <SupplierModal value={edit} onClose={() => setEdit(null)} onSaved={() => qc.invalidateQueries({ queryKey: ['suppliers'] })} />
    </div>
  );
}

function SupplierModal({ value, onClose, onSaved }: { value: Supplier | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', contactName: '', phone: '', deliveryDays: [] as number[], notes: '', active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setErrors({});
    if (value && value !== 'new') setF({ name: value.name, contactName: value.contactName ?? '', phone: value.phone ?? '', deliveryDays: value.deliveryDays, notes: value.notes ?? '', active: value.active });
    else setF({ name: '', contactName: '', phone: '', deliveryDays: [], notes: '', active: true });
  }, [value]);
  const save = async () => {
    setBusy(true);
    const body = { name: f.name.trim(), contactName: f.contactName.trim() || null, phone: f.phone.replace(/[\s-]/g, '') || null, deliveryDays: f.deliveryDays, notes: f.notes.trim() || null, active: f.active };
    try {
      if (value === 'new') await api.post('/suppliers', body);
      else if (value) await api.patch(`/suppliers/${value.id}`, body);
      onSaved();
      onClose();
      toast.success('Proveedor guardado');
    } catch (e) {
      setErrors((e as { fieldErrors?: Record<string, string> }).fieldErrors ?? {});
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!value} onClose={onClose} title={value === 'new' ? 'Nuevo proveedor' : 'Editar proveedor'} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!f.name.trim()} onClick={save}>Guardar</Button></>}>
      <div className="space-y-4">
        <Input label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errors.name} autoFocus placeholder="Ej. Verdulería Don José" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Contacto" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} placeholder="Don José" />
          <Input label="WhatsApp" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={errors.phone} placeholder="5512345678" hint="10 dígitos" />
        </div>
        <div>
          <span className="label">Días de entrega</span>
          <div className="flex gap-2">
            {WEEKDAYS_SHORT.map((d, i) => {
              const on = f.deliveryDays.includes(i);
              return (
                <button key={i} type="button" title={WEEKDAYS[i]} aria-pressed={on} onClick={() => setF({ ...f, deliveryDays: on ? f.deliveryDays.filter((x) => x !== i) : [...f.deliveryDays, i].sort() })} className={clsx('grid h-11 w-11 place-items-center rounded-full font-bold transition', on ? 'bg-brand text-white' : 'bg-surface-sunken text-ink-mute')}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <Textarea label="Notas" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Activo" />
      </div>
    </Modal>
  );
}

// ======================================================================= Mensajes rápidos
export function QuickMessagesTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['quick-messages', true], queryFn: () => api.get<QuickMessage[]>('/chat/quick-messages', { all: 1 }) });
  const [edit, setEdit] = useState<QuickMessage | 'new' | null>(null);
  const [order, setOrder] = useState<QuickMessage[] | null>(null);
  const list = order ?? q.data ?? [];
  const refresh = () => void qc.invalidateQueries({ queryKey: ['quick-messages'] });
  const reorder = async (next: QuickMessage[]) => {
    setOrder(next);
    try {
      await api.post('/chat/quick-messages/reorder', { ids: next.map((m) => m.id) });
      refresh();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setOrder(null);
    }
  };
  const remove = async (m: QuickMessage) => {
    if (!(await confirm({ title: `¿Borrar “${m.text}”?`, danger: true, confirmText: 'Borrar' }))) return;
    try {
      await api.del(`/chat/quick-messages/${m.id}`);
      refresh();
    } catch (e) {
      toast.fromError(e);
    }
  };
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex justify-between gap-2">
        <p className="text-sm text-ink-mute">Botones de un toque en el chat de las tablets.</p>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Mensaje</Button>
      </div>
      <SortableList
        items={list}
        onReorder={reorder}
        className="card divide-y divide-line"
        render={(m, handle) => {
          const i = list.findIndex((x) => x.id === m.id);
          return (
            <div className={clsx('flex items-center gap-3 bg-surface-raised px-3 py-2.5', !m.active && 'opacity-50')}>
              {handle}
              <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: m.urgent ? 'rgb(var(--danger))' : QUICK_TILE_COLORS[i % QUICK_TILE_COLORS.length] }}>
                <QuickIcon icon={m.icon} className="h-5 w-5" />
              </span>
              <span className="flex-1 font-semibold">{m.text}</span>
              {m.urgent && <Badge tone="danger">Urgente</Badge>}
              {!m.active && <Badge>Oculto</Badge>}
              <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken" onClick={() => setEdit(m)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
              <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken hover:text-danger" onClick={() => remove(m)} aria-label="Borrar"><Trash2 className="h-4 w-4" /></button>
            </div>
          );
        }}
      />
      <QuickModal value={edit} onClose={() => setEdit(null)} onSaved={refresh} />
    </div>
  );
}

function QuickModal({ value, onClose, onSaved }: { value: QuickMessage | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ text: '', icon: 'alert-triangle', urgent: false, active: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value && value !== 'new') setF({ text: value.text, icon: value.icon, urgent: value.urgent, active: value.active });
    else setF({ text: '', icon: 'alert-triangle', urgent: false, active: true });
  }, [value]);
  const save = async () => {
    setBusy(true);
    try {
      if (value === 'new') await api.post('/chat/quick-messages', { ...f, text: f.text.trim() });
      else if (value) await api.patch(`/chat/quick-messages/${value.id}`, { ...f, text: f.text.trim() });
      onSaved();
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!value} onClose={onClose} title={value === 'new' ? 'Nuevo mensaje rápido' : 'Editar mensaje rápido'} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!f.text.trim()} onClick={save}>Guardar</Button></>}>
      <div className="space-y-4">
        <Input label="Texto" value={f.text} maxLength={120} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="Ej. Se acabó el gas" autoFocus />
        <div>
          <span className="label">Ícono</span>
          <div className="flex flex-wrap gap-2">
            {QUICK_ICON_KEYS.map((k) => (
              <button key={k} type="button" onClick={() => setF({ ...f, icon: k })} className={clsx('grid h-11 w-11 place-items-center rounded-xl border-2 transition', f.icon === k ? 'border-brand bg-brand-50 text-brand' : 'border-line text-ink-soft')} aria-label={k}>
                <QuickIcon icon={k} className="h-5 w-5" />
              </button>
            ))}
          </div>
        </div>
        <Toggle checked={f.urgent} onChange={(v) => setF({ ...f, urgent: v })} label="Urgente" description="Se muestra en rojo y te notifica con alarma." />
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Visible en tablets" />
      </div>
    </Modal>
  );
}
