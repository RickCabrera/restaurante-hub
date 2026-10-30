import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Check, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { Button, Input, Modal, Select, Textarea, Toggle, confirm, toast } from '@/ui';
import { groupRuleText, MoneyInput, useAreas, useBranches, type ProductRow } from '@/features/delivery-common';
import { CHANNEL_FLAGS, mk, useCategories, useGroups } from './api';
import { ImageUpload } from './ImageUpload';

type Draft = Omit<ProductRow, 'id' | 'sortOrder' | 'branchOverrides'>;

const empty = (categoryId: string): Draft => ({
  categoryId, productionAreaId: null, name: '', description: '', imageUrl: null, priceCents: 0, available: true,
  showInWeb: true, showInWhatsapp: true, showInQr: true, showInPos: true, active: true, modifierGroupIds: [],
});

export function ProductEditor({ product, defaultCategoryId, open, onClose }: { product: ProductRow | null; defaultCategoryId?: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const cats = useCategories();
  const groups = useGroups();
  const areas = useAreas();
  const branches = useBranches();
  const [d, setD] = useState<Draft>(empty(''));
  const [overrides, setOverrides] = useState<Record<string, { priceCents: number | null; available: boolean | null }>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErr({});
    if (product) {
      const { id: _i, sortOrder: _s, branchOverrides, ...rest } = product;
      setD({ ...rest, description: rest.description ?? '' });
      setOverrides(Object.fromEntries(branchOverrides.map((o) => [o.branchId, { priceCents: o.priceCents, available: o.available }])));
    } else {
      setD(empty(defaultCategoryId ?? cats.data?.[0]?.id ?? ''));
      setOverrides({});
    }
  }, [open, product, defaultCategoryId, cats.data]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const activeBranches = (branches.data ?? []).filter((b) => b.active);
  const prodAreas = (areas.data ?? []).filter((a) => a.isProduction && a.active);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = 'Escribe el nombre';
    if (!d.categoryId) e.categoryId = 'Elige una categoría';
    if (d.priceCents == null || d.priceCents < 0) e.priceCents = 'Precio inválido';
    setErr(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const body = { ...d, name: d.name.trim(), description: d.description?.trim() || null };
      const saved = product ? await api.patch<ProductRow>(`/menu/products/${product.id}`, body) : await api.post<ProductRow>('/menu/products', body);
      if (activeBranches.length > 1) {
        for (const b of activeBranches) {
          const o = overrides[b.id];
          const prev = product?.branchOverrides.find((x) => x.branchId === b.id);
          if (o && (o.priceCents !== (prev?.priceCents ?? null) || o.available !== (prev?.available ?? null)))
            await api.put(`/menu/products/${saved.id}/branches/${b.id}`, o);
        }
      }
      await qc.invalidateQueries({ queryKey: ['menu-admin'] });
      void qc.invalidateQueries({ queryKey: ['menu'] });
      toast.success(product ? 'Producto guardado' : 'Producto creado');
      onClose();
    } catch (e2) {
      toast.fromError(e2);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!product) return;
    const ok = await confirm({ title: `¿Eliminar ${product.name}?`, description: 'Si tiene pedidos anteriores sólo se desactivará.', danger: true, confirmText: 'Eliminar' });
    if (!ok) return;
    try {
      await api.del(`/menu/products/${product.id}`);
      await qc.invalidateQueries({ queryKey: ['menu-admin'] });
      toast.success('Producto eliminado');
      onClose();
    } catch (e) {
      toast.fromError(e);
    }
  };

  const toggleGroup = (id: string) => set('modifierGroupIds', d.modifierGroupIds.includes(id) ? d.modifierGroupIds.filter((x) => x !== id) : [...d.modifierGroupIds, id]);
  const moveGroup = (i: number, dir: -1 | 1) => {
    const a = d.modifierGroupIds.slice();
    const j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    set('modifierGroupIds', a);
  };
  const groupById = (id: string) => groups.data?.find((g) => g.id === id);

  return (
    <Modal open={open} onClose={onClose} title={product ? 'Editar producto' : 'Nuevo producto'} size="lg"
      footer={
        <>
          {product && <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Eliminar</Button>}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={save}>Guardar</Button>
        </>
      }>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <ImageUpload value={d.imageUrl} onChange={(u) => set('imageUrl', u)} folder="products" />
          <div className="space-y-3">
            <Input label="Nombre" value={d.name} onChange={(e) => set('name', e.target.value)} error={err.name} maxLength={100} placeholder="Hamburguesa clásica" />
            <div className="grid grid-cols-2 gap-3">
              <MoneyInput label="Precio" valueCents={d.priceCents} onChangeCents={(c) => set('priceCents', c ?? 0)} />
              <Select label="Categoría" value={d.categoryId} onChange={(e) => set('categoryId', e.target.value)} error={err.categoryId} placeholder={cats.data?.length ? undefined : 'Sin categorías'} options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            </div>
          </div>
        </div>
        <Textarea label="Descripción" value={d.description ?? ''} onChange={(e) => set('description', e.target.value)} maxLength={500} rows={2} placeholder="Ingredientes, tamaño…" />

        <Select label="Área de producción" hint="A qué impresora o pantalla de cocina va la comanda de este producto." value={d.productionAreaId ?? ''} onChange={(e) => set('productionAreaId', e.target.value || null)} placeholder="Sin área (no se imprime comanda)" options={prodAreas.map((a) => ({ value: a.id, label: a.name }))} />

        <div>
          <span className="label">Dónde se muestra</span>
          <div className="flex flex-wrap gap-2">
            {CHANNEL_FLAGS.map((c) => {
              const on = d[c.key];
              return (
                <button key={c.key} type="button" onClick={() => set(c.key, !on)} aria-pressed={on}
                  className={clsx('chip h-9 border px-3 text-sm', on ? 'border-brand bg-brand/15 text-brand' : 'border-line text-ink-mute line-through')}>
                  {on && <Check className="h-3.5 w-3.5" />}{c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="label">Opciones (grupos de modificadores)</span>
          <p className="mb-2 text-xs text-ink-mute">Marca los grupos que aplican; el orden es el que verá el cliente.</p>
          {d.modifierGroupIds.length > 0 && (
            <ol className="mb-2 space-y-1">
              {d.modifierGroupIds.map((id, i) => {
                const g = groupById(id);
                return (
                  <li key={id} className="flex items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-sm">
                    <span className="font-bold text-brand">{i + 1}</span>
                    <span className="flex-1"><b>{g?.name ?? '…'}</b> <span className="text-ink-mute">· {g ? groupRuleText(g) : ''}</span></span>
                    <button type="button" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-surface-sunken disabled:opacity-30" disabled={i === 0} onClick={() => moveGroup(i, -1)} aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-surface-sunken disabled:opacity-30" disabled={i === d.modifierGroupIds.length - 1} onClick={() => moveGroup(i, 1)} aria-label="Bajar"><ArrowDown className="h-4 w-4" /></button>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="flex flex-wrap gap-2">
            {(groups.data ?? []).map((g) => {
              const on = d.modifierGroupIds.includes(g.id);
              return (
                <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} aria-pressed={on}
                  className={clsx('chip h-9 border px-3 text-sm', on ? 'border-brand bg-brand text-white' : 'border-line bg-surface-raised text-ink-soft')}>
                  {on && <Check className="h-3.5 w-3.5" />}{g.name}
                </button>
              );
            })}
            {!groups.data?.length && <p className="text-sm text-ink-mute">Crea grupos en la pestaña Modificadores.</p>}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl bg-surface-sunken p-4">
          <Toggle label="Disponible" description="Apágalo cuando se agote; se oculta al instante en WhatsApp y web." checked={d.available} onChange={(v) => set('available', v)} />
          <Toggle label="Activo" description="Un producto inactivo no aparece en ningún menú." checked={d.active} onChange={(v) => set('active', v)} />
        </div>

        {activeBranches.length > 1 && (
          <div>
            <span className="label">Precio y disponibilidad por sucursal</span>
            <div className="divide-y divide-line rounded-2xl border border-line">
              {activeBranches.map((b) => {
                const o = overrides[b.id] ?? { priceCents: null, available: null };
                return (
                  <div key={b.id} className="grid items-end gap-3 p-3 sm:grid-cols-[1fr_140px_auto]">
                    <p className="pb-2.5 text-sm font-medium">{b.name}</p>
                    <MoneyInput label="Precio" valueCents={o.priceCents} placeholder={(d.priceCents / 100).toString()} onChangeCents={(c) => setOverrides((x) => ({ ...x, [b.id]: { ...o, priceCents: c } }))} hint={o.priceCents == null ? `Usa ${money(d.priceCents)}` : undefined} />
                    <div className="pb-1.5"><Toggle label="Disponible" checked={o.available ?? true} onChange={(v) => setOverrides((x) => ({ ...x, [b.id]: { ...o, available: v } }))} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
