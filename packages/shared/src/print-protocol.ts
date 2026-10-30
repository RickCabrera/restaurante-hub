// Protocolo de impresión entre la API y los clientes que imprimen.
//
// Clientes de impresión:
//   - Print agent (Node, PC/Raspberry)        auth: "Agent <token>"   conexiones: NETWORK, USB_DEVICE, WINDOWS_PRINTER, SERIAL
//   - App de escritorio (Electron, .exe)     auth: "Agent <token>"   igual que el agent (lo trae integrado)
//   - App Android (Capacitor)                auth: "Device <token>" o "Bearer <jwt>"  conexión: BLUETOOTH
//   - Navegador (cualquier sesión web)       auth: "Device <token>" o "Bearer <jwt>"  conexión: BROWSER
//
// Todos se conectan al namespace Socket.IO "/rt" de la API.
// La API envía cada trabajo a UN solo socket registrado para esa impresora (sala `printer:{id}`).
//
// Acks: toda respuesta de la API a un evento con callback llega envuelta como
//   { ok: true, data: <payload> }  ó  { ok: false, error: "mensaje" }
// (p.ej. AGENT_HELLO → { ok, data: AgentHelloAck }). DISCOVERED acepta { printers: DiscoveredPrinter[] }.

import type { PrinterConnection, PrinterDialect, PrintJobKind } from './enums';

export interface PrinterConfig {
  id: string;
  name: string;
  connection: PrinterConnection;
  dialect: PrinterDialect;
  host?: string | null;
  port?: number | null;
  devicePath?: string | null;
  windowsName?: string | null;
  baudRate?: number | null;
  bluetoothAddress?: string | null;
  paperWidth: 58 | 80;
  copies: number;
  cutPaper: boolean;
  openDrawer: boolean;
}

/** Impresora detectada localmente por un agente / app. */
export interface DiscoveredPrinter {
  name: string;
  type: 'windows' | 'usb' | 'serial' | 'network' | 'bluetooth';
  path?: string;
}

export const PrintEvents = {
  /** cliente → API (ack: AgentHelloAck). Lo envían agentes al conectarse. */
  AGENT_HELLO: 'agent.hello',
  /** cliente → API (ack: { jobs: PrintJobMessage[] }). Pide trabajos pendientes (al reconectar). */
  PULL: 'print.pull',
  /** API → cliente. Un trabajo a imprimir. */
  JOB: 'print.job',
  /** cliente → API. Resultado de un trabajo. */
  ACK: 'print.ack',
  /** API → agente. La configuración de impresoras cambió. */
  PRINTERS_CHANGED: 'printers.changed',
  /** navegador/app Android → API (ack: { printers: PrinterConfig[] }). Se registra como impresor de esas impresoras. */
  CLIENT_REGISTER: 'printclient.register',
  /** navegador/app Android → API. Deja de imprimir. */
  CLIENT_UNREGISTER: 'printclient.unregister',
  /** cliente → API. Reporta impresoras detectadas (Windows/USB/COM/Bluetooth). */
  DISCOVERED: 'printers.discovered',
} as const;

export interface AgentHello {
  version: string;
  hostname: string;
  platform: string; // win32 | linux | darwin | android
  kind: 'agent' | 'desktop' | 'android';
  discovered?: DiscoveredPrinter[];
}

export interface AgentHelloAck {
  agentId: string;
  businessId: string;
  printers: PrinterConfig[];
}

export interface PrintJobMessage {
  jobId: string;
  kind: PrintJobKind;
  printer: PrinterConfig;
  /** PrintDocument de @rh/printing */
  document: unknown;
  createdAt: string;
}

export interface PrintAck {
  jobId: string;
  status: 'PRINTED' | 'FAILED';
  error?: string;
}

export interface PrintClientRegister {
  printerIds: string[];
  kind: 'browser' | 'mobile';
}

export const printerRoom = (printerId: string) => `printer:${printerId}`;
