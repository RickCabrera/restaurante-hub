import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { LayoutGrid } from 'lucide-react';
import { api } from '@/lib/api';
import { readableOn } from '@/lib/theme';
import { Button, EmptyState, Modal, PageLoader, toast } from '@/ui';
import { SupplyIcon } from '@/icons/supplies';
import { assetUrl } from '@/lib/config';
import { AreaIcon } from '@/features/common-req/meta';
import { SortableList } from '@/features/common-req/Sortable';
import { unitShort } from '@/features/common-req/SupplyTile';
import type { Area, CatalogSupply, TabletCatalog } from '@/features/common-req/types';

/** "Así se ve en la tablet de <área>" + reordenar con arrastrar y soltar. */
export function TabletPreview({ open, onClose, areas, initialAreaId }: { open: boolean; onClose: () => void; areas: Area[]; initialAreaId?: string }) {
  const qc = useQueryClient();
  const [areaId, setAreaId] = useState(initialAreaId ?? areas[0]?.id ?? '');
  const [cat, setCat] = useState('all');
  const [order, setOrder] = useState<CatalogSupply[] | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setAreaId(initialAreaId ?? areas[0]?.id ?? '');
  }, [open, initialAreaId, areas]);
  const q = useQuery({
    queryKey: ['tablet-preview', areaId],
    queryFn: () => api.get<TabletCatalog>('/tablet/catalog', { areaId }),
    enabled: open && !!areaId,
  });
  useEffect(() => {
    setOrder(null);
    setCat('all');
  }, [areaId]);
  const area = areas.find((a) => a.id === areaId);
  const supplies = order ?? q.data?.supplies ?? [];
  const shown = cat === 'all' ? supplies : supplies.filter((s) => s.categoryId === cat);
  const accent = area?.color ?? '#E85D04';

  const saveOrder = async () => {
    if (!order) return;
    setSaving(true);
    try {
      await api.post('/supplies/reorder', { areaId, ids: order.map((s) => s.id) });
      toast.success('Orden guardado', `Así aparece ahora en la tablet de ${area?.name}`);
      setOrder(null);
      void qc.invalidateQueries({ queryKey: ['tablet-preview', areaId] });
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Vista previa en tablet"
      footer={
        <>
          <p className="mr-auto self-center text-xs text-ink-mute">Arrastra los insumos para cambiar el orden en esta área.</p>
          {order && <Button variant="ghost" onClick={() => setOrder(null)}>Descartar</Button>}
          <Button disabled={!order} loading={saving} onClick={saveOrder}>Guardar orden</Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {areas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAreaId(a.id)}
            className={clsx('flex h-9 items-center gap-2 rounded-full border-2 px-3 text-sm font-semibold', a.id === areaId ? 'text-white' : 'border-line text-ink-soft')}
            style={a.id === areaId ? { background: a.color, borderColor: a.color } : undefined}
          >
            <AreaIcon icon={a.icon} className="h-4 w-4" /> {a.name}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-[28px] border-[10px] border-ink/85 bg-surface shadow-lift">
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: accent, color: readableOn(accent) }}>
          <AreaIcon icon={area?.icon} className="h-6 w-6" />
          <span className="h-display text-xl font-bold">{area?.name}</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto border-b border-line bg-surface-raised px-3 py-2 scroll-thin">
          <button onClick={() => setCat('all')} className={clsx('flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold', cat === 'all' ? 'text-white' : 'border-line')} style={cat === 'all' ? { background: accent, borderColor: accent } : undefined}>
            <LayoutGrid className="h-4 w-4" /> Todos
          </button>
          {(q.data?.categories ?? [])
            .filter((c) => supplies.some((s) => s.categoryId === c.id))
            .map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className={clsx('flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold', cat === c.id ? 'text-white' : 'border-line')} style={cat === c.id ? { background: accent, borderColor: accent } : undefined}>
                <SupplyIcon icon={c.icon} size={20} /> {c.name}
              </button>
            ))}
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-3 scroll-thin">
          {q.isLoading ? (
            <PageLoader />
          ) : !supplies.length ? (
            <EmptyState title="Sin insumos" description="Asigna insumos a esta área desde la lista." />
          ) : (
            <SortableList
              grid
              items={shown}
              className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6"
              onReorder={(next) => {
                if (cat === 'all') return setOrder(next);
                // reordenar dentro de una categoría: reubicar en la lista completa
                const ids = new Set(next.map((s) => s.id));
                const queue = [...next];
                setOrder(supplies.map((s) => (ids.has(s.id) ? queue.shift()! : s)));
              }}
              render={(s, handle) => (
                <div className="relative flex flex-col items-center gap-1 rounded-2xl border-2 border-line bg-surface-raised px-1 pb-2 pt-3 text-center">
                  <span className="absolute left-0.5 top-0.5">{handle}</span>
                  <SupplyIcon icon={s.icon} imageUrl={assetUrl(s.imageUrl)} label={s.name} size={52} />
                  <span className="line-clamp-2 text-xs font-semibold leading-tight">{s.name}</span>
                  <span className="text-[10px] text-ink-mute">{unitShort(s.unit)}</span>
                </div>
              )}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
