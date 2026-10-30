import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { EyeOff, ImageOff, Pencil, Plus, Search, UtensilsCrossed } from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { assetUrl } from '@/lib/config';
import { vibrate } from '@/lib/sound';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton, Tabs, toast } from '@/ui';
import { useOrderRealtime, type ProductRow } from '@/features/delivery-common';
import { CHANNEL_FLAGS, mk, useCategories, useProducts } from './api';
import { ProductEditor } from './ProductEditor';
import { SortableList } from './sortable';
import { CategoriesTab } from './CategoriesTab';
import { ModifiersTab } from './ModifiersTab';

type Tab = 'productos' | 'categorias' | 'modificadores';

export function MenuPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'productos';
  useOrderRealtime();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Menú" subtitle="Lo que ven tus clientes en WhatsApp, menú web, QR y punto de venta" />
      <Tabs
        className="mb-4 w-fit"
        value={tab}
        onChange={(v) => setParams(v === 'productos' ? {} : { tab: v }, { replace: true })}
        items={[{ value: 'productos', label: 'Productos' }, { value: 'categorias', label: 'Categorías' }, { value: 'modificadores', label: 'Modificadores' }]}
      />
      {tab === 'productos' ? <ProductsTab /> : tab === 'categorias' ? <CategoriesTab /> : <ModifiersTab />}
    </div>
  );
}

function ProductsTab() {
  const qc = useQueryClient();
  const products = useProducts();
  const cats = useCategories();
  const [q, setQ] = useState('');
  const [onlySoldOut, setOnlySoldOut] = useState(false);
  const [editing, setEditing] = useState<{ product: ProductRow | null; categoryId?: string } | null>(null);

  const setAvailable = async (p: ProductRow, available: boolean) => {
    vibrate(10);
    qc.setQueryData<ProductRow[]>(mk.products, (old) => old?.map((x) => (x.id === p.id ? { ...x, available } : x)));
    try {
      await api.patch(`/menu/products/${p.id}/availability`, { available });
      toast.success(available ? `${p.name} disponible` : `${p.name} agotado`, available ? undefined : 'Ya no se puede pedir por WhatsApp ni web');
      void qc.invalidateQueries({ queryKey: ['menu'] });
    } catch (e) {
      qc.setQueryData<ProductRow[]>(mk.products, (old) => old?.map((x) => (x.id === p.id ? { ...x, available: !available } : x)));
      toast.fromError(e);
    }
  };

  const reorder = async (categoryId: string, next: ProductRow[]) => {
    const prev = qc.getQueryData<ProductRow[]>(mk.products);
    const order = new Map(next.map((p, i) => [p.id, i + 1]));
    qc.setQueryData<ProductRow[]>(mk.products, (old) => old?.map((x) => (order.has(x.id) ? { ...x, sortOrder: order.get(x.id)! } : x)));
    try {
      await api.put('/menu/products/reorder', { ids: next.map((p) => p.id) });
    } catch (e) {
      qc.setQueryData(mk.products, prev);
      toast.fromError(e);
    }
  };

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = (products.data ?? []).filter((p) => (!t || p.name.toLowerCase().includes(t)) && (!onlySoldOut || !p.available));
    return (cats.data ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({ cat: c, items: all.filter((p) => p.categoryId === c.id).sort((a, b) => a.sortOrder - b.sortOrder) }));
  }, [products.data, cats.data, q, onlySoldOut]);

  const soldOut = (products.data ?? []).filter((p) => !p.available && p.active).length;
  const filtering = !!q.trim() || onlySoldOut;

  if (products.isError || cats.isError) return <ErrorState error={products.error ?? cats.error} onRetry={() => { void products.refetch(); void cats.refetch(); }} />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input className="input pl-9" placeholder="Buscar producto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
        </div>
        <button onClick={() => setOnlySoldOut((v) => !v)} aria-pressed={onlySoldOut}
          className={clsx('chip h-11 border px-4 text-sm', onlySoldOut ? 'border-danger bg-danger/15 text-danger' : 'border-line bg-surface-raised text-ink-soft')}>
          Agotados{soldOut ? ` (${soldOut})` : ''}
        </button>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ product: null })} disabled={!cats.data?.length}>Producto</Button>
      </div>

      {products.isLoading || cats.isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : !cats.data?.length ? (
        <EmptyState icon={<UtensilsCrossed className="h-7 w-7" />} title="Primero crea una categoría" description="Ej. Hamburguesas, Bebidas, Postres." />
      ) : (
        <div className="space-y-6">
          {groups.map(({ cat, items }) =>
            filtering && !items.length ? null : (
              <section key={cat.id}>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="h-display text-lg font-semibold">{cat.name}</h2>
                  {!cat.active && <span className="chip bg-surface-sunken text-ink-mute">Oculta</span>}
                  <span className="text-sm text-ink-mute">{items.length}</span>
                  <button className="ml-auto text-sm font-semibold text-brand" onClick={() => setEditing({ product: null, categoryId: cat.id })}>+ Agregar</button>
                </div>
                {!items.length ? (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-mute">Sin productos en esta categoría.</p>
                ) : (
                  <SortableList
                    className="card divide-y divide-line"
                    items={items}
                    onReorder={(next) => reorder(cat.id, next)}
                    render={(p, handle) => <ProductRowView p={p} handle={filtering ? null : handle} onEdit={() => setEditing({ product: p })} onToggle={(v) => setAvailable(p, v)} />}
                  />
                )}
              </section>
            ),
          )}
          {filtering && groups.every((g) => !g.items.length) && <EmptyState title="Sin resultados" description={onlySoldOut ? 'No hay productos agotados.' : 'Prueba con otro nombre.'} />}
        </div>
      )}
      <ProductEditor open={!!editing} product={editing?.product ?? null} defaultCategoryId={editing?.categoryId} onClose={() => setEditing(null)} />
    </>
  );
}

function ProductRowView({ p, handle, onEdit, onToggle }: { p: ProductRow; handle: React.ReactNode; onEdit: () => void; onToggle: (v: boolean) => void }) {
  const hidden = CHANNEL_FLAGS.filter((c) => !p[c.key]);
  return (
    <div className={clsx('flex items-center gap-2 bg-surface-raised px-2 py-2.5 first:rounded-t-2xl last:rounded-b-2xl sm:gap-3 sm:px-3', !p.active && 'opacity-60')}>
      {handle ?? <span className="w-1" />}
      <button onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="grid h-12 w-12 shrink-0 sm:h-14 sm:w-14 place-items-center overflow-hidden rounded-xl bg-surface-sunken text-ink-mute">
          {p.imageUrl ? <img src={assetUrl(p.imageUrl)} alt="" className={clsx('h-full w-full object-cover', !p.available && 'grayscale')} /> : <ImageOff className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={clsx('block truncate font-semibold', !p.available && 'text-ink-mute line-through')}>{p.name}</span>
          <span className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="tabular-nums text-ink-soft">{money(p.priceCents)}</span>
            {!p.active && <span className="chip bg-surface-sunken text-ink-mute">Inactivo</span>}
            {hidden.length > 0 && hidden.length < 4 && (
              <span className="chip bg-surface-sunken text-ink-mute" title="Canales donde no se muestra"><EyeOff className="h-3 w-3" />{hidden.map((h) => h.label).join(', ')}</span>
            )}
            {hidden.length === 4 && <span className="chip bg-surface-sunken text-ink-mute"><EyeOff className="h-3 w-3" />Oculto</span>}
          </span>
        </span>
        <Pencil className="hidden h-4 w-4 text-ink-mute sm:block" />
      </button>
      <SoldOutToggle available={p.available} onChange={onToggle} name={p.name} />
    </div>
  );
}

/** Interruptor grande "Disponible / Agotado" pensado para el celular. */
export function SoldOutToggle({ available, onChange, name, small }: { available: boolean; onChange: (v: boolean) => void; name: string; small?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!available}
      aria-label={`${name}: ${available ? 'disponible, marcar agotado' : 'agotado, marcar disponible'}`}
      onClick={() => onChange(!available)}
      className={clsx(
        'shrink-0 rounded-xl border-2 font-bold transition active:scale-95',
        small ? 'h-9 w-[5.5rem] text-xs' : 'h-11 w-[5.5rem] text-xs sm:w-[6.5rem] sm:text-sm',
        available ? 'border-ok/40 bg-ok/10 text-ok hover:bg-ok/15' : 'border-danger bg-danger text-white',
      )}
    >
      {available ? 'Disponible' : 'Agotado'}
    </button>
  );
}
