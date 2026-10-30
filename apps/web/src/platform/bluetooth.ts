// Impresión ESC/POS por Bluetooth desde la app Android.
//  1) Bluetooth clásico (SPP) con cordova-plugin-bluetooth-serial — la mayoría de impresoras térmicas
//     portátiles y de cocina (58/80 mm) — requiere emparejarlas antes en Ajustes de Android.
//  2) Alternativa BLE con @capacitor-community/bluetooth-le (impresoras "BLE only"): escribe a la
//     característica de servicios comunes de impresora (0x18F0/0x2AF1, 0xFF00/0xFF02, 0xFFE0/0xFFE1, ISSC…).
import { callPlugin, getBluetoothSerial, hasPlugin, isNative } from './native';

export interface BluetoothPrinter {
  name: string;
  address: string;
  /** 'classic' = SPP emparejada; 'ble' = Bluetooth Low Energy */
  type: 'classic' | 'ble';
}

const CHUNK_CLASSIC = 512;
const CHUNK_BLE = 180;

// ---------- utilidades ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errText(e: unknown): string {
  if (!e) return 'error desconocido';
  if (typeof e === 'string') return e;
  return (e as { message?: string }).message ?? JSON.stringify(e);
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const isMac = (s: string) => /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(s);

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

// ---------- Bluetooth clásico (SPP) ----------
function bs<T = void>(fn: (ok: (v: T) => void, fail: (e: unknown) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => fn(resolve, reject));
}

async function ensureClassicEnabled() {
  const s = getBluetoothSerial()!;
  try {
    await bs((ok, fail) => s.isEnabled(() => ok(undefined), fail));
  } catch {
    if (s.enable) {
      try {
        await bs((ok, fail) => s.enable!(() => ok(undefined), fail));
        return;
      } catch {
        /* el usuario no lo activó */
      }
    }
    throw new Error('El Bluetooth está apagado. Actívalo y vuelve a intentar.');
  }
}

async function listClassic(): Promise<BluetoothPrinter[]> {
  const s = getBluetoothSerial();
  if (!s) return [];
  await ensureClassicEnabled();
  const devices = await bs<{ name?: string; address?: string; id?: string }[]>((ok, fail) => s.list(ok, fail));
  return (devices ?? [])
    .map((d) => ({ name: d.name || d.address || d.id || 'Dispositivo', address: (d.address || d.id || '').toUpperCase(), type: 'classic' as const }))
    .filter((d) => d.address);
}

let classicLock: Promise<unknown> = Promise.resolve();

async function printClassic(address: string, bytes: Uint8Array): Promise<void> {
  const s = getBluetoothSerial();
  if (!s) throw new Error('Bluetooth clásico no disponible en esta app');
  // un solo socket SPP a la vez: serializar
  const run = classicLock.catch(() => undefined).then(async () => {
    await ensureClassicEnabled();
    try {
      await withTimeout(bs((ok, fail) => s.connect(address, () => ok(undefined), fail)), 12_000, 'La impresora no respondió (¿encendida y emparejada?)');
    } catch (e) {
      // algunas impresoras chinas solo aceptan conexión "insegura"
      if (s.connectInsecure) {
        await withTimeout(bs((ok, fail) => s.connectInsecure!(address, () => ok(undefined), fail)), 12_000,
          'La impresora no respondió (¿encendida y emparejada?)').catch(() => { throw new Error(`No se pudo conectar a la impresora Bluetooth ${address}: ${errText(e)}`); });
      } else throw new Error(`No se pudo conectar a la impresora Bluetooth ${address}: ${errText(e)}`);
    }
    try {
      for (let i = 0; i < bytes.length; i += CHUNK_CLASSIC) {
        const chunk = bytes.slice(i, i + CHUNK_CLASSIC);
        await withTimeout(bs((ok, fail) => s.write(chunk.buffer, () => ok(undefined), fail)), 10_000, 'Tiempo agotado enviando a la impresora');
        if (bytes.length > CHUNK_CLASSIC) await sleep(20);
      }
      // dar tiempo a que el búfer salga antes de cerrar el socket
      await sleep(Math.min(1500, 200 + bytes.length / 20));
    } catch (e) {
      throw new Error(`Error enviando a la impresora Bluetooth: ${errText(e)}`);
    } finally {
      await bs((ok, fail) => s.disconnect(() => ok(undefined), fail)).catch(() => undefined);
    }
  });
  classicLock = run;
  return run;
}

// ---------- BLE ----------
const PRINTER_SERVICES: { service: string; characteristic: string }[] = [
  { service: '000018f0-0000-1000-8000-00805f9b34fb', characteristic: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: '0000ff00-0000-1000-8000-00805f9b34fb', characteristic: '0000ff02-0000-1000-8000-00805f9b34fb' },
  { service: '0000ffe0-0000-1000-8000-00805f9b34fb', characteristic: '0000ffe1-0000-1000-8000-00805f9b34fb' },
  { service: '0000fff0-0000-1000-8000-00805f9b34fb', characteristic: '0000fff2-0000-1000-8000-00805f9b34fb' },
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', characteristic: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', characteristic: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
];

let bleInitialized = false;
async function bleInit() {
  if (!hasPlugin('BluetoothLe')) throw new Error('Bluetooth LE no disponible en esta app');
  if (!bleInitialized) {
    await callPlugin('BluetoothLe', 'initialize', { androidNeverForLocation: true });
    bleInitialized = true;
  }
  const { value } = await callPlugin<{ value: boolean }>('BluetoothLe', 'isEnabled');
  if (!value) {
    await callPlugin('BluetoothLe', 'requestEnable').catch(() => undefined);
    const again = await callPlugin<{ value: boolean }>('BluetoothLe', 'isEnabled');
    if (!again.value) throw new Error('El Bluetooth está apagado. Actívalo y vuelve a intentar.');
  }
}

async function listBle(): Promise<BluetoothPrinter[]> {
  if (!hasPlugin('BluetoothLe')) return [];
  try {
    await bleInit();
    const res = await callPlugin<{ devices: { deviceId: string; name?: string }[] }>('BluetoothLe', 'getBondedDevices');
    return (res.devices ?? []).map((d) => ({ name: d.name || d.deviceId, address: d.deviceId.toUpperCase(), type: 'ble' as const }));
  } catch {
    return [];
  }
}

/** Abre el selector del sistema para elegir una impresora BLE cercana (no emparejada). */
export async function pickBlePrinter(): Promise<BluetoothPrinter | null> {
  await bleInit();
  try {
    const d = await callPlugin<{ deviceId: string; name?: string }>('BluetoothLe', 'requestDevice', {
      optionalServices: PRINTER_SERVICES.map((s) => s.service),
    });
    return d ? { name: d.name || d.deviceId, address: d.deviceId.toUpperCase(), type: 'ble' } : null;
  } catch {
    return null;
  }
}

async function printBle(deviceId: string, bytes: Uint8Array): Promise<void> {
  await bleInit();
  try {
    await withTimeout(callPlugin('BluetoothLe', 'connect', { deviceId, timeout: 10_000 }), 12_000, 'La impresora BLE no respondió');
  } catch (e) {
    throw new Error(`No se pudo conectar a la impresora BLE: ${errText(e)}`);
  }
  try {
    const { services } = await callPlugin<{ services: { uuid: string; characteristics: { uuid: string; properties: { write?: boolean; writeWithoutResponse?: boolean } }[] }[] }>(
      'BluetoothLe', 'getServices', { deviceId },
    );
    // 1) servicios conocidos de impresora, 2) cualquier característica escribible
    let target: { service: string; characteristic: string; noResponse: boolean } | null = null;
    for (const known of PRINTER_SERVICES) {
      const svc = services.find((s) => s.uuid.toLowerCase() === known.service);
      const ch = svc?.characteristics.find((c) => c.uuid.toLowerCase() === known.characteristic);
      if (svc && ch) {
        target = { service: svc.uuid, characteristic: ch.uuid, noResponse: !!ch.properties.writeWithoutResponse && !ch.properties.write };
        break;
      }
    }
    if (!target) {
      for (const s of services) {
        const ch = s.characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse);
        if (ch) {
          target = { service: s.uuid, characteristic: ch.uuid, noResponse: !ch.properties.write };
          break;
        }
      }
    }
    if (!target) throw new Error('La impresora no expone un canal de escritura compatible');
    const method = target.noResponse ? 'writeWithoutResponse' : 'write';
    for (let i = 0; i < bytes.length; i += CHUNK_BLE) {
      await callPlugin('BluetoothLe', method, {
        deviceId,
        service: target.service,
        characteristic: target.characteristic,
        value: toHex(bytes.slice(i, i + CHUNK_BLE)),
        timeout: 5_000,
      });
      if (target.noResponse) await sleep(15);
    }
    await sleep(300);
  } finally {
    await callPlugin('BluetoothLe', 'disconnect', { deviceId }).catch(() => undefined);
  }
}

// ---------- API pública ----------

/** ¿Este dispositivo puede imprimir por Bluetooth? (solo app Android) */
export function bluetoothAvailable(): boolean {
  return isNative() && (!!getBluetoothSerial() || hasPlugin('BluetoothLe'));
}

/** Impresoras Bluetooth emparejadas (clásicas primero). */
export async function listBluetoothPrinters(): Promise<BluetoothPrinter[]> {
  if (!bluetoothAvailable()) throw new Error('La impresión Bluetooth solo está disponible en la app Android');
  const out: BluetoothPrinter[] = [];
  let classicError: unknown = null;
  try {
    out.push(...(await listClassic()));
  } catch (e) {
    classicError = e;
  }
  for (const b of await listBle()) if (!out.some((o) => o.address === b.address)) out.push(b);
  if (!out.length && classicError) throw new Error(errText(classicError));
  return out;
}

/**
 * Envía bytes ESC/POS a la impresora Bluetooth.
 * @param address MAC (AA:BB:CC:DD:EE:FF) o deviceId BLE
 * @param opts.type forzar 'classic' o 'ble' (por defecto: clásico y, si falla, BLE)
 */
export async function printBluetooth(address: string | null | undefined, bytes: Uint8Array, opts: { type?: 'classic' | 'ble' } = {}): Promise<void> {
  const addr = String(address ?? '').trim().toUpperCase();
  if (!addr) throw new Error('No hay impresora Bluetooth seleccionada en este dispositivo');
  if (!bluetoothAvailable()) throw new Error('La impresión Bluetooth solo está disponible en la app Android');
  if (opts.type === 'ble') return printBle(addr, bytes);
  if (opts.type === 'classic' || (getBluetoothSerial() && isMac(addr))) {
    try {
      return await printClassic(addr, bytes);
    } catch (e) {
      if (opts.type === 'classic' || !hasPlugin('BluetoothLe')) throw e;
      try {
        return await printBle(addr, bytes);
      } catch {
        throw e; // el error del clásico es el más útil
      }
    }
  }
  return printBle(addr, bytes);
}
