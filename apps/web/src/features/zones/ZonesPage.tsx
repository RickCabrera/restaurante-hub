import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Circle as CircleIcon, Crosshair, MapPinned, Pencil, PauseCircle, PlayCircle, Plus, Pentagon, Store, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtTime, money } from '@/lib/format';
import { Button, EmptyState, ErrorState, Input, PageHeader, Skeleton, Toggle, confirm, toast } from '@/ui';
import {
  AddressSearch, dk, MapView, MoneyInput, useBranches, useOrderRealtime, useZones, type Branch, type Coverage, type Zone,
} from '@/features/delivery-common';
import { PauseModal, resumeBranch } from '@/features/orders/StoreBanner';
import { BranchEditor } from './BranchEditor';
import { GeomanPolygon, geoToRing, ringToGeo } from './GeomanPolygon';

const PALETTE = ['#2A9D8F', '#E9C46A', '#E76F51', '#3A86FF', '#8338EC', '#FB5607', '#06A77D', '#D62828'];

export function ZonesPage() {
  const [params, setParams] = useSearchParams();
  const branches = useBranches();
  useOrderRealtime();
  const editId = params.get('sucursal');
  if (editId) {
    const b = editId === 'nueva' ? null : branches.data?.find((x) => x.id === editId);
    if (editId !== 'nueva' && !b) return branches.isLoading ? <Skeleton className="h-96" /> : <ErrorState error={new Error('Sucursal no encontrada')} />;
    return (
      <div className="mx-auto max-w-6xl">
        <BranchEditor branch={b ?? null} onBack={() => setParams({}, { replace: true })} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Sucursales y zonas" subtitle="Horarios, ubicación y hasta dónde entregas" />
      <BranchesSection onEdit={(id) => setParams({ sucursal: id })} />
      <ZonesSection />
    </div>
  );
}

function BranchesSection({ onEdit }: { onEdit: (id: string) => void }) {
  const qc = useQueryClient();
  const branches = useBranches();
  const [pausing, setPausing] = useState<Branch | null>(null);
  if (branches.isError) return <ErrorState error={branches.error} onRetry={() => branches.refetch()} />;
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="h-display text-lg font-semibold">Sucursales</h2>
        <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => onEdit('nueva')}>Sucursal</Button>
      </div>
      {branches.isLoading ? (
        <Skeleton className="h-28" />
      ) : !branches.data?.length ? (
        <EmptyState icon={<Store className="h-7 w-7" />} title="Sin sucursales" action={<Button onClick={() => onEdit('nueva')}>Crear sucursal</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {branches.data.map((b) => {
            const st = b.status;
            const paused = st.reason === 'PAUSED';
            return (
              <article key={b.id} className={clsx('card p-4', !b.active && 'opacity-70')}>
                <div className="flex items-start gap-3">
                  <span className={clsx('mt-1 h-3 w-3 shrink-0 rounded-full', st.open ? 'bg-ok' : paused ? 'bg-danger' : 'bg-warn')} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{b.name}</p>
                    <p className="truncate text-sm text-ink-mute">{b.address || 'Sin dirección'}</p>
                    <p className={clsx('mt-1 text-sm font-medium', st.open ? 'text-ok' : paused ? 'text-danger' : 'text-warn')}>
                      {st.open ? 'Abierta' : paused ? `En pausa${st.pausedUntil ? ` hasta ${fmtTime(st.pausedUntil)}` : ''}` : st.reason === 'INACTIVE' ? 'Inactiva' : `Cerrada${st.nextOpeningText ? ` · abre ${st.nextOpeningText}` : ''}`}
                    </p>
                    <p className="text-xs text-ink-mute">{st.hoursText}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      {b.acceptsDelivery && <span className="chip bg-surface-sunken text-ink-soft">Domicilio</span>}
                      {b.acceptsPickup && <span className="chip bg-surface-sunken text-ink-soft">Recoger</span>}
                      <span className="chip bg-surface-sunken text-ink-soft">Prep. {b.prepMinutes} min</span>
                      {b.lat == null && <span className="chip bg-warn/15 text-warn">Sin ubicación</span>}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(b.id)}>Editar</Button>
                  {b.active && (paused ? (
                    <Button size="sm" variant="success" icon={<PlayCircle className="h-4 w-4" />} onClick={() => resumeBranch(qc, b)}>Reanudar</Button>
                  ) : (
                    <Button size="sm" variant="ghost" icon={<PauseCircle className="h-4 w-4" />} onClick={() => setPausing(b)}>Pausar pedidos</Button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {pausing && <PauseModal branch={pausing} open onClose={() => setPausing(null)} />}
    </section>
  );
}

// -------------------- Zonas --------------------
interface ZoneDraft {
  id?: string;
  branchId: string;
  name: string;
  kind: 'RADIUS' | 'POLYGON';
  radiusKm: number;
  ring: [number, number][];
  color: string;
  feeCents: number;
  minOrderCents: number;
  freeFromCents: number | null;
  etaMinutes: number;
  priority: number;
  active: boolean;
}

function ZonesSection() {
  const qc = useQueryClient();
  const branches = useBranches();
  const zones = useZones();
  const [draft, setDraft] = useState<ZoneDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [testPoint, setTestPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<{ covered: boolean; coverage: Coverage | null } | null>(null);
  const [testing, setTesting] = useState(false);

  const list = (zones.data ?? []).slice().sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  const bmap = useMemo(() => new Map((branches.data ?? []).map((b) => [b.id, b])), [branches.data]);
  const firstBranch = branches.data?.find((b) => b.active) ?? branches.data?.[0];

  const startNew = () => {
    if (!firstBranch) return toast.error('Primero crea una sucursal');
    setTestMode(false);
    setDraft({
      branchId: firstBranch.id, name: `Zona ${list.length + 1}`, kind: firstBranch.lat != null ? 'RADIUS' : 'POLYGON', radiusKm: 3, ring: [],
      color: PALETTE[list.length % PALETTE.length], feeCents: 3000, minOrderCents: 0, freeFromCents: null, etaMinutes: 40, priority: list.length + 1, active: true,
    });
  };
  const startEdit = (z: Zone) => {
    setTestMode(false);
    setDraft({
      id: z.id, branchId: z.branchId, name: z.name, kind: z.kind, radiusKm: z.radiusKm ?? 3, ring: geoToRing(z.polygon?.coordinates), color: z.color,
      feeCents: z.feeCents, minOrderCents: z.minOrderCents, freeFromCents: z.freeFromCents, etaMinutes: z.etaMinutes, priority: z.priority, active: z.active,
    });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error('Escribe el nombre de la zona');
    if (draft.kind === 'POLYGON' && draft.ring.length < 3) return toast.error('Dibuja el polígono en el mapa (al menos 3 puntos)');
    const b = bmap.get(draft.branchId);
    if (draft.kind === 'RADIUS' && (b?.lat == null || b?.lng == null)) return toast.error('La sucursal no tiene ubicación', 'Configúrala para usar zonas por radio, o dibuja un polígono');
    setSaving(true);
    const body = {
      branchId: draft.branchId, name: draft.name.trim(), kind: draft.kind,
      radiusKm: draft.kind === 'RADIUS' ? draft.radiusKm : null,
      polygon: draft.kind === 'POLYGON' ? { type: 'Polygon', coordinates: ringToGeo(draft.ring) } : null,
      color: draft.color, feeCents: draft.feeCents, minOrderCents: draft.minOrderCents, freeFromCents: draft.freeFromCents,
      etaMinutes: draft.etaMinutes, priority: draft.priority, active: draft.active,
    };
    try {
      if (draft.id) await api.patch(`/zones/${draft.id}`, body);
      else await api.post('/zones', body);
      await qc.invalidateQueries({ queryKey: dk.zones });
      toast.success('Zona guardada');
      setDraft(null);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!draft?.id) return;
    if (!(await confirm({ title: `¿Eliminar ${draft.name}?`, description: 'Las direcciones dentro de esta zona podrían quedar sin cobertura.', danger: true, confirmText: 'Eliminar' }))) return;
    try {
      await api.del(`/zones/${draft.id}`);
      await qc.invalidateQueries({ queryKey: dk.zones });
      setDraft(null);
    } catch (e) {
      toast.fromError(e);
    }
  };

  const test = async (p: { lat: number; lng: number }) => {
    setTestPoint(p);
    setTesting(true);
    try {
      setTestResult(await api.get<{ covered: boolean; coverage: Coverage | null }>('/zones/coverage', p));
    } catch (e) {
      toast.fromError(e);
    } finally {
      setTesting(false);
    }
  };

  // Elementos del mapa
  const shown = list.filter((z) => z.id !== draft?.id);
  const circles = shown.filter((z) => z.kind === 'RADIUS' && z.radiusKm).flatMap((z) => {
    const b = bmap.get(z.branchId);
    return b?.lat != null && b.lng != null ? [{ id: z.id, lat: b.lat, lng: b.lng, radiusKm: z.radiusKm!, color: z.color, dashed: !z.active }] : [];
  });
  const polygons = shown.filter((z) => z.kind === 'POLYGON' && z.polygon).map((z) => ({ id: z.id, coordinates: geoToRing(z.polygon!.coordinates), color: z.color, dashed: !z.active }));
  const draftBranch = draft ? bmap.get(draft.branchId) : null;
  if (draft?.kind === 'RADIUS' && draftBranch?.lat != null && draftBranch.lng != null) circles.push({ id: 'draft', lat: draftBranch.lat, lng: draftBranch.lng, radiusKm: draft.radiusKm, color: draft.color, dashed: false });
  const markers = (branches.data ?? []).filter((b) => b.lat != null && b.lng != null).map((b) => ({ id: b.id, lat: b.lat!, lng: b.lng!, color: '#1c1917', label: b.name[0], popup: b.name }));
  if (testPoint) markers.push({ id: 'test', lat: testPoint.lat, lng: testPoint.lng, color: testResult?.covered ? 'rgb(var(--ok))' : 'rgb(var(--danger))', label: '?', popup: 'Dirección de prueba' });
  const center: [number, number] | undefined = firstBranch?.lat != null && firstBranch.lng != null ? [firstBranch.lat, firstBranch.lng] : undefined;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="h-display mr-auto text-lg font-semibold">Zonas de reparto</h2>
        <Button size="sm" variant={testMode ? 'primary' : 'outline'} icon={<Crosshair className="h-4 w-4" />} onClick={() => { setDraft(null); setTestMode((v) => !v); setTestResult(null); setTestPoint(null); }}>
          Probar dirección
        </Button>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={startNew} disabled={!!draft}>Zona</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <MapView
            center={center}
            height={480}
            circles={circles}
            polygons={polygons}
            markers={markers}
            fitToContent={!draft}
            onMapClick={testMode ? (lat, lng) => test({ lat, lng }) : undefined}
          >
            {draft?.kind === 'POLYGON' && (
              <GeomanPolygon key={draft.id ?? 'new'} ring={draft.ring} color={draft.color} drawing onChange={(ring) => setDraft((d) => (d ? { ...d, ring } : d))} />
            )}
          </MapView>
          <p className="mt-1.5 text-xs text-ink-mute">
            {testMode ? 'Toca el mapa o escribe una dirección para ver qué zona aplica.' : draft?.kind === 'POLYGON' ? (draft.ring.length ? 'Arrastra los vértices para ajustar la zona. Toca un vértice con clic derecho para borrarlo.' : 'Toca el mapa para marcar cada esquina de la zona; toca el primer punto para cerrarla.') : 'Las zonas punteadas están desactivadas.'}
          </p>
        </div>

        <div className="min-w-0">
          {testMode ? (
            <div className="card space-y-3 p-4">
              <h3 className="font-semibold">Probar cobertura</h3>
              <AddressSearch value={testText} onChange={setTestText} onPick={(p) => test({ lat: p.lat, lng: p.lng })} placeholder="Escribe una dirección" />
              {testing ? (
                <Skeleton className="h-20" />
              ) : testResult ? (
                testResult.covered && testResult.coverage ? (
                  <div className="rounded-2xl bg-ok/10 p-3 text-sm">
                    <p className="flex items-center gap-2 font-semibold text-ok"><span className="h-3 w-3 rounded-full" style={{ background: testResult.coverage.zone.color }} />{testResult.coverage.zone.name}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                      <dt className="text-ink-mute">Sucursal</dt><dd>{testResult.coverage.branch.name}</dd>
                      <dt className="text-ink-mute">Envío</dt><dd>{testResult.coverage.feeCents ? money(testResult.coverage.feeCents) : 'Gratis'}</dd>
                      <dt className="text-ink-mute">Pedido mínimo</dt><dd>{testResult.coverage.minOrderCents ? money(testResult.coverage.minOrderCents) : 'Sin mínimo'}</dd>
                      {testResult.coverage.freeFromCents != null && <><dt className="text-ink-mute">Envío gratis desde</dt><dd>{money(testResult.coverage.freeFromCents)}</dd></>}
                      <dt className="text-ink-mute">Tiempo</dt><dd>{testResult.coverage.etaMinutes} min</dd>
                      {testResult.coverage.distanceKm != null && <><dt className="text-ink-mute">Distancia</dt><dd>{testResult.coverage.distanceKm.toFixed(1)} km</dd></>}
                    </dl>
                  </div>
                ) : (
                  <p className="rounded-2xl bg-danger/10 p-3 text-sm font-medium text-danger">Fuera de cobertura: ninguna zona activa incluye este punto.</p>
                )
              ) : (
                <p className="text-sm text-ink-mute">Sin prueba todavía.</p>
              )}
            </div>
          ) : draft ? (
            <ZoneForm draft={draft} setDraft={setDraft} branches={branches.data ?? []} saving={saving} onSave={save} onCancel={() => setDraft(null)} onDelete={draft.id ? remove : undefined} />
          ) : zones.isLoading ? (
            <Skeleton className="h-60" />
          ) : !list.length ? (
            <EmptyState className="card" icon={<MapPinned className="h-7 w-7" />} title="Sin zonas" description="Sin zonas activas no se aceptan pedidos a domicilio." action={<Button onClick={startNew}>Crear zona</Button>} />
          ) : (
            <ul className="card divide-y divide-line">
              {list.map((z) => (
                <li key={z.id}>
                  <button onClick={() => startEdit(z)} className={clsx('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken', !z.active && 'opacity-60')}>
                    <span className="h-4 w-4 shrink-0 rounded-md" style={{ background: z.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{z.name}</span>
                      <span className="block text-xs text-ink-mute">
                        {z.kind === 'RADIUS' ? `Radio ${z.radiusKm} km` : 'Polígono'} · {z.etaMinutes} min{!z.active && ' · desactivada'}
                      </span>
                    </span>
                    <span className="text-right text-sm">
                      <span className="block font-semibold tabular-nums">{z.feeCents ? money(z.feeCents) : 'Gratis'}</span>
                      {z.minOrderCents > 0 && <span className="block text-xs text-ink-mute">mín. {money(z.minOrderCents)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ZoneForm({ draft, setDraft, branches, saving, onSave, onCancel, onDelete }: {
  draft: ZoneDraft;
  setDraft: React.Dispatch<React.SetStateAction<ZoneDraft | null>>;
  branches: Branch[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const set = <K extends keyof ZoneDraft>(k: K, v: ZoneDraft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{draft.id ? 'Editar zona' : 'Nueva zona'}</h3>
        <button onClick={onCancel} className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken" aria-label="Cerrar"><X className="h-4 w-4" /></button>
      </div>
      <Input label="Nombre" value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
      {branches.length > 1 && (
        <label className="block"><span className="label">Sucursal</span>
          <select className="input" value={draft.branchId} onChange={(e) => set('branchId', e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      )}
      <div>
        <span className="label">Forma</span>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1">
          {([['RADIUS', 'Radio', CircleIcon], ['POLYGON', 'Polígono', Pentagon]] as const).map(([k, l, I]) => (
            <button key={k} type="button" onClick={() => set('kind', k)} aria-pressed={draft.kind === k} className={clsx('flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold', draft.kind === k ? 'bg-surface-raised shadow-sm' : 'text-ink-mute')}>
              <I className="h-4 w-4" />{l}
            </button>
          ))}
        </div>
      </div>
      {draft.kind === 'RADIUS' ? (
        <div>
          <div className="mb-1 flex items-baseline justify-between"><span className="label !mb-0">Radio desde la sucursal</span><span className="font-bold tabular-nums">{draft.radiusKm.toFixed(1)} km</span></div>
          <input type="range" min={0.5} max={20} step={0.5} value={draft.radiusKm} onChange={(e) => set('radiusKm', +e.target.value)} className="w-full accent-[rgb(var(--brand))]" aria-label="Radio en km" />
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-xl bg-surface-sunken px-3 py-2 text-sm">
          <span>{draft.ring.length ? `${draft.ring.length} puntos` : 'Dibuja la zona en el mapa'}</span>
          {draft.ring.length > 0 && <button className="font-semibold text-brand" onClick={() => set('ring', [])}>Volver a dibujar</button>}
        </div>
      )}
      <div>
        <span className="label">Color</span>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button key={c} type="button" onClick={() => set('color', c)} aria-label={`Color ${c}`} className={clsx('h-8 w-8 rounded-full border-2 transition', draft.color.toLowerCase() === c.toLowerCase() ? 'scale-110 border-ink' : 'border-transparent')} style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MoneyInput label="Costo de envío" valueCents={draft.feeCents} onChangeCents={(c) => set('feeCents', c ?? 0)} />
        <MoneyInput label="Pedido mínimo" valueCents={draft.minOrderCents} onChangeCents={(c) => set('minOrderCents', c ?? 0)} />
        <MoneyInput label="Envío gratis desde" hint="Vacío = nunca" valueCents={draft.freeFromCents} onChangeCents={(c) => set('freeFromCents', c)} placeholder="—" />
        <Input label="Tiempo (min)" type="number" min={1} max={600} value={draft.etaMinutes} onChange={(e) => set('etaMinutes', Math.max(1, +e.target.value || 1))} />
      </div>
      <Input label="Prioridad" type="number" min={0} max={1000} value={draft.priority} onChange={(e) => set('priority', Math.max(0, +e.target.value || 0))} hint="Si un punto cae en dos zonas, gana el número menor." />
      <Toggle label="Zona activa" checked={draft.active} onChange={(v) => set('active', v)} />
      <div className="flex gap-2 pt-1">
        {onDelete && <Button variant="ghost" className="text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={onDelete} aria-label="Eliminar zona" />}
        <Button variant="ghost" className="ml-auto" onClick={onCancel}>Cancelar</Button>
        <Button loading={saving} onClick={onSave}>Guardar</Button>
      </div>
    </div>
  );
}
