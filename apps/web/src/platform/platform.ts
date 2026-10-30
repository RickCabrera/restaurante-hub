// Detección de plataforma (APP-03): navegador, app de escritorio (Electron) o app Android (Capacitor).
import type { PrinterConnection } from '@rh/shared';
import { callPlugin, getCapacitor, getDesktop, hasPlugin, isNative } from './native';

export type Platform = 'desktop' | 'android' | 'ios' | 'web';

export function getPlatform(): Platform {
  if (getDesktop()) return 'desktop';
  if (isNative()) {
    const p = getCapacitor()?.getPlatform?.();
    if (p === 'android') return 'android';
    if (p === 'ios') return 'ios';
  }
  return 'web';
}

export const isDesktopApp = () => getPlatform() === 'desktop';
export const isAndroidApp = () => getPlatform() === 'android';
export const isNativeApp = () => getPlatform() !== 'web';

export const PlatformLabel: Record<Platform, string> = {
  desktop: 'App de escritorio',
  android: 'App Android',
  ios: 'App iOS',
  web: 'Navegador',
};

/**
 * Conexiones de impresora que ESTE dispositivo puede atender.
 *  - web: BROWSER (diálogo de impresión) y KDS (pantalla)
 *  - desktop: además las del agente integrado (red, USB, Windows, COM) si tiene token configurado
 *  - android: BROWSER, BLUETOOTH y KDS
 * Para el formulario del admin usa `supportedConnections(getPlatform())`; para mostrar TODAS
 * las conexiones (configurar desde otro equipo) usa la lista completa de PrinterConnection.
 */
export function supportedConnections(platform: Platform = getPlatform()): PrinterConnection[] {
  switch (platform) {
    case 'desktop':
      return ['BROWSER', 'KDS', 'NETWORK', 'USB_DEVICE', 'WINDOWS_PRINTER', 'SERIAL'];
    case 'android':
      return ['BROWSER', 'BLUETOOTH', 'KDS'];
    case 'ios':
      return ['BROWSER', 'KDS'];
    default:
      return ['BROWSER', 'KDS'];
  }
}

/** ¿Este dispositivo puede registrarse como "impresor" (print client) de esta conexión? */
export function canPrintClient(connection: PrinterConnection, platform: Platform = getPlatform()): boolean {
  if (connection === 'BROWSER') return true;
  if (connection === 'BLUETOOTH') return platform === 'android';
  return false;
}

// ---------- pantalla encendida ----------
let wakeLock: { release(): Promise<void>; released?: boolean } | null = null;
let wakeWanted = false;

async function requestScreenWakeLock() {
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void>; released?: boolean; addEventListener?: (e: string, f: () => void) => void }> } };
  if (!nav.wakeLock) return false;
  try {
    const lock = await nav.wakeLock.request('screen');
    wakeLock = lock;
    lock.addEventListener?.('release', () => {
      if (wakeLock === lock) wakeLock = null;
    });
    return true;
  } catch {
    return false;
  }
}

function onVisibility() {
  if (wakeWanted && document.visibilityState === 'visible' && (!wakeLock || wakeLock.released)) void requestScreenWakeLock();
}

/**
 * Mantiene la pantalla encendida (tablets de cocina / caja).
 * Android: plugin KeepAwake. Navegador: Screen Wake Lock API (se re-adquiere al volver a la pestaña).
 * Devuelve true si se logró.
 */
export async function keepAwake(on = true): Promise<boolean> {
  wakeWanted = on;
  if (hasPlugin('KeepAwake')) {
    try {
      await callPlugin('KeepAwake', on ? 'keepAwake' : 'allowSleep');
      return true;
    } catch {
      /* cae al API web */
    }
  }
  if (typeof document === 'undefined') return false;
  document.removeEventListener('visibilitychange', onVisibility);
  if (!on) {
    const l = wakeLock;
    wakeLock = null;
    await l?.release().catch(() => undefined);
    return true;
  }
  document.addEventListener('visibilitychange', onVisibility);
  return requestScreenWakeLock();
}

/** Vibración corta (avisos de pedido nuevo). Android: Haptics; navegador: navigator.vibrate. */
export function vibrate(ms = 200): void {
  if (hasPlugin('Haptics')) {
    void callPlugin('Haptics', 'vibrate', { duration: ms }).catch(() => navigator.vibrate?.(ms));
    return;
  }
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* no soportado */
  }
}

/** Abre la configuración local de la app de escritorio (URL del servidor, token del agente). */
export function openDesktopSettings(): boolean {
  const d = getDesktop();
  if (!d) return false;
  void d.openSettings();
  return true;
}
