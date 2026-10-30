import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { CheckSquare, Eye, FileUp, Plus, Search, Square, X } from 'lucide-react';
import { api } from '@/lib/api';
import { assetUrl } from '@/lib/config';
import { SupplyIcon } from '@/icons/supplies';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Select, Skeleton, Tabs, toast } from '@/ui';
import { useAreas } from '@/features/common-req/hooks';
import { AreaIcon } from '@/features/common-req/meta';
import { qtyLabel, unitShort } from '@/features/common-req/SupplyTile';
import type { Category, Supplier, SupplyView } from '@/features/common-req/types';
import { SupplyForm } from './SupplyForm';
import { TabletPreview } from './TabletPreview';
import { ImportModal } from './ImportModal';
import { CategoriesTab, QuickMessagesTab, SuppliersTab } from './OtherTabs';

type TabKey = 'insumos' | 'categorias' | 'proveedores' | 'mensajes';

export function CatalogPage({ initialTab = 'insumos' }: { initialTab?: TabKey }) {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabKey) || initialTab;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Catálogo" subtitle="Insumos que las áreas pueden pedir desde su tablet" />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        items={[
          { value: 'insumos', label: 'Insumos' },
          { value: 'categorias', label: 'Categorías' },
          { value: 'proveedores', label: 'Proveedores' },
          { value: 'mensajes', label: 'Mensajes rápidos' },
        ]}
      />
      {tab === 'insumos' && <SuppliesTab />}
      {tab === 'categorias' && <CategoriesTab />}
      {tab === 'proveedores' && <SuppliersTab />}
      {tab === 'mensajes' && <QuickMessagesTab />}
    </div>
  );
}

function SuppliesTab() {
  const qc = useQueryClient();
  const [f, setF] = useState({ q: '', categoryId: '', areaId: '', supplierId: '', active: 'true' });
  const supplies = useQuery({ queryKey: ['supplies', f.categoryId, f.areaId, f.supplierId, f.active], queryFn: () => api.get<SupplyView[]>('/supplies', { categoryId: f.categoryId || undefined, areaId: f.areaId || undefined, supplierId: f.supplierId || undefined, active: f.active || undefined }) });
  const cats = useQuery({ queryKey: ['supply-categories'], queryFn: () => api.get<Category[]>('/supply-categories') });
  const sups = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get<Supplier[]>('/suppliers') });
  const areas = useAreas();
  const [edit, setEdit] = useState<SupplyView | 'new' | null>(null);
  const [preview, setPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = useMemo(() => {
    const all = supplies.data ?? [];
    const t = norm(f.q.trim());
    return t ? all.filter((s) => norm(s.name).includes(t)) : all;
  }, [supplies.data, f.q]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['supplies'] });
    void qc.invalidateQueries({ queryKey: ['tablet-preview'] });
  };
  const areaMap = new Map((areas.data ?? []).map((a) => [a.id, a]));

  const bulk = async (areaId: string, mode: 'add' | 'remove') => {
    setBulkBusy(true);
    try {
      await api.post('/supplies/bulk-assign', { supplyIds: [...selected], areaIds: [areaId], mode });
      toast.success(mode === 'add' ? `Asignados a ${areaMap.get(areaId)?.name}` : `Quitados de ${areaMap.get(areaId)?.name}`);
      refresh();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBulkBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input className="input pl-9" placeholder="Buscar insumo" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </label>
        <Button variant="outline" icon={<Eye className="h-4 w-4" />} onClick={() => setPreview(true)} disabled={!areas.data?.length}>
          Vista en tablet
        </Button>
        <Button variant="outline" icon={<FileUp className="h-4 w-4" />} onClick={() => setImporting(true)}>
          Importar
        </Button>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>
          Insumo
        </Button>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} placeholder="Todas las categorías" options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))} aria-label="Categoría" />
        <Select value={f.areaId} onChange={(e) => setF({ ...f, areaId: e.target.value })} placeholder="Todas las áreas" options={(areas.data ?? []).map((a) => ({ value: a.id, label: a.name }))} aria-label="Área" />
        <Select value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })} placeholder="Todos los proveedores" options={(sups.data ?? []).map((s) => ({ value: s.id, label: s.name }))} aria-label="Proveedor" />
        <Select value={f.active} onChange={(e) => setF({ ...f, active: e.target.value })} options={[{ value: 'true', label: 'Activos' }, { value: 'false', label: 'Inactivos' }, { value: '', label: 'Todos' }]} aria-label="Estado" />
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-surface shadow-lift animate-slide-up">
          <span className="font-semibold">{selected.size} seleccionados</span>
          <span className="mx-1 h-5 w-px bg-surface/30" />
          {(areas.data ?? []).map((a) => (
            <span key={a.id} className="flex items-center overflow-hidden rounded-full text-sm font-semibold text-white" style={{ background: a.color }}>
              <button disabled={bulkBusy} className="flex items-center gap-1 px-2.5 py-1 hover:bg-black/15" onClick={() => bulk(a.id, 'add')} title={`Asignar a ${a.name}`}>
                <Plus className="h-3.5 w-3.5" /> {a.name}
              </button>
              <button disabled={bulkBusy} className="border-l border-white/30 px-2 py-1 hover:bg-black/15" onClick={() => bulk(a.id, 'remove')} aria-label={`Quitar de ${a.name}`} title={`Quitar de ${a.name}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <button className="ml-auto text-sm font-semibold opacity-80 hover:opacity-100" onClick={() => setSelected(new Set())}>Cancelar</button>
        </div>
      )}

      {supplies.isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : supplies.error ? (
        <ErrorState error={supplies.error} onRetry={() => supplies.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="Sin insumos" description="Crea uno o impórtalos desde un CSV." action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Nuevo insumo</Button>} />
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          <div className="flex items-center gap-3 bg-surface-sunken/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">
            <button onClick={() => setSelected(selected.size === list.length ? new Set() : new Set(list.map((s) => s.id)))} aria-label="Seleccionar todos">
              {selected.size === list.length ? <CheckSquare className="h-5 w-5 text-brand" /> : <Square className="h-5 w-5" />}
            </button>
            <span className="flex-1">{list.length} insumos</span>
            <span className="hidden w-48 md:block">Áreas</span>
          </div>
          {list.map((s) => (
            <div key={s.id} className={clsx('flex items-center gap-3 px-3 py-2.5 transition hover:bg-surface-sunken/40', selected.has(s.id) && 'bg-brand-50', !s.active && 'opacity-60')}>
              <button onClick={() => toggle(s.id)} aria-label={`Seleccionar ${s.name}`}>
                {selected.has(s.id) ? <CheckSquare className="h-5 w-5 text-brand" /> : <Square className="h-5 w-5 text-ink-mute" />}
              </button>
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setEdit(s)}>
                <SupplyIcon icon={s.icon} imageUrl={assetUrl(s.imageUrl)} label={s.name} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{s.name}</span>
                    {s.autoApprove && <Badge tone="ok">Auto</Badge>}
                    {!s.active && <Badge>Inactivo</Badge>}
                  </span>
                  <span className="block truncate text-xs text-ink-mute">
                    {s.category?.name} · +{qtyLabel(s.step, s.unit)} por toque
                    {s.maxPerOrder != null ? ` · máx ${s.maxPerOrder} ${unitShort(s.unit)}` : ''}
                    {s.supplier ? ` · ${s.supplier.name}` : ''}
                  </span>
                </span>
              </button>
              <div className="hidden w-48 flex-wrap gap-1 md:flex">
                {s.areaIds.length === 0 ? (
                  <span className="text-xs text-warn">Sin área</span>
                ) : (
                  s.areaIds.map((id) => {
                    const a = areaMap.get(id);
                    return a ? (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: a.color }}>
                        <AreaIcon icon={a.icon} className="h-3 w-3" />
                        {a.name}
                      </span>
                    ) : null;
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <SupplyForm
        open={!!edit}
        supply={edit === 'new' ? null : edit}
        onClose={() => setEdit(null)}
        onSaved={refresh}
        categories={cats.data ?? []}
        suppliers={sups.data ?? []}
        areas={areas.data ?? []}
      />
      {areas.data && <TabletPreview open={preview} onClose={() => setPreview(false)} areas={areas.data} initialAreaId={f.areaId || undefined} />}
      <ImportModal open={importing} onClose={() => setImporting(false)} onDone={() => { refresh(); void qc.invalidateQueries({ queryKey: ['supply-categories'] }); void qc.invalidateQueries({ queryKey: ['suppliers'] }); }} />
    </div>
  );
}
