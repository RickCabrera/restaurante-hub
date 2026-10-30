// Cliente de impresión en el navegador / app Android.
// Este dispositivo se registra como "impresor" de ciertas impresoras BROWSER o BLUETOOTH
// (las elegidas en localStorage['rh.printClient.printerIds']) y recibe sus trabajos por Socket.IO.
//
//   startPrintClient()            → empieza a escuchar (llamar una vez al iniciar la app con sesión)
//   stopPrintClient()             → deja de imprimir (al cerrar sesión)
//   setPrintClientPrinters(ids)   → "este dispositivo imprime en X" (se guarda y se re-registra)
//   getPrintClientPrinters()
//   usePrintClient()              → estado para la UI
import { useSyncExternalStore } from 'react';
import type { Socket } from 'socket.io-client';
import { renderEscPos, type PrintDocument } from '@rh/printing';
import { PrintEvents, type PrintAck, type PrintJobMessage, type PrinterConfig, type PrintClientRegister } from '@rh/shared';
import { getSocket } from '@/lib/socket';
import { getPlatform, type Platform } from './platform';
import { printDocumentHtml } from './browser-print';
import { printBluetooth } from './bluetooth';

const IDS_KEY = 'rh.printClient.printerIds';
const btKey = (printerId: string) => `rh.bt.${printerId}`;
const winKey = (printerId: string) => `rh.win.${printerId}`;

export interface PrintClientState {
  platform: Platform;
  running: boolean;
  connected: boolean;
  /** IDs elegidos en este dispositivo. */
  printerIds: string[];
  /** Impresoras aceptadas por el servidor en el último registro. */
  printers: PrinterConfig[];
  /** IDs que el servidor rechazó (no existen, inactivas o de otro tipo). */
  rejected: string[];
  printing: boolean;
  printed: number;
  failed: number;
  lastJob?: { jobId: string; title: string; printerName: string; status: 'PRINTED' | 'FAILED'; error?: string; at: string };
  lastError?: string;
}

// ---------- almacenamiento ----------
function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string | null) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento */
  }
}

export function getPrintClientPrinters(): string[] {
  try {
    const v = JSON.parse(lsGet(IDS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : [];
  } catch {
    return [];
  }
}

/** Define qué impresoras (BROWSER/BLUETOOTH) imprime ESTE dispositivo y se re-registra. */
export function setPrintClientPrinters(ids: string[]): void {
  const prev = getPrintClientPrinters();
  const next = [...new Set(ids.filter(Boolean))];
  lsSet(IDS_KEY, JSON.stringify(next));
  set({ printerIds: next });
  if (!running || !boundSocket) return;
  const removed = prev.filter((id) => !next.includes(id));
  if (removed.length) boundSocket.emit(PrintEvents.CLIENT_UNREGISTER, { printerIds: removed });
  void register();
}

/** Agrega/quita una impresora de este dispositivo. */
export function togglePrintClientPrinter(id: string, on: boolean): void {
  const ids = getPrintClientPrinters().filter((x) => x !== id);
  setPrintClientPrinters(on ? [...ids, id] : ids);
}

/** Dirección Bluetooth elegida en ESTE dispositivo para una impresora (si el admin no fijó una). */
export function getLocalBluetoothAddress(printerId: string): string | null {
  return lsGet(btKey(printerId));
}
export function setLocalBluetoothAddress(printerId: string, address: string | null): void {
  lsSet(btKey(printerId), address ? address.toUpperCase() : null);
}
/** Solo escritorio: impresora de Windows a usar para una impresora BROWSER (vacío = predeterminada). */
export function getLocalWindowsPrinter(printerId: string): string | null {
  return lsGet(winKey(printerId));
}
export function setLocalWindowsPrinter(printerId: string, name: string | null): void {
  lsSet(winKey(printerId), name || null);
}

// ---------- estado observable ----------
let state: PrintClientState = {
  platform: typeof window !== 'undefined' ? getPlatform() : 'web',
  running: false,
  connected: false,
  printerIds: typeof window !== 'undefined' ? getPrintClientPrinters() : [],
  printers: [],
  rejected: [],
  printing: false,
  printed: 0,
  failed: 0,
};
const listeners = new Set<() => void>();
function set(patch: Partial<PrintClientState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function getPrintClientState(): PrintClientState {
  return state;
}
export function subscribePrintClient(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Estado del cliente de impresión para la UI (React). */
export function usePrintClient() {
  const s = useSyncExternalStore(subscribePrintClient, getPrintClientState, getPrintClientState);
  return {
    ...s,
    start: startPrintClient,
    stop: stopPrintClient,
    setPrinters: setPrintClientPrinters,
    toggle: togglePrintClientPrinter,
    isMine: (printerId: string) => s.printerIds.includes(printerId),
  };
}

// ---------- ciclo de vida ----------
let running = false;
let boundSocket: Socket | null = null;
let watchTimer: ReturnType<typeof setInterval> | null = null;
const recent = new Map<string, number>(); // jobId → ms (dedupe 10 min)
const inFlight = new Set<string>();
let chain: Promise<unknown> = Promise.resolve();

const kind = (): PrintClientRegister['kind'] => (getPlatform() === 'android' ? 'mobile' : 'browser');

function unwrap<T>(res: unknown): T {
  if (res && typeof res === 'object' && 'ok' in res) {
    const r = res as { ok: boolean; data?: T; error?: string };
    if (!r.ok) throw new Error(r.error || 'Error del servidor');
    return r.data as T;
  }
  return res as T;
}

async function register(): Promise<void> {
  const s = boundSocket;
  if (!s || !running) return;
  const printerIds = getPrintClientPrinters();
  set({ printerIds });
  if (!printerIds.length) {
    set({ printers: [], rejected: [] });
    return;
  }
  if (!s.connected) return; // se registra en 'connect'
  try {
    const payload: PrintClientRegister = { printerIds, kind: kind() };
    const res = unwrap<{ printers?: PrinterConfig[]; rejected?: string[] }>(await s.timeout(10_000).emitWithAck(PrintEvents.CLIENT_REGISTER, payload));
    set({ printers: res?.printers ?? [], rejected: res?.rejected ?? [], lastError: undefined });
    // pedir pendientes acumulados mientras estábamos desconectados
    const pull = unwrap<{ jobs?: PrintJobMessage[] }>(await s.timeout(15_000).emitWithAck(PrintEvents.PULL, {}));
    for (const j of pull?.jobs ?? []) onJob(j);
  } catch (e) {
    set({ lastError: `No se pudo registrar como impresora: ${(e as Error).message}` });
  }
}

const onConnect = () => {
  set({ connected: true });
  void register();
};
const onDisconnect = () => set({ connected: false });
const onJobEvent = (job: PrintJobMessage, cb?: (r: unknown) => void) => {
  if (typeof cb === 'function') cb({ received: true });
  onJob(job);
};

function bind() {
  let s: Socket;
  try {
    s = getSocket();
  } catch {
    return;
  }
  if (s === boundSocket) return;
  unbind();
  boundSocket = s;
  s.on('connect', onConnect);
  s.on('disconnect', onDisconnect);
  s.on(PrintEvents.JOB, onJobEvent);
  set({ connected: s.connected });
  if (s.connected) void register();
}

function unbind() {
  const s = boundSocket;
  boundSocket = null;
  if (!s) return;
  s.off('connect', onConnect);
  s.off('disconnect', onDisconnect);
  s.off(PrintEvents.JOB, onJobEvent);
}

/** Empieza a recibir e imprimir trabajos de las impresoras elegidas en este dispositivo. */
export function startPrintClient(): void {
  if (running) {
    bind();
    return;
  }
  running = true;
  set({ running: true, platform: getPlatform(), printerIds: getPrintClientPrinters() });
  bind();
  // el socket de la app se recrea al cambiar la sesión: re-enlazar si cambió
  watchTimer = setInterval(bind, 3_000);
}

/** Deja de imprimir en este dispositivo (no borra la selección guardada). */
export function stopPrintClient(): void {
  if (!running) return;
  running = false;
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = null;
  const ids = getPrintClientPrinters();
  if (boundSocket?.connected && ids.length) boundSocket.emit(PrintEvents.CLIENT_UNREGISTER, { printerIds: ids });
  unbind();
  set({ running: false, connected: false, printers: [] });
}

// ---------- trabajos ----------
function seen(jobId: string): boolean {
  const now = Date.now();
  for (const [k, t] of recent) if (now - t > 10 * 60_000) recent.delete(k);
  return recent.has(jobId);
}

function ack(payload: PrintAck) {
  (boundSocket ?? getSocket()).emit(PrintEvents.ACK, payload);
}

function onJob(job: PrintJobMessage) {
  if (!job?.jobId || !job.printer) return;
  if (seen(job.jobId)) {
    ack({ jobId: job.jobId, status: 'PRINTED' }); // reenvío de algo ya impreso
    return;
  }
  if (inFlight.has(job.jobId)) return;
  inFlight.add(job.jobId);
  // en serie: un diálogo de impresión / conexión Bluetooth a la vez
  chain = chain.catch(() => undefined).then(() => processJob(job)).finally(() => inFlight.delete(job.jobId));
}

async function printJob(job: PrintJobMessage): Promise<void> {
  const p = job.printer;
  const doc = job.document as PrintDocument;
  if (!doc || !Array.isArray(doc.blocks)) throw new Error('Documento de impresión inválido');
  const document: PrintDocument = { ...doc, paperWidth: p.paperWidth ?? doc.paperWidth };
  switch (p.connection) {
    case 'BROWSER': {
      // en navegador cajón/corte los maneja el driver; aquí solo se imprime el HTML
      await printDocumentHtml(document, { copies: p.copies || 1, deviceName: getLocalWindowsPrinter(p.id) ?? undefined });
      return;
    }
    case 'BLUETOOTH': {
      if (getPlatform() !== 'android') throw new Error('Las impresoras Bluetooth solo imprimen desde la app Android');
      const bytes = renderEscPos(document, { dialect: p.dialect, copies: p.copies || 1, cut: p.cutPaper, openDrawer: p.openDrawer });
      const address = p.bluetoothAddress || getLocalBluetoothAddress(p.id);
      if (!address) throw new Error(`Elige la impresora Bluetooth para "${p.name}" en este dispositivo`);
      await printBluetooth(address, bytes);
      return;
    }
    default:
      throw new Error(`Este dispositivo no puede imprimir conexiones ${p.connection}`);
  }
}

async function processJob(job: PrintJobMessage): Promise<void> {
  set({ printing: true });
  const title = (job.document as PrintDocument | undefined)?.title ?? job.kind;
  try {
    await withTimeout(printJob(job), job.printer.connection === 'BROWSER' ? 120_000 : 45_000);
    recent.set(job.jobId, Date.now());
    ack({ jobId: job.jobId, status: 'PRINTED' });
    set({
      printed: state.printed + 1,
      lastJob: { jobId: job.jobId, title, printerName: job.printer.name, status: 'PRINTED', at: new Date().toISOString() },
    });
  } catch (e) {
    const error = ((e as Error)?.message || String(e)).slice(0, 480);
    ack({ jobId: job.jobId, status: 'FAILED', error });
    set({
      failed: state.failed + 1,
      lastError: error,
      lastJob: { jobId: job.jobId, title, printerName: job.printer.name, status: 'FAILED', error, at: new Date().toISOString() },
    });
  } finally {
    set({ printing: inFlight.size > 1 });
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Tiempo agotado (${Math.round(ms / 1000)} s)`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Imprime localmente un documento en una impresora de este dispositivo (p. ej. "Imprimir prueba"). */
export async function printLocally(printer: PrinterConfig, doc: PrintDocument): Promise<void> {
  await printJob({ jobId: `local-${Date.now()}`, kind: 'TEST', printer, document: doc, createdAt: new Date().toISOString() });
}
