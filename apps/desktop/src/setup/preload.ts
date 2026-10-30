// Preload de la ventana de configuración local.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('rhSetup', {
  getConfig: () => ipcRenderer.invoke('rh-setup:getConfig'),
  test: (url: string) => ipcRenderer.invoke('rh-setup:test', url),
  save: (cfg: Record<string, unknown>) => ipcRenderer.invoke('rh-setup:save', cfg),
  cancel: () => ipcRenderer.invoke('rh-setup:cancel'),
});
