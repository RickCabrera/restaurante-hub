import { useQuery } from '@tanstack/react-query';
import type { PrinterConnection, PrinterDialect } from '@rh/shared';
import { Bluetooth, Cable, Globe, Monitor, Network, Usb, type LucideIcon, MonitorSmartphone } from 'lucide-react';
import { api } from '@/lib/api';

export interface Discovered { name: string; type: string; path?: string }

export interface Agent {
  id: string;
  name: string;
  kind: 'agent' | 'desktop' | 'android';
  online: boolean;
  lastSeenAt: string | null;
  version: string | null;
  hostname: string | null;
  platform: string | null;
  discovered: Discovered[];
  revokedAt: string | null;
  createdAt: string;
  printers: { id: string; name: string; connection: PrinterConnection; active: boolean }[];
}

export interface AgentCredentials {
  agent: Agent;
  apiUrl: string;
  token: string;
  configString: string;
  pairingString: string;
}

export interface Printer {
  id: string;
  name: string;
  areaId: string | null;
  agentId: string | null;
  connection: PrinterConnection;
  dialect: PrinterDialect;
  host: string | null;
  port: number | null;
  devicePath: string | null;
  windowsName: string | null;
  baudRate: number | null;
  bluetoothAddress: string | null;
  paperWidth: 58 | 80;
  copies: number;
  cutPaper: boolean;
  openDrawer: boolean;
  printsCustomerTicket: boolean;
  active: boolean;
  lastError: string | null;
  createdAt: string;
  connectionLabel: string;
  areaName: string | null;
  agentName: string | null;
  agentOnline: boolean | null;
  clientsOnline: number;
}

export interface ConnectionInfo {
  value: PrinterConnection;
  label: string;
  handler: 'AGENT' | 'MOBILE' | 'BROWSER' | 'SCREEN';
  requiresAgent: boolean;
  platforms: string[];
  available?: boolean;
}

export type JobStatus = 'PENDING' | 'SENT' | 'PRINTED' | 'FAILED' | 'CANCELLED';
export interface PrintJob {
  id: string;
  printerId: string;
  printerName: string | null;
  agentId: string | null;
  kind: string;
  title: string;
  status: JobStatus;
  attempts: number;
  error: string | null;
  orderId: string | null;
  ticketId: string | null;
  createdAt: string;
  sentAt: string | null;
  printedAt: string | null;
}

export interface Area { id: string; name: string; color: string; isProduction?: boolean }

export const CONNECTION_ICON: Record<PrinterConnection, LucideIcon> = {
  NETWORK: Network,
  USB_DEVICE: Usb,
  WINDOWS_PRINTER: Monitor,
  SERIAL: Cable,
  BLUETOOTH: Bluetooth,
  BROWSER: Globe,
  KDS: MonitorSmartphone,
};

/** Explicación en español sencillo de cuándo usar cada conexión. */
export const CONNECTION_HELP: Record<PrinterConnection, string> = {
  NETWORK: 'La impresora tiene cable de red o Wi-Fi y una IP fija (la más común en cocinas). Necesita la app de escritorio o un agente encendido en la misma red.',
  USB_DEVICE: 'Impresora conectada por USB a una Raspberry Pi o computadora con Linux que tiene el agente instalado.',
  WINDOWS_PRINTER: 'Impresora ya instalada en una PC con Windows (USB o compartida). La PC debe tener la app de escritorio o el agente abierto.',
  SERIAL: 'Impresoras viejas con puerto COM / serial conectadas a una PC con el agente.',
  BLUETOOTH: 'Impresora portátil Bluetooth enlazada a una tablet o celular Android con la app de Restaurante Hub.',
  BROWSER: 'Sin instalar nada: imprime desde el navegador (o la app de escritorio) de la computadora que la active en “Este dispositivo”.',
  KDS: 'No imprime papel: las comandas se muestran en una pantalla de cocina para esa área.',
};

export const KIND_LABEL: Record<Agent['kind'], string> = {
  agent: 'Agente (PC o Raspberry)',
  desktop: 'App de escritorio Windows',
  android: 'App Android',
};

export const JOB_KIND_LABEL: Record<string, string> = {
  KITCHEN: 'Comanda', CUSTOMER: 'Ticket cliente', BILL: 'Cuenta', PAYMENT: 'Pago', CASH_CUT: 'Corte de caja', TEST: 'Prueba', SHOPPING_LIST: 'Lista de compras',
};
export const JOB_STATUS: Record<JobStatus, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' }> = {
  PENDING: { label: 'Pendiente', tone: 'warn' },
  SENT: { label: 'Enviado', tone: 'info' },
  PRINTED: { label: 'Impreso', tone: 'ok' },
  FAILED: { label: 'Falló', tone: 'danger' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
};

export const usePrinters = () => useQuery({ queryKey: ['printing', 'printers'], queryFn: () => api.get<Printer[]>('/printing/printers'), refetchInterval: 30_000 });
export const useAgents = (enabled = true) => useQuery({ queryKey: ['printing', 'agents'], queryFn: () => api.get<Agent[]>('/printing/agents'), enabled });
export const useAreas = () => useQuery({ queryKey: ['areas'], queryFn: () => api.get<Area[]>('/areas'), staleTime: 60_000 });
export const useConnections = (platform?: string) =>
  useQuery({ queryKey: ['printing', 'connections', platform], queryFn: () => api.get<ConnectionInfo[]>('/printing/connections', { platform }), staleTime: Infinity });

/** Estado legible de una impresora. */
export function printerStatus(p: Printer): { tone: 'ok' | 'warn' | 'danger' | 'neutral'; label: string } {
  if (!p.active) return { tone: 'neutral', label: 'Desactivada' };
  if (p.lastError) return { tone: 'danger', label: 'Con error' };
  if (p.connection === 'KDS') return p.clientsOnline ? { tone: 'ok', label: `${p.clientsOnline} pantalla(s) conectada(s)` } : { tone: 'warn', label: 'Ninguna pantalla conectada' };
  if (p.connection === 'BROWSER' || p.connection === 'BLUETOOTH')
    return p.clientsOnline ? { tone: 'ok', label: `Lista · ${p.clientsOnline} dispositivo(s)` } : { tone: 'warn', label: 'Ningún dispositivo la atiende' };
  if (!p.agentId) return { tone: 'warn', label: 'Sin agente asignado' };
  return p.agentOnline ? { tone: 'ok', label: `Lista · ${p.agentName}` } : { tone: 'danger', label: `Agente “${p.agentName}” desconectado` };
}
