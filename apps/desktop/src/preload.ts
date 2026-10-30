// Preload de la ventana principal: expone window.rhDesktop a la app web (con contextIsolation).
import { contextBridge, ipcRenderer } from 'electron';

export interface RhDesktopPrintOptions {
  /** true (default) imprime sin mostrar el diálogo. */
  silent?: boolean;
  /** Nombre de la impresora de Windows; vacío = predeterminada. */
  deviceName?: string;
  /** 58 | 80 mm (default 80). */
  paperWidth?: 58 | 80;
  copies?: number;
}

const version = (() => {
  try {
    return String(ipcRenderer.sendSync('rh:version'));
  } catch {
    return '0.0.0';
  }
})();

const api = {
  isDesktop: true as const,
  version,
  platform: process.platform,
  /** Estado del agente de impresión integrado (null si no hay token). */
  getAgentStatus: () => ipcRenderer.invoke('rh:getAgentStatus'),
  /** Suscribirse a cambios del estado del agente. Devuelve función para cancelar. */
  onAgentStatus: (cb: (s: unknown) => void) => {
    const h = (_e: unknown, s: unknown) => cb(s);
    ipcRenderer.on('rh:agentStatus', h);
    return () => ipcRenderer.removeListener('rh:agentStatus', h);
  },
  /** Abre la ventana de configuración (URL del servidor, token del agente, kiosco). */
  openSettings: () => ipcRenderer.invoke('rh:openSettings'),
  /** Imprime un documento HTML completo (ej. renderHtml de @rh/printing). */
  printHtml: (html: string, opts?: RhDesktopPrintOptions) => ipcRenderer.invoke('rh:printHtml', html, opts ?? {}),
  /** Impresoras instaladas en Windows: [{ name, displayName, description, isDefault }]. */
  listPrinters: () => ipcRenderer.invoke('rh:listPrinters'),
  /** Impresoras/puertos detectados por el agente (Windows, USB, COM). */
  discoverPrinters: () => ipcRenderer.invoke('rh:discover'),
};

contextBridge.exposeInMainWorld('rhDesktop', api);
