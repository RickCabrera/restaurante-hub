import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FolderOpen, ImageOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { assetUrl } from '@/lib/config';
import { Button, EmptyState, ErrorState, Input, Modal, Skeleton, Textarea, Toggle, confirm, toast } from '@/ui';
import type { CategoryRow } from '@/features/delivery-common';
import { mk, useCategories, useProducts } from './api';
import { ImageUpload } from './ImageUpload';
import { SortableList } from './sortable';

export function CategoriesTab() {
  const qc = useQueryClient();
  const cats = useCategories();
  const products = useProducts();
  const [editing, setEditing] = useState<CategoryRow | 'new' | null>(null);
  const list = (cats.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const reorder = async (next: CategoryRow[]) => {
    const prev = cats.data;
    qc.setQueryData<CategoryRow[]>(mk.categories, next.map((c, i) => ({ ...c, sortOrder: i + 1 })));
    try {
      await api.put('/menu/categories/reorder', { ids: next.map((c) => c.id) });
    } catch (e) {
      qc.setQueryData(mk.categories, prev);
      toast.fromError(e);
    }
  };

  if (cats.isError) return <ErrorState error={cats.error} onRetry={() => cats.refetch()} />;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-ink-mute">Arrastra para cambiar el orden en el menú.</p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Categoría</Button>
      </div>
      {cats.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !list.length ? (
        <EmptyState icon={<FolderOpen className="h-7 w-7" />} title="Sin categorías" description="Agrupa tus productos: Hamburguesas, Bebidas, Postres…" action={<Button onClick={() => setEditing('new')}>Crear categoría</Button>} />
      ) : (
        <SortableList
          className="card divide-y divide-line"
          items={list}
          onReorder={reorder}
          render={(c, handle) => {
            const count = (products.data ?? []).filter((p) => p.categoryId === c.id).length;
            return (
              <div className="flex items-center gap-3 bg-surface-raised px-3 py-2.5 first:rounded-t-2xl last:rounded-b-2xl">
                {handle}
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-sunken text-ink-mute">
                  {c.imageUrl ? <img src={assetUrl(c.imageUrl)} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5" />}
                </span>
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(c)}>
                  <span className="block font-semibold">{c.name}</span>
                  <span className="block text-sm text-ink-mute">{count} producto{count === 1 ? '' : 's'}{!c.active && ' · oculta'}</span>
                </button>
                <Button variant="ghost" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(c)} aria-label={`Editar ${c.name}`} />
              </div>
            );
          }}
        />
      )}
      <CategoryEditor open={!!editing} cat={editing === 'new' ? null : editing} productCount={editing && editing !== 'new' ? (products.data ?? []).filter((p) => p.categoryId === editing.id).length : 0} onClose={() => setEditing(null)} />
    </>
  );
}

function CategoryEditor({ open, cat, onClose, productCount }: { open: boolean; cat: CategoryRow | null; onClose: () => void; productCount: number }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(cat?.name ?? '');
    setDescription(cat?.description ?? '');
    setImageUrl(cat?.imageUrl ?? null);
    setActive(cat?.active ?? true);
  }, [open, cat]);
  const save = async () => {
    if (!name.trim()) return toast.error('Escribe el nombre');
    setSaving(true);
    try {
      const body = { name: name.trim(), description: description.trim() || null, imageUrl, active };
      if (cat) await api.patch(`/menu/categories/${cat.id}`, body);
      else await api.post('/menu/categories', body);
      await qc.invalidateQueries({ queryKey: ['menu-admin'] });
      toast.success('Categoría guardada');
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!cat) return;
    if (productCount) return toast.error('La categoría tiene productos', 'Muévelos a otra categoría o desactívala');
    if (!(await confirm({ title: `¿Eliminar ${cat.name}?`, danger: true, confirmText: 'Eliminar' }))) return;
    try {
      await api.del(`/menu/categories/${cat.id}`);
      await qc.invalidateQueries({ queryKey: ['menu-admin'] });
      onClose();
    } catch (e) {
      toast.fromError(e);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={cat ? 'Editar categoría' : 'Nueva categoría'}
      footer={<>{cat && <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Eliminar</Button>}<Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Guardar</Button></>}>
      <div className="space-y-4">
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus placeholder="Hamburguesas" />
        <Textarea label="Descripción (opcional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        <ImageUpload value={imageUrl} onChange={setImageUrl} folder="categories" label="Imagen (opcional)" />
        <Toggle label="Visible en el menú" checked={active} onChange={setActive} />
      </div>
    </Modal>
  );
}
