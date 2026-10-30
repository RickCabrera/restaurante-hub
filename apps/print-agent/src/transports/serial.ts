// Puerto serial / COM (impresoras RS-232 o adaptadores USB-serial).
// `serialport` es opcional: se carga dinámicamente si está instalado.
import type { PrinterConfig } from '@rh/shared';
import { Transport, TransportError } from './types';

type SerialPortCtor = new (opts: { path: string; baudRate: number; autoOpen?: boolean }) => {
  open(cb: (err: Error | null) => void): void;
  write(data: Buffer, cb?: (err: Error | null | undefined) => void): boolean;
  drain(cb: (err: Error | null) => void): void;
  close(cb?: (err: Error | null) => void): void;
  isOpen: boolean;
};
interface SerialPortModule {
  SerialPort: SerialPortCtor & { list(): Promise<{ path: string; manufacturer?: string; friendlyName?: string }[]> };
}

let cached: SerialPortModule | null | undefined;
export function loadSerialPort(): SerialPortModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('serialport') as SerialPortModule;
  } catch {
    cached = null;
  }
  return cached;
}

export async function listSerialPorts(): Promise<{ path: string; name: string }[]> {
  const mod = loadSerialPort();
  if (!mod) return [];
  try {
    const ports = await mod.SerialPort.list();
    return ports.map((p) => ({ path: p.path, name: p.friendlyName || p.manufacturer || p.path }));
  } catch {
    return [];
  }
}

export function writeSerial(path: string, baudRate: number, bytes: Uint8Array, timeoutMs = 10_000): Promise<void> {
  const mod = loadSerialPort();
  if (!mod) {
    return Promise.reject(new TransportError('El soporte de puerto serial no está instalado (paquete "serialport"). Reinstala el agente con dependencias opcionales.'));
  }
  return new Promise((resolve, reject) => {
    let done = false;
    const port = new mod.SerialPort({ path, baudRate, autoOpen: false });
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const close = () => (err ? reject(err) : resolve());
      if (port.isOpen) port.close(() => close());
      else close();
    };
    const timer = setTimeout(() => finish(new TransportError(`Tiempo agotado escribiendo al puerto ${path}`)), timeoutMs);
    port.open((err) => {
      if (err) return finish(new TransportError(`No se pudo abrir el puerto ${path}: ${err.message}`));
      port.write(Buffer.from(bytes), (werr) => {
        if (werr) return finish(new TransportError(`Error escribiendo a ${path}: ${werr.message}`));
        port.drain((derr) => finish(derr ? new TransportError(`Error vaciando ${path}: ${derr.message}`) : undefined));
      });
    });
  });
}

export const serialTransport: Transport = {
  async print(printer: PrinterConfig, bytes: Uint8Array, opts) {
    const path = printer.devicePath?.trim();
    if (!path) throw new TransportError(`La impresora "${printer.name}" no tiene puerto configurado (ej. COM3 o /dev/ttyUSB0)`);
    await writeSerial(path, printer.baudRate || 9600, bytes, opts?.timeoutMs ?? 10_000);
  },
};
