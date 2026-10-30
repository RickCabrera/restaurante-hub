// Acceso a los plugins nativos SIN importar paquetes de Capacitor.
// En la app Android, Capacitor inyecta `window.Capacitor` (native-bridge) y los plugins Cordova
// (p. ej. `window.bluetoothSerial`). En navegador/escritorio no existen y todo devuelve null/false.

export interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
  nativePromise?: <T = unknown>(plugin: string, method: string, options?: unknown) => Promise<T>;
  Plugins?: Record<string, Record<string, (...a: unknown[]) => unknown>>;
}

export interface RhDesktopApi {
  isDesktop: true;
  version: string;
  platform?: string;
  getAgentStatus(): Promise<unknown>;
  onAgentStatus?(cb: (s: unknown) => void): () => void;
  openSettings(): Promise<void>;
  printHtml(html: string, opts?: { silent?: boolean; deviceName?: string; paperWidth?: 58 | 80; copies?: number }): Promise<{ ok: true }>;
  listPrinters(): Promise<{ name: string; displayName: string; description?: string; isDefault: boolean }[]>;
  discoverPrinters?(): Promise<{ name: string; type: string; path?: string }[]>;
}

export interface BluetoothSerialGlobal {
  list(ok: (devices: { name?: string; address?: string; id?: string; class?: number }[]) => void, fail: (e: unknown) => void): void;
  connect(mac: string, ok: () => void, fail: (e: unknown) => void): void;
  connectInsecure?(mac: string, ok: () => void, fail: (e: unknown) => void): void;
  disconnect(ok: () => void, fail: (e: unknown) => void): void;
  write(data: ArrayBuffer | Uint8Array | number[] | string, ok: () => void, fail: (e: unknown) => void): void;
  isEnabled(ok: () => void, fail: (e: unknown) => void): void;
  isConnected(ok: () => void, fail: (e: unknown) => void): void;
  enable?(ok: () => void, fail: (e: unknown) => void): void;
}

type W = Window & { Capacitor?: CapacitorGlobal; rhDesktop?: RhDesktopApi; bluetoothSerial?: BluetoothSerialGlobal };

const w = (): W | undefined => (typeof window !== 'undefined' ? (window as W) : undefined);

export const getCapacitor = (): CapacitorGlobal | undefined => w()?.Capacitor;
export const getDesktop = (): RhDesktopApi | undefined => (w()?.rhDesktop?.isDesktop ? w()!.rhDesktop : undefined);
export const getBluetoothSerial = (): BluetoothSerialGlobal | undefined => w()?.bluetoothSerial;

export function isNative(): boolean {
  try {
    return !!getCapacitor()?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/** ¿El plugin nativo está registrado en este APK? */
export function hasPlugin(name: string): boolean {
  const cap = getCapacitor();
  if (!cap || !isNative()) return false;
  try {
    if (cap.isPluginAvailable) return cap.isPluginAvailable(name);
  } catch {
    /* ignore */
  }
  return !!cap.Plugins?.[name];
}

/** Llama un método de un plugin de Capacitor (nativo). */
export function callPlugin<T = unknown>(plugin: string, method: string, options: Record<string, unknown> = {}): Promise<T> {
  const cap = getCapacitor();
  if (!cap || !isNative()) return Promise.reject(new Error('Función disponible solo en la app Android'));
  const p = cap.Plugins?.[plugin];
  if (p && typeof p[method] === 'function') return Promise.resolve(p[method](options) as T);
  if (cap.nativePromise) return cap.nativePromise<T>(plugin, method, options);
  return Promise.reject(new Error(`Plugin ${plugin} no disponible`));
}
