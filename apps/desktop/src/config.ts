// Configuración persistente de la app de escritorio (JSON en userData).
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface DesktopConfig {
  /** URL de la app web (PWA), p. ej. https://mi-restaurante.up.railway.app */
  serverUrl: string;
  /** URL de la API (por defecto = serverUrl). */
  apiUrl: string;
  /** Token del agente de impresión (opcional). */
  agentToken: string;
  /** Abrir al iniciar Windows. */
  autoStart: boolean;
  /** Pantalla completa sin barra (modo kiosco). */
  kiosk: boolean;
}

export const defaultConfig: DesktopConfig = { serverUrl: '', apiUrl: '', agentToken: '', autoStart: true, kiosk: false };

const file = () => path.join(app.getPath('userData'), 'config.json');

export function normalizeUrl(u: string): string {
  let s = String(u ?? '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, '');
}

export function loadConfig(): DesktopConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<DesktopConfig>;
    return { ...defaultConfig, ...raw };
  } catch {
    return { ...defaultConfig };
  }
}

export function saveConfig(cfg: DesktopConfig): void {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8');
  fs.renameSync(tmp, file());
}

export function effectiveApiUrl(cfg: DesktopConfig): string {
  return normalizeUrl(cfg.apiUrl || cfg.serverUrl).replace(/\/api$/i, '');
}
