import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Bluetooth, CheckCircle2, Globe, Laptop, Loader2, Monitor, RefreshCw, Smartphone, XCircle } from 'lucide-react';
import { buildTestTicket } from '@rh/printing';
import type { PrinterConfig } from '@rh/shared';
import { fmtDateTime } from '@/lib/format';
import {
  PlatformLabel, getDesktop, getLocalBluetoothAddress, getLocalWindowsPrinter, getPlatform, listBluetoothPrinters, printLocally,
  setLocalBluetoothAddress, setLocalWindowsPrinter, supportedConnections, togglePrintClientPrinter, usePrintClient, type BluetoothPrinter,
} from '@/platform';
import { Badge, Button, EmptyState, ErrorState, Modal, Select, Skeleton, Toggle, toast } from '@/ui';
import { CONNECTION_ICON, usePrinters, type Printer } from './api';

const PLATFORM_ICON = { web: Globe, desktop: Laptop, android: Smartphone, ios: Smartphone } as const;

export function DeviceTab() {
  const platform = getPlatform();
  const pc = usePrintClient();
  const printers = usePrinters();
  const supported = supportedConnections(platform);
  const PIcon = PLATFORM_ICON[platform];
  const [btFor, setBtFor] = useState<Printer | null>(null);
  const [winPrinters, setWinPrinters] = useState<{ name: string; displayName: string; isDefault: boolean }[] | null>(null);
  const desktop = getDesktop();
  const [, force] = useState(0);

  useEffect(() => {
    if (!desktop) return;
    desktop.listPrinters().then(setWinPrinters).catch(() => setWinPrinters([]));
  }, [desktop]);

  const list = (printers.data ?? []).filter((p) => p.connection === 'BROWSER' || p.connection === 'BLUETOOTH');

  const test = async (p: Printer) => {
    try {
      await printLocally(p as PrinterConfig, buildTestTicket({ printerName: p.name, connectionLabel: p.connectionLabel, paperWidth: p.paperWidth, createdAt: new Date().toISOString() }));
      toast.success('Prueba impresa');
    } catch (e) {
      toast.fromError(e);
    }
  };

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center gap-4 p-4">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><PIcon className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-mute">Estás usando</p>
          <p className="h-display text-xl font-bold">{PlatformLabel[platform]}</p>
          <p className="text-xs text-ink-mute">Puede imprimir: {supported.filter((c) => c !== 'KDS').map((c) => ({ BROWSER: 'navegador', BLUETOOTH: 'Bluetooth', NETWORK: 'red', USB_DEVICE: 'USB', WINDOWS_PRINTER: 'Windows', SERIAL: 'COM' } as Record<string, string>)[c]).join(', ')}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <span className="flex items-center gap-1.5 font-semibold">
            <span className={clsx('h-2.5 w-2.5 rounded-full', pc.connected ? 'bg-ok' : 'bg-danger')} />
            {pc.connected ? 'Conectado para imprimir' : pc.running ? 'Conectando…' : 'Cliente de impresión detenido'}
          </span>
          <span className="text-xs text-ink-mute">{pc.printed} impresos · {pc.failed} con error{pc.printing ? ' · imprimiendo…' : ''}</span>
        </div>
      </section>

      {pc.lastJob && (
        <p className={clsx('flex items-center gap-2 rounded-xl px-3 py-2 text-sm', pc.lastJob.status === 'PRINTED' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger')}>
          {pc.lastJob.status === 'PRINTED' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          Último: {pc.lastJob.title} en {pc.lastJob.printerName} · {fmtDateTime(pc.lastJob.at)}{pc.lastJob.error ? ` · ${pc.lastJob.error}` : ''}
        </p>
      )}
      {pc.lastError && pc.lastError !== pc.lastJob?.error && (
        <p className="flex items-center gap-2 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn"><AlertTriangle className="h-4 w-4" /> {pc.lastError}</p>
      )}

      <section>
        <h2 className="mb-1 font-semibold">Impresoras que puede atender este dispositivo</h2>
        <p className="mb-3 text-sm text-ink-mute">Activa las impresoras de tipo navegador o Bluetooth que están conectadas a <b>esta</b> computadora o tablet. Mantén esta pestaña o la app abierta para que imprima.</p>
        {printers.isLoading ? <Skeleton className="h-24" /> : printers.error ? <ErrorState error={printers.error} onRetry={() => printers.refetch()} /> : list.length === 0 ? (
          <div className="card"><EmptyState icon={<Globe className="h-7 w-7" />} title="No hay impresoras de navegador ni Bluetooth" description="Crea una en la pestaña Impresoras con la conexión “Navegador” o “Bluetooth”." /></div>
        ) : (
          <ul className="space-y-3">
            {list.map((p) => {
              const Icon = CONNECTION_ICON[p.connection];
              const can = supported.includes(p.connection);
              const mine = pc.isMine(p.id);
              const rejected = pc.rejected.includes(p.id);
              const bt = p.connection === 'BLUETOOTH' ? p.bluetoothAddress || getLocalBluetoothAddress(p.id) : null;
              return (
                <li key={p.id} className={clsx('card p-4', !can && 'opacity-70')}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-sunken text-ink-soft"><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-ink-mute">{p.connectionLabel} · {p.paperWidth} mm{p.areaName ? ` · ${p.areaName}` : ''} · {p.clientsOnline} dispositivo(s) en línea</p>
                      {!can && <p className="mt-1 text-xs font-medium text-warn">{p.connection === 'BLUETOOTH' ? 'Solo se puede activar desde la app Android.' : 'No disponible en este dispositivo.'}</p>}
                      {rejected && <p className="mt-1 text-xs font-medium text-danger">El servidor la rechazó (¿inactiva o eliminada?).</p>}
                    </div>
                    <Toggle checked={mine} disabled={!can} onChange={(v) => togglePrintClientPrinter(p.id, v)} label={<span className="hidden sm:inline">Este dispositivo imprime aquí</span>} />
                  </div>
                  {mine && (
                    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
                      {p.connection === 'BLUETOOTH' && (
                        <>
                          <span className="flex items-center gap-1.5 text-sm"><Bluetooth className="h-4 w-4 text-info" /> {bt ?? 'Sin impresora elegida'}</span>
                          {!p.bluetoothAddress && <Button size="sm" variant="outline" onClick={() => setBtFor(p)}>Buscar impresoras Bluetooth</Button>}
                        </>
                      )}
                      {p.connection === 'BROWSER' && desktop && (
                        <Select
                          className="min-w-[240px]"
                          label="Impresora de Windows"
                          value={getLocalWindowsPrinter(p.id) ?? ''}
                          onChange={(e) => { setLocalWindowsPrinter(p.id, e.target.value || null); force((x) => x + 1); }}
                          placeholder="Predeterminada de Windows"
                          options={(winPrinters ?? []).map((w) => ({ value: w.name, label: `${w.displayName || w.name}${w.isDefault ? ' (predeterminada)' : ''}` }))}
                        />
                      )}
                      {p.connection === 'BROWSER' && !desktop && <p className="text-xs text-ink-mute">En el navegador aparece el diálogo de impresión. Configura márgenes “ninguno” y papel de {p.paperWidth} mm.</p>}
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => test(p)}>Probar aquí</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {desktop && (
        <section className="card flex items-center gap-3 p-4">
          <Monitor className="h-5 w-5 text-ink-mute" />
          <p className="flex-1 text-sm">La app de escritorio también puede imprimir en red, USB y COM con un token de agente.</p>
          <Button size="sm" variant="outline" onClick={() => void desktop.openSettings()}>Abrir configuración de la app</Button>
        </section>
      )}

      <BluetoothPicker printer={btFor} onClose={() => setBtFor(null)} onPicked={() => force((x) => x + 1)} />
    </div>
  );
}

function BluetoothPicker({ printer, onClose, onPicked }: { printer: Printer | null; onClose: () => void; onPicked: () => void }) {
  const [list, setList] = useState<BluetoothPrinter[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scan = async () => {
    setBusy(true);
    setErr(null);
    try {
      setList(await listBluetoothPrinters());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (printer) void scan();
    else setList(null);
  }, [printer]);
  return (
    <Modal open={!!printer} onClose={onClose} title={`Bluetooth para ${printer?.name ?? ''}`} footer={<Button variant="outline" icon={<RefreshCw className="h-4 w-4" />} loading={busy} onClick={scan}>Buscar de nuevo</Button>}>
      <p className="mb-3 text-sm text-ink-mute">Primero enlaza la impresora en Ajustes → Bluetooth de Android (PIN 0000 o 1234).</p>
      {busy && !list ? <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</p> : err ? (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>
      ) : list && list.length === 0 ? <EmptyState title="No se encontraron impresoras" /> : (
        <ul className="space-y-2">
          {list?.map((d) => (
            <li key={d.address}>
              <button
                onClick={() => { if (printer) setLocalBluetoothAddress(printer.id, d.address); toast.success('Impresora elegida', d.name); onPicked(); onClose(); }}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-line px-3 text-left hover:border-brand"
              >
                <Bluetooth className="h-5 w-5 text-info" />
                <span className="flex-1"><span className="block font-semibold">{d.name || 'Sin nombre'}</span><span className="text-xs text-ink-mute">{d.address}</span></span>
                <Badge>{d.type === 'ble' ? 'BLE' : 'Clásico'}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
