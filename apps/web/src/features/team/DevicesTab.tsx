import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { QRCodeSVG } from 'qrcode.react';
import { ChefHat, Monitor, MoreVertical, Pencil, Plus, Receipt, Tablet, Unplug } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { useModuleEnabled } from '@/app/session';
import { Badge, Button, confirm, EmptyState, ErrorState, Input, Modal, Select, Skeleton, toast } from '@/ui';
import { useAreas, useDevices } from '@/features/common-req/hooks';
import { AreaBadge, AreaIcon } from '@/features/common-req/meta';
import type { Device } from '@/features/common-req/types';

const PURPOSE: Record<Device['purpose'], { label: string; icon: typeof Tablet }> = {
  AREA: { label: 'Tablet de área', icon: Tablet },
  KDS: { label: 'Pantalla de cocina', icon: Monitor },
  POS: { label: 'Caja / comandero', icon: Receipt },
};
const PLATFORM: Record<string, string> = { web: 'Navegador', android: 'Android', ios: 'iPad', desktop: 'Escritorio' };

export function DevicesTab() {
  const qc = useQueryClient();
  const q = useDevices();
  const [pairing, setPairing] = useState(false);
  const [edit, setEdit] = useState<Device | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const revoke = async (d: Device) => {
    setMenu(null);
    if (!(await confirm({ title: `¿Revocar “${d.name}”?`, description: 'La tablet se cerrará y tendrá que emparejarse de nuevo.', danger: true, confirmText: 'Revocar' }))) return;
    try {
      await api.post(`/auth/devices/${d.id}/revoke`);
      void qc.invalidateQueries({ queryKey: ['devices'] });
      toast.success('Tablet revocada');
    } catch (e) {
      toast.fromError(e);
    }
  };

  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div>
      <div className="mb-4 flex justify-between gap-2">
        <p className="text-sm text-ink-mute">{q.data?.filter((d) => d.online).length ?? 0} de {q.data?.length ?? 0} en línea</p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setPairing(true)}>Emparejar tablet</Button>
      </div>
      {!q.data?.length ? (
        <EmptyState icon={<Tablet className="h-7 w-7" />} title="Sin tablets" description="Empareja la tablet de cada área para que puedan pedir insumos." action={<Button onClick={() => setPairing(true)}>Emparejar tablet</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.map((d) => {
            const P = PURPOSE[d.purpose];
            return (
              <div key={d.id} className="card relative p-4">
                <div className="flex items-start gap-3">
                  {d.area ? <AreaBadge area={d.area} size={44} /> : <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-sunken"><P.icon className="h-5 w-5" /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{d.name}</p>
                    <p className="flex items-center gap-1.5 text-xs text-ink-mute">
                      <P.icon className="h-3.5 w-3.5" /> {P.label}
                    </p>
                  </div>
                  <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken" onClick={() => setMenu(menu === d.id ? null : d.id)} aria-label="Opciones">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {menu === d.id && (
                    <div className="absolute right-3 top-12 z-10 w-44 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-lift animate-slide-up">
                      <button className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-surface-sunken" onClick={() => { setMenu(null); setEdit(d); }}><Pencil className="h-4 w-4" /> Renombrar / mover</button>
                      <button className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-danger hover:bg-danger/10" onClick={() => revoke(d)}><Unplug className="h-4 w-4" /> Revocar</button>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className={clsx('flex items-center gap-1.5 font-semibold', d.online ? 'text-ok' : 'text-ink-mute')}>
                    <span className={clsx('h-2.5 w-2.5 rounded-full', d.online ? 'animate-pulse bg-ok' : 'bg-ink-mute/40')} />
                    {d.online ? 'En línea' : d.lastSeenAt ? `Visto ${timeAgo(d.lastSeenAt)}` : 'Nunca conectada'}
                  </span>
                  <Badge>{PLATFORM[d.platform ?? ''] ?? d.platform ?? 'Web'}</Badge>
                </div>
                <p className="mt-1 text-[11px] text-ink-mute">Emparejada {fmtDateTime(d.createdAt)}</p>
              </div>
            );
          })}
        </div>
      )}
      <PairWizard open={pairing} onClose={() => { setPairing(false); void qc.invalidateQueries({ queryKey: ['devices'] }); }} />
      <EditDevice device={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function EditDevice({ device, onClose }: { device: Device | null; onClose: () => void }) {
  const qc = useQueryClient();
  const areas = useAreas();
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(device?.name ?? '');
    setAreaId(device?.areaId ?? '');
  }, [device]);
  const save = async () => {
    if (!device) return;
    setBusy(true);
    try {
      await api.patch(`/devices/${device.id}`, { name: name.trim(), areaId: areaId || null });
      void qc.invalidateQueries({ queryKey: ['devices'] });
      onClose();
      toast.success('Tablet actualizada');
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!device} onClose={onClose} size="sm" title="Editar tablet" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={save}>Guardar</Button></>}>
      <div className="space-y-4">
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Área" value={areaId} onChange={(e) => setAreaId(e.target.value)} placeholder={device?.purpose === 'POS' ? 'Sin área' : undefined} options={(areas.data ?? []).map((a) => ({ value: a.id, label: a.name }))} />
      </div>
    </Modal>
  );
}

function PairWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const posOn = useModuleEnabled('pos');
  const areas = useAreas();
  const [step, setStep] = useState<1 | 2>(1);
  const [purpose, setPurpose] = useState<Device['purpose']>('AREA');
  const [areaId, setAreaId] = useState('');
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) {
      setStep(1);
      setCode(null);
      setPurpose('AREA');
    }
  }, [open]);
  useEffect(() => {
    if (!areaId && areas.data?.length) setAreaId(areas.data[0].id);
  }, [areas.data, areaId]);
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [code]);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ code: string; expiresAt: string }>('/auth/pairing-codes', { purpose, areaId: purpose === 'POS' ? areaId || undefined : areaId });
      setCode(r);
      setNow(Date.now());
      setStep(2);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  const left = code ? Math.max(0, Math.floor((new Date(code.expiresAt).getTime() - now) / 1000)) : 0;
  const purposes: Device['purpose'][] = posOn ? ['AREA', 'KDS', 'POS'] : ['AREA', 'KDS'];
  const url = `${location.origin}/emparejar`;
  const area = areas.data?.find((a) => a.id === areaId);

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Emparejar tablet">
      {step === 1 ? (
        <div className="space-y-5">
          <div>
            <span className="label">¿Para qué es?</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {purposes.map((p) => {
                const P = PURPOSE[p];
                return (
                  <button key={p} onClick={() => setPurpose(p)} className={clsx('flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center font-semibold transition', purpose === p ? 'border-brand bg-brand-50 text-brand-700' : 'border-line')}>
                    {p === 'KDS' ? <ChefHat className="h-8 w-8" /> : <P.icon className="h-8 w-8" />}
                    {P.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className="label">{purpose === 'POS' ? 'Área (opcional)' : 'Área'}</span>
            <div className="flex flex-wrap gap-2">
              {(areas.data ?? []).map((a) => (
                <button key={a.id} onClick={() => setAreaId(a.id)} className={clsx('flex h-11 items-center gap-2 rounded-full border-2 px-4 font-semibold', a.id === areaId ? 'text-white' : 'border-line text-ink-soft')} style={a.id === areaId ? { background: a.color, borderColor: a.color } : undefined}>
                  <AreaIcon icon={a.icon} className="h-5 w-5" /> {a.name}
                </button>
              ))}
            </div>
          </div>
          <Button size="lg" block loading={busy} disabled={purpose !== 'POS' && !areaId} onClick={generate}>
            Generar código
          </Button>
        </div>
      ) : (
        code && (
          <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm font-medium text-ink-mute">
                {PURPOSE[purpose].label}
                {area ? ` · ${area.name}` : ''}
              </p>
              <p className={clsx('h-display my-2 select-all text-6xl font-bold tracking-[0.18em] sm:text-7xl', left === 0 && 'text-ink-mute line-through')}>{code.code}</p>
              <p className={clsx('mb-5 text-sm font-semibold', left < 60 ? 'text-danger' : 'text-ink-mute')}>
                {left > 0 ? `Vence en ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'El código venció'}
              </p>
              <ol className="space-y-2 text-sm text-ink-soft">
                <li><b>1.</b> En la tablet abre <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-xs">{url}</span> (o escanea el QR).</li>
                <li><b>2.</b> Escribe el código de 6 dígitos.</li>
                <li><b>3.</b> ¡Listo! La tablet queda conectada a {area?.name ?? 'tu negocio'}.</li>
              </ol>
              <div className="mt-5 flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Otra tablet</Button>
                {left === 0 && <Button loading={busy} onClick={generate}>Nuevo código</Button>}
                <Button variant="ghost" onClick={onClose}>Cerrar</Button>
              </div>
            </div>
            <div className="mx-auto rounded-3xl bg-white p-4 shadow-card">
              <QRCodeSVG value={url} size={180} />
            </div>
          </div>
        )
      )}
    </Modal>
  );
}
