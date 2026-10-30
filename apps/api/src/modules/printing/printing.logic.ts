// Lógica pura de impresión (sin BD): validación de conexiones, configuración para clientes
// y enrutamiento de renglones a impresoras por área de producción.
import {
  PrinterConnection, PrinterConnectionHandler, PrinterConnectionLabel, PrinterConfig, PrinterDto,
} from '@rh/shared';

export type PrinterRow = {
  id: string;
  name: string;
  areaId: string | null;
  agentId: string | null;
  connection: PrinterConnection;
  dialect: 'ESC_POS' | 'STAR';
  host: string | null;
  port: number | null;
  devicePath: string | null;
  windowsName: string | null;
  baudRate: number | null;
  bluetoothAddress: string | null;
  paperWidth: number;
  copies: number;
  cutPaper: boolean;
  openDrawer: boolean;
  printsCustomerTicket: boolean;
  active: boolean;
};

/** Tipo de cliente de impresión (agentes): qué conexiones atiende cada uno. */
export type AgentKind = 'agent' | 'desktop' | 'android';

export function agentHandles(kind: string, c: PrinterConnection): boolean {
  const h = PrinterConnectionHandler[c];
  if (kind === 'android') return h === 'MOBILE';
  return h === 'AGENT';
}

export const isAgentConnection = (c: PrinterConnection) => PrinterConnectionHandler[c] === 'AGENT';

/** Conexiones y en qué plataforma pueden imprimirse (APP-03). */
export type ClientPlatform = 'web' | 'desktop' | 'android';
const HANDLER_PLATFORMS: Record<'AGENT' | 'MOBILE' | 'BROWSER' | 'SCREEN', ClientPlatform[]> = {
  AGENT: ['desktop'], // + print agent (PC/Raspberry) en cualquier plataforma
  MOBILE: ['android'],
  BROWSER: ['web', 'desktop', 'android'],
  SCREEN: ['web', 'desktop', 'android'],
};

export function listConnections(platform?: ClientPlatform) {
  return (Object.keys(PrinterConnectionLabel) as PrinterConnection[]).map((value) => {
    const handler = PrinterConnectionHandler[value];
    const platforms = HANDLER_PLATFORMS[handler];
    return {
      value,
      label: PrinterConnectionLabel[value],
      handler,
      /** requiere un print agent / app de escritorio emparejado (token de agente) */
      requiresAgent: handler === 'AGENT',
      /** plataformas donde este cliente puede imprimir por sí mismo */
      platforms,
      ...(platform ? { available: platforms.includes(platform) } : {}),
    };
  });
}

/**
 * Valida los campos obligatorios por tipo de conexión y limpia los que no aplican.
 * Devuelve el objeto normalizado o un mensaje de error en español.
 */
export function normalizePrinterConnection(dto: PrinterDto): { ok: true; value: PrinterDto } | { ok: false; error: string } {
  const v: PrinterDto = {
    ...dto,
    host: null, port: null, devicePath: null, windowsName: null, baudRate: null, bluetoothAddress: null,
  };
  const s = (x: string | null | undefined) => (x ?? '').trim();
  switch (dto.connection) {
    case 'NETWORK':
      if (!s(dto.host)) return { ok: false, error: 'Captura la IP o nombre de la impresora de red' };
      v.host = s(dto.host);
      v.port = dto.port ?? 9100;
      break;
    case 'USB_DEVICE':
      if (!s(dto.devicePath)) return { ok: false, error: 'Captura la ruta del dispositivo USB (p. ej. /dev/usb/lp0)' };
      v.devicePath = s(dto.devicePath);
      break;
    case 'WINDOWS_PRINTER':
      if (!s(dto.windowsName)) return { ok: false, error: 'Captura el nombre de la impresora instalada en Windows' };
      v.windowsName = s(dto.windowsName);
      break;
    case 'SERIAL':
      if (!s(dto.devicePath)) return { ok: false, error: 'Captura el puerto serial (p. ej. COM3 o /dev/ttyUSB0)' };
      v.devicePath = s(dto.devicePath);
      v.baudRate = dto.baudRate ?? 9600;
      break;
    case 'BLUETOOTH':
      v.bluetoothAddress = s(dto.bluetoothAddress) || null; // se elige en el teléfono
      break;
    case 'BROWSER':
      break;
    case 'KDS':
      v.openDrawer = false;
      v.printsCustomerTicket = false;
      break;
  }
  if (!isAgentConnection(dto.connection) && dto.connection !== 'BLUETOOTH') v.agentId = null;
  return { ok: true, value: v };
}

export function toPrinterConfig(p: PrinterRow): PrinterConfig {
  return {
    id: p.id,
    name: p.name,
    connection: p.connection,
    dialect: p.dialect,
    host: p.host,
    port: p.port,
    devicePath: p.devicePath,
    windowsName: p.windowsName,
    baudRate: p.baudRate,
    bluetoothAddress: p.bluetoothAddress,
    paperWidth: p.paperWidth === 58 ? 58 : 80,
    copies: p.copies,
    cutPaper: p.cutPaper,
    openDrawer: p.openDrawer,
  };
}

export const paper = (p: { paperWidth: number }): 58 | 80 => (p.paperWidth === 58 ? 58 : 80);

/** Impresoras que generan papel (no KDS) y activas. */
export const printablePrinters = <T extends Pick<PrinterRow, 'active' | 'connection'>>(ps: T[]) =>
  ps.filter((p) => p.active && p.connection !== 'KDS');

export interface RoutedGroup<I> {
  printer: PrinterRow;
  /** área de producción del grupo (null = productos sin área) */
  areaId: string | null;
  items: I[];
}

/**
 * Enruta renglones a impresoras de cocina:
 *  - cada renglón va a TODAS las impresoras activas (no KDS) de su área de producción;
 *  - renglones sin área (o cuya área no existe) van a las impresoras con printsCustomerTicket, o a la primera activa.
 * Áreas cuyas únicas "impresoras" son KDS no generan trabajos (se ven en pantalla).
 */
export function routeKitchenItems<I extends { productionAreaId: string | null }>(
  items: I[],
  printers: PrinterRow[],
): RoutedGroup<I>[] {
  const active = printablePrinters(printers);
  const byArea = new Map<string | null, I[]>();
  for (const it of items) {
    const k = it.productionAreaId ?? null;
    byArea.set(k, [...(byArea.get(k) ?? []), it]);
  }
  const out: RoutedGroup<I>[] = [];
  const fallback = () => {
    const cust = active.filter((p) => p.printsCustomerTicket);
    return cust.length ? cust : active.slice(0, 1);
  };
  const noArea: I[] = byArea.get(null) ?? [];
  for (const [areaId, its] of byArea) {
    if (areaId === null) continue;
    const ps = active.filter((p) => p.areaId === areaId);
    if (ps.length) {
      for (const p of ps) out.push({ printer: p, areaId, items: its });
    } else if (!printers.some((p) => p.active && p.areaId === areaId)) {
      // el área no tiene impresoras ni pantallas: no perder la comanda
      noArea.push(...its);
    }
  }
  if (noArea.length) for (const p of fallback()) out.push({ printer: p, areaId: null, items: noArea });
  return out;
}

/** Impresoras para tickets de cliente / cuentas: las marcadas printsCustomerTicket o, si no hay, la primera activa. */
export function billPrinters(printers: PrinterRow[], strict = false): PrinterRow[] {
  const active = printablePrinters(printers);
  const cust = active.filter((p) => p.printsCustomerTicket);
  if (cust.length || strict) return cust;
  return active.slice(0, 1);
}

export const MAX_PRINT_ATTEMPTS = 3;
/** Backoff para reintentos tras FAILED: 5 s, 20 s, 60 s */
export function retryDelayMs(attempts: number): number {
  return [5_000, 20_000, 60_000][Math.min(Math.max(attempts - 1, 0), 2)];
}
