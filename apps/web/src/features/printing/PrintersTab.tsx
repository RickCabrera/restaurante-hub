import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, Eye, Pencil, Plus, Printer as PrinterIcon, Send, Trash2 } from 'lucide-react';
import type { PrinterConnection } from '@rh/shared';
import { buildKitchenTicket } from '@rh/printing';
import { api, ApiError } from '@/lib/api';
import { previewDocumentHtml } from '@/platform';
import { Badge, Button, EmptyState, ErrorState, Input, Modal, Select, Skeleton, Toggle, confirm, toast } from '@/ui';
import { CONNECTION_HELP, CONNECTION_ICON, printerStatus, useAgents, useAreas, useConnections, usePrinters, type Agent, type Printer } from './api';

export function PrintersTab() {
  const q = usePrinters();
  const [edit, setEdit] = useState<Printer | 'new' | null>(null);
  if (q.isLoading) return <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const list = q.data ?? [];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-mute">Cada área de producción (cocina, barra) puede tener su impresora. Las cuentas y cortes salen en la que imprime ticket de cliente.</p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Nueva impresora</Button>
      </div>
      {list.length === 0 ? (
        <div className="card"><EmptyState icon={<PrinterIcon className="h-7 w-7" />} title="Aún no tienes impresoras" description="Agrega la impresora de cocina, la de barra y la de caja." action={<Button onClick={() => setEdit('new')}>Agregar impresora</Button>} /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => <PrinterCard key={p.id} p={p} onEdit={() => setEdit(p)} />)}
        </div>
      )}
      {edit && <PrinterForm value={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function samplePreview(p: { name: string; paperWidth: 58 | 80; areaName?: string | null }) {
  previewDocumentHtml(
    buildKitchenTicket(
      {
        folio: 'M5-0012',
        areaName: p.areaName ?? 'Cocina',
        createdAt: new Date().toISOString(),
        serviceLabel: 'MESA 5',
        waiterName: 'Sofía',
        lines: [
          { quantity: 2, name: 'Hamburguesa clásica', modifiers: [{ name: 'Término medio' }, { name: 'Extra queso' }], note: 'Sin cebolla' },
          { quantity: 1, name: 'Alitas (10 pzas)', modifiers: [{ name: 'Buffalo' }, { name: 'BBQ' }] },
          { quantity: 3, name: 'Limonada natural', modifiers: [{ name: 'Grande' }] },
        ],
        notes: 'Vista previa de ejemplo',
      },
      p.paperWidth,
    ),
  );
}

function PrinterCard({ p, onEdit }: { p: Printer; onEdit: () => void }) {
  const Icon = CONNECTION_ICON[p.connection];
  const st = printerStatus(p);
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    try {
      await api.post(`/printing/printers/${p.id}/test`);
      toast.success('Prueba enviada', 'Revisa la impresora y la cola de impresión.');
    } catch (e) {
      toast.fromError(e);
    } finally {
      setTesting(false);
    }
  };
  const detail = p.connection === 'NETWORK' ? `${p.host}:${p.port ?? 9100}` : p.connection === 'WINDOWS_PRINTER' ? p.windowsName : p.connection === 'USB_DEVICE' || p.connection === 'SERIAL' ? p.devicePath : null;
  return (
    <article className={clsx('card flex flex-col p-4', !p.active && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{p.name}</h3>
          <p className="truncate text-xs text-ink-mute">{p.connectionLabel}{detail ? ` · ${detail}` : ''}</p>
        </div>
        <button onClick={onEdit} aria-label={`Editar ${p.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken"><Pencil className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone={st.tone === 'neutral' ? 'neutral' : st.tone}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', st.tone === 'ok' ? 'bg-ok' : st.tone === 'warn' ? 'bg-warn' : st.tone === 'danger' ? 'bg-danger' : 'bg-ink-mute')} />
          {st.label}
        </Badge>
        {p.areaName && <Badge>{p.areaName}</Badge>}
        {p.connection !== 'KDS' && <Badge>{p.paperWidth} mm</Badge>}
        {p.printsCustomerTicket && <Badge tone="info">Cuentas y tickets</Badge>}
        {p.openDrawer && <Badge>Cajón</Badge>}
      </div>
      {p.lastError && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-danger/10 px-2 py-1.5 text-xs text-danger"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {p.lastError}</p>}
      {p.connection !== 'KDS' && (
        <div className="mt-auto flex flex-wrap gap-2 pt-3">
          <Button size="sm" variant="outline" className="whitespace-nowrap" icon={<Send className="h-4 w-4" />} loading={testing} disabled={!p.active} onClick={test}>Imprimir prueba</Button>
          <Button size="sm" variant="ghost" className="whitespace-nowrap" icon={<Eye className="h-4 w-4" />} onClick={() => samplePreview(p)}>Vista previa</Button>
        </div>
      )}
    </article>
  );
}

type Form = {
  name: string; connection: PrinterConnection; areaId: string; dialect: 'ESC_POS' | 'STAR'; host: string; port: string; devicePath: string; windowsName: string;
  baudRate: string; bluetoothAddress: string; paperWidth: 58 | 80; copies: number; cutPaper: boolean; openDrawer: boolean; printsCustomerTicket: boolean; agentId: string; active: boolean;
};

const fromPrinter = (p: Printer | null): Form => ({
  name: p?.name ?? '', connection: p?.connection ?? 'NETWORK', areaId: p?.areaId ?? '', dialect: p?.dialect ?? 'ESC_POS', host: p?.host ?? '', port: String(p?.port ?? 9100),
  devicePath: p?.devicePath ?? '', windowsName: p?.windowsName ?? '', baudRate: String(p?.baudRate ?? 9600), bluetoothAddress: p?.bluetoothAddress ?? '',
  paperWidth: p?.paperWidth ?? 80, copies: p?.copies ?? 1, cutPaper: p?.cutPaper ?? true, openDrawer: p?.openDrawer ?? false,
  printsCustomerTicket: p?.printsCustomerTicket ?? false, agentId: p?.agentId ?? '', active: p?.active ?? true,
});

function PrinterForm({ value, onClose }: { value: Printer | 'new'; onClose: () => void }) {
  const editing = value !== 'new' ? value : null;
  const [f, setF] = useState<Form>(() => fromPrinter(editing));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const conns = useConnections();
  const areas = useAreas();
  const agents = useAgents();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const agentConn = ['NETWORK', 'USB_DEVICE', 'WINDOWS_PRINTER', 'SERIAL'].includes(f.connection);
  const agentList = (agents.data ?? []).filter((a) => a.kind !== 'android');
  const agent: Agent | undefined = agentList.find((a) => a.id === f.agentId) ?? (agentList.length === 1 ? agentList[0] : undefined);

  useEffect(() => {
    if (agentConn && !f.agentId && agentList.length === 1) set('agentId', agentList[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentConn, agentList.length]);

  const disc = useMemo(() => {
    const d = agent?.discovered ?? [];
    return {
      windows: d.filter((x) => x.type === 'windows'),
      usb: d.filter((x) => x.type === 'usb' && x.path && !x.path.startsWith('cups:')),
      serial: d.filter((x) => x.type === 'serial'),
    };
  }, [agent]);

  const save = async () => {
    setErrors({});
    const body = {
      name: f.name.trim(), connection: f.connection, areaId: f.areaId || null, dialect: f.dialect,
      host: f.host.trim() || null, port: f.port ? Number(f.port) : null, devicePath: f.devicePath.trim() || null, windowsName: f.windowsName.trim() || null,
      baudRate: f.baudRate ? Number(f.baudRate) : null, bluetoothAddress: f.bluetoothAddress.trim() || null, paperWidth: f.paperWidth, copies: f.copies,
      cutPaper: f.cutPaper, openDrawer: f.openDrawer, printsCustomerTicket: f.printsCustomerTicket, agentId: agentConn ? f.agentId || null : null, active: f.active,
    };
    if (!body.name) return setErrors({ name: 'Ponle un nombre' });
    setBusy(true);
    try {
      if (editing) await api.put(`/printing/printers/${editing.id}`, body);
      else await api.post('/printing/printers', body);
      toast.success('Impresora guardada');
      void qc.invalidateQueries({ queryKey: ['printing'] });
      onClose();
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!editing) return;
    if (!(await confirm({ title: `¿Eliminar “${editing.name}”?`, description: 'Se borran también sus trabajos en cola.', danger: true, confirmText: 'Eliminar' }))) return;
    try {
      await api.del(`/printing/printers/${editing.id}`);
      toast.success('Impresora eliminada');
      void qc.invalidateQueries({ queryKey: ['printing'] });
      onClose();
    } catch (e) {
      toast.fromError(e);
    }
  };

  const connections = conns.data ?? [];
  const isScreen = f.connection === 'KDS';
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={editing ? `Editar ${editing.name}` : 'Nueva impresora'}
      footer={
        <>
          {editing && <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Eliminar</Button>}
          {!isScreen && <Button variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => samplePreview({ name: f.name, paperWidth: f.paperWidth, areaName: areas.data?.find((a) => a.id === f.areaId)?.name })}>Vista previa</Button>}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} onClick={save}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-6">
        <Input label="Nombre" placeholder="Ej. Cocina, Barra, Caja" maxLength={60} value={f.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />

        <section>
          <h3 className="label">¿Cómo se conecta?</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {connections.map((c) => {
              const Icon = CONNECTION_ICON[c.value];
              const on = f.connection === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set('connection', c.value)}
                  className={clsx('flex gap-3 rounded-2xl border-2 p-3 text-left transition', on ? 'border-brand bg-brand/10' : 'border-line hover:border-ink-mute/40')}
                >
                  <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', on ? 'bg-brand text-white' : 'bg-surface-sunken text-ink-soft')}><Icon className="h-5 w-5" /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">{c.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-ink-mute">{CONNECTION_HELP[c.value]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 rounded-2xl bg-surface-sunken/60 p-4 sm:grid-cols-2">
          {f.connection === 'NETWORK' && (
            <>
              <Input label="IP de la impresora" placeholder="192.168.1.50" value={f.host} error={errors.host} onChange={(e) => set('host', e.target.value)} hint="Mantén FEED al encenderla para imprimir su IP." />
              <Input label="Puerto" inputMode="numeric" value={f.port} onChange={(e) => set('port', e.target.value.replace(/\D/g, ''))} hint="Casi siempre 9100." />
            </>
          )}
          {f.connection === 'USB_DEVICE' && (
            <Field2 label="Ruta del dispositivo" value={f.devicePath} onChange={(v) => set('devicePath', v)} placeholder="/dev/usb/lp0" suggestions={disc.usb.map((d) => ({ value: d.path!, label: `${d.name} (${d.path})` }))} hint="Usa “rh-print-agent discover” en la Raspberry para verla." />
          )}
          {f.connection === 'WINDOWS_PRINTER' && (
            <Field2 label="Nombre exacto en Windows" value={f.windowsName} onChange={(v) => set('windowsName', v)} placeholder="EPSON TM-T20II Receipt" suggestions={disc.windows.map((d) => ({ value: d.name, label: d.name }))} hint={disc.windows.length ? 'Elige una detectada por el agente o escríbela.' : 'Cópialo de Configuración → Impresoras y escáneres. Compartida: \\\\PC\\Nombre'} />
          )}
          {f.connection === 'SERIAL' && (
            <>
              <Field2 label="Puerto" value={f.devicePath} onChange={(v) => set('devicePath', v)} placeholder="COM3 o /dev/ttyUSB0" suggestions={disc.serial.map((d) => ({ value: d.path ?? d.name, label: `${d.name}${d.path ? ` (${d.path})` : ''}` }))} />
              <Select label="Velocidad (baudios)" value={f.baudRate} onChange={(e) => set('baudRate', e.target.value)} options={['9600', '19200', '38400', '57600', '115200'].map((v) => ({ value: v, label: v }))} />
            </>
          )}
          {f.connection === 'BLUETOOTH' && (
            <div className="sm:col-span-2">
              <Input label="Dirección Bluetooth (opcional)" placeholder="00:11:22:33:44:55" value={f.bluetoothAddress} onChange={(e) => set('bluetoothAddress', e.target.value)} />
              <p className="mt-1 text-xs text-ink-mute">Normalmente se deja vacío: en la tablet Android ve a Impresoras → Este dispositivo, activa esta impresora y elige la Bluetooth enlazada.</p>
            </div>
          )}
          {f.connection === 'BROWSER' && (
            <p className="text-sm text-ink-soft sm:col-span-2">Después de guardar, abre <b>Impresoras → Este dispositivo</b> en la computadora o tablet que tiene la impresora y activa “Este dispositivo imprime aquí”. En navegador aparece el diálogo de impresión; en la app de escritorio imprime directo.</p>
          )}
          {isScreen && <p className="text-sm text-ink-soft sm:col-span-2">Empareja una tablet como “Pantalla de cocina” para el área elegida (Equipo y tablets). Las comandas aparecen en ella en vez de imprimirse.</p>}

          {agentConn && (
            <div className="sm:col-span-2">
              {agentList.length === 0 ? (
                <p className="flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Esta conexión necesita un agente o la app de escritorio. Créalo en la pestaña “Agentes”.</p>
              ) : (
                <Select
                  label="¿Qué computadora la atiende?"
                  value={f.agentId}
                  onChange={(e) => set('agentId', e.target.value)}
                  placeholder={agentList.length > 1 ? 'Elige un agente' : undefined}
                  options={agentList.map((a) => ({ value: a.id, label: `${a.name}${a.online ? ' · en línea' : ' · desconectado'}` }))}
                  error={errors.agentId}
                />
              )}
            </div>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Select label={isScreen ? 'Área de la pantalla' : 'Área de producción'} value={f.areaId} onChange={(e) => set('areaId', e.target.value)} placeholder={isScreen ? 'Elige un área' : 'Ninguna (solo cuentas / tickets)'} options={(areas.data ?? []).map((a) => ({ value: a.id, label: a.name }))} hint={isScreen ? undefined : 'Las comandas de los productos de esta área salen aquí.'} />
          {!isScreen && (
            <>
              <div>
                <span className="label">Papel</span>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1">
                  {([80, 58] as const).map((w) => (
                    <button key={w} type="button" onClick={() => set('paperWidth', w)} className={clsx('h-9 rounded-lg text-sm font-semibold', f.paperWidth === w ? 'bg-surface-raised shadow-sm' : 'text-ink-mute')}>{w} mm</button>
                  ))}
                </div>
              </div>
              <Select label="Marca / dialecto" value={f.dialect} onChange={(e) => set('dialect', e.target.value as Form['dialect'])} options={[{ value: 'ESC_POS', label: 'ESC/POS (Epson, Xprinter, 3nStar y genéricas)' }, { value: 'STAR', label: 'STAR (Star TSP, SP700)' }]} />
              <Select label="Copias" value={String(f.copies)} onChange={(e) => set('copies', Number(e.target.value))} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />
            </>
          )}
        </section>

        {!isScreen && (
          <section className="grid gap-4 sm:grid-cols-2">
            <Toggle checked={f.cutPaper} onChange={(v) => set('cutPaper', v)} label="Corte automático" description="Desactívalo si tu impresora no tiene cortador." />
            <Toggle checked={f.openDrawer} onChange={(v) => set('openDrawer', v)} label="Abrir cajón de dinero" description="Al cobrar en efectivo (cajón conectado a la impresora)." />
            <Toggle checked={f.printsCustomerTicket} onChange={(v) => set('printsCustomerTicket', v)} label="Imprime cuentas y tickets" description="Cuentas, pagos, cortes y tickets de cliente." />
            <Toggle checked={f.active} onChange={(v) => set('active', v)} label="Activa" />
          </section>
        )}
      </div>
    </Modal>
  );
}

function Field2({ label, value, onChange, placeholder, suggestions, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; suggestions: { value: string; label: string }[]; hint?: string }) {
  return (
    <div className="sm:col-span-2">
      <Input label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} hint={hint} />
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="text-xs text-ink-mute">Detectadas:</span>
          {suggestions.map((s) => (
            <button key={s.value} type="button" onClick={() => onChange(s.value)} className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', value === s.value ? 'bg-brand text-white' : 'bg-surface-raised text-ink-soft ring-1 ring-line')}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
