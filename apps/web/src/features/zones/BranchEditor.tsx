import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, Copy, LocateFixed, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Toggle, confirm, toast } from '@/ui';
import { dk, geocodeText, PinPicker, WEEKDAY_LONG, type Branch, type Hours, type HoursRange } from '@/features/delivery-common';

const DAYS = ['1', '2', '3', '4', '5', '6', '0'] as const; // lunes primero

interface Draft {
  name: string;
  address: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  hours: Hours;
  closedDates: string[];
  acceptsDelivery: boolean;
  acceptsPickup: boolean;
  prepMinutes: number;
  active: boolean;
}

const defaultHours = (): Hours => Object.fromEntries(DAYS.map((d) => [d, [{ open: '09:00', close: '22:00' }]])) as Hours;

export function BranchEditor({ branch, onBack }: { branch: Branch | null; onBack: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>({
    name: '', address: '', phone: '', lat: null, lng: null, hours: defaultHours(), closedDates: [], acceptsDelivery: true, acceptsPickup: true, prepMinutes: 25, active: true,
  });
  const [newDate, setNewDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!branch) return;
    setD({
      name: branch.name, address: branch.address ?? '', phone: branch.phone ?? '', lat: branch.lat, lng: branch.lng,
      hours: branch.hours ?? {}, closedDates: branch.closedDates ?? [], acceptsDelivery: branch.acceptsDelivery, acceptsPickup: branch.acceptsPickup,
      prepMinutes: branch.prepMinutes, active: branch.active,
    });
  }, [branch]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setDay = (day: string, ranges: HoursRange[]) => set('hours', { ...d.hours, [day]: ranges });

  const geocode = async () => {
    if (d.address.trim().length < 3) return toast.error('Escribe la dirección primero');
    setLocating(true);
    try {
      const r = await geocodeText(d.address);
      if (!r) toast.error('No encontramos la dirección', 'Marca el punto en el mapa');
      else setD((x) => ({ ...x, lat: r.lat, lng: r.lng }));
    } catch (e) {
      toast.fromError(e);
    } finally {
      setLocating(false);
    }
  };

  const copyToAll = (day: string) => {
    const src = d.hours[day as keyof Hours] ?? [];
    set('hours', Object.fromEntries(DAYS.map((x) => [x, src.map((r) => ({ ...r }))])) as Hours);
    toast.success(`Horario del ${WEEKDAY_LONG[+day].toLowerCase()} copiado a todos los días`);
  };

  const save = async () => {
    if (!d.name.trim()) return toast.error('Escribe el nombre de la sucursal');
    for (const day of DAYS) for (const r of d.hours[day] ?? []) if (!r.open || !r.close) return toast.error(`Completa el horario del ${WEEKDAY_LONG[+day].toLowerCase()}`);
    setSaving(true);
    try {
      const body = { ...d, name: d.name.trim(), address: d.address.trim() || null, phone: d.phone.trim() || null };
      if (branch) await api.patch(`/branches/${branch.id}`, body);
      else await api.post('/branches', body);
      await qc.invalidateQueries({ queryKey: dk.branches });
      toast.success('Sucursal guardada');
      onBack();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!branch) return;
    if (!(await confirm({ title: `¿Desactivar ${branch.name}?`, description: 'Dejará de recibir pedidos. Puedes volver a activarla.', danger: true, confirmText: 'Desactivar' }))) return;
    try {
      await api.del(`/branches/${branch.id}`);
      await qc.invalidateQueries({ queryKey: dk.branches });
      onBack();
    } catch (e) {
      toast.fromError(e);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-mute hover:text-ink"><ArrowLeft className="h-4 w-4" />Sucursales</button>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="h-display mr-auto text-2xl font-bold sm:text-3xl">{branch ? branch.name : 'Nueva sucursal'}</h1>
        {branch && <Button variant="ghost" className="text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={deactivate}>Desactivar</Button>}
        <Button loading={saving} onClick={save}>Guardar cambios</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card min-w-0 space-y-4 p-4">
          <h2 className="h-display font-semibold">Datos y ubicación</h2>
          <Input label="Nombre" value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
          <div className="grid gap-3 xl:grid-cols-[1fr_160px]">
            <div>
              <span className="label">Dirección</span>
              <div className="flex gap-2">
                <input className="input" value={d.address} onChange={(e) => set('address', e.target.value)} maxLength={200} placeholder="Calle, número, colonia" />
                <Button variant="outline" className="!h-11 shrink-0" loading={locating} icon={<LocateFixed className="h-4 w-4" />} onClick={geocode} title="Ubicar en el mapa">Ubicar</Button>
              </div>
            </div>
            <Input label="Teléfono" value={d.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" maxLength={30} />
          </div>
          <PinPicker value={d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null} onChange={(p) => setD((x) => ({ ...x, lat: p.lat, lng: p.lng }))} height={260} hint="Toca el mapa para fijar la ubicación de la sucursal (se usa para las zonas por radio)" />
          <div className="space-y-3 rounded-2xl bg-surface-sunken p-4">
            <Toggle label="Entrega a domicilio" checked={d.acceptsDelivery} onChange={(v) => set('acceptsDelivery', v)} />
            <Toggle label="Pasar a recoger" checked={d.acceptsPickup} onChange={(v) => set('acceptsPickup', v)} />
            <Toggle label="Sucursal activa" description="Si está inactiva no recibe pedidos." checked={d.active} onChange={(v) => set('active', v)} />
          </div>
          <Input label="Tiempo de preparación (minutos)" type="number" min={0} max={600} value={d.prepMinutes} onChange={(e) => set('prepMinutes', Math.max(0, Math.min(600, +e.target.value || 0)))} hint="Se suma al tiempo de la zona para estimar la entrega." />
        </section>

        <section className="card min-w-0 p-4">
          <h2 className="h-display mb-1 font-semibold">Horario semanal</h2>
          <p className="mb-3 text-xs text-ink-mute">Para horario nocturno usa p. ej. 18:00 a 02:00. 00:00 a 00:00 = abierto 24 h.</p>
          <div className="divide-y divide-line">
            {DAYS.map((day) => {
              const ranges = d.hours[day] ?? [];
              const open = ranges.length > 0;
              return (
                <div key={day} className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-24 font-medium">{WEEKDAY_LONG[+day]}</span>
                    <button type="button" role="switch" aria-checked={open} aria-label={`${WEEKDAY_LONG[+day]} abierto`}
                      onClick={() => setDay(day, open ? [] : [{ open: '09:00', close: '22:00' }])}
                      className={clsx('chip h-7 px-2.5', open ? 'bg-ok/15 text-ok' : 'bg-surface-sunken text-ink-mute')}>
                      {open ? 'Abierto' : 'Cerrado'}
                    </button>
                    <button type="button" onClick={() => copyToAll(day)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand" title="Copiar este horario a todos los días">
                      <Copy className="h-3.5 w-3.5" />Copiar a todos
                    </button>
                  </div>
                  {open && (
                    <div className="mt-2 space-y-2 sm:pl-24">
                      {ranges.map((r, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="time" className="input h-10 w-full max-w-[8.5rem]" value={r.open} aria-label="Abre" onChange={(e) => setDay(day, ranges.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} />
                          <span className="text-ink-mute">a</span>
                          <input type="time" className="input h-10 w-full max-w-[8.5rem]" value={r.close} aria-label="Cierra" onChange={(e) => setDay(day, ranges.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} />
                          {ranges.length > 1 && (
                            <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken" aria-label="Quitar horario" onClick={() => setDay(day, ranges.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
                          )}
                        </div>
                      ))}
                      {ranges.length < 4 && (
                        <button type="button" onClick={() => setDay(day, [...ranges, { open: '17:00', close: '22:00' }])} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-mute hover:text-ink"><Plus className="h-3.5 w-3.5" />Agregar otro horario</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <h3 className="font-semibold">Días cerrados</h3>
            <p className="mb-2 text-xs text-ink-mute">Festivos o días de descanso: ese día no se reciben pedidos.</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {d.closedDates.length ? d.closedDates.slice().sort().map((dt) => (
                <span key={dt} className="chip bg-danger/10 text-danger">
                  {new Date(`${dt}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  <button aria-label={`Quitar ${dt}`} onClick={() => set('closedDates', d.closedDates.filter((x) => x !== dt))}><X className="h-3 w-3" /></button>
                </span>
              )) : <span className="text-sm text-ink-mute">Ninguno</span>}
            </div>
            <div className="flex gap-2">
              <input type="date" className="input h-10 max-w-[12rem]" value={newDate} onChange={(e) => setNewDate(e.target.value)} aria-label="Fecha cerrada" />
              <Button variant="outline" disabled={!newDate} onClick={() => { if (!d.closedDates.includes(newDate)) set('closedDates', [...d.closedDates, newDate]); setNewDate(''); }}>Agregar</Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
