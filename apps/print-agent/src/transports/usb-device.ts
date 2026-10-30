// USB directo en Linux / Raspberry Pi: escribir al dispositivo de caracteres (/dev/usb/lp0).
import fs from 'node:fs';
import type { PrinterConfig } from '@rh/shared';
import { Transport, TransportError } from './types';

export function writeDevice(devicePath: string, bytes: Uint8Array, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new TransportError(`Tiempo agotado escribiendo a ${devicePath}. ¿Hay papel y la impresora está encendida?`));
    }, timeoutMs);
    fs.open(devicePath, 'w', (err, fd) => {
      if (err) {
        done = true;
        clearTimeout(timer);
        const e = err as NodeJS.ErrnoException;
        const reason =
          e.code === 'ENOENT' ? 'no existe (¿impresora conectada/encendida?)'
          : e.code === 'EACCES' || e.code === 'EPERM' ? 'sin permiso (agrega el usuario al grupo "lp": sudo usermod -aG lp $USER)'
          : e.code === 'EBUSY' ? 'está ocupado por otro programa (¿CUPS?)' : e.message;
        return reject(new TransportError(`No se pudo abrir ${devicePath}: ${reason}`));
      }
      fs.write(fd, Buffer.from(bytes), (werr) => {
        fs.close(fd, () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (werr) reject(new TransportError(`Error escribiendo a ${devicePath}: ${werr.message}`));
          else resolve();
        });
      });
    });
  });
}

export const usbDeviceTransport: Transport = {
  async print(printer: PrinterConfig, bytes: Uint8Array, opts) {
    const path = printer.devicePath?.trim();
    if (!path) throw new TransportError(`La impresora "${printer.name}" no tiene ruta de dispositivo (ej. /dev/usb/lp0)`);
    if (process.platform === 'win32') throw new TransportError('USB directo solo funciona en Linux/Raspberry. En Windows usa "Impresora instalada en Windows".');
    await writeDevice(path, bytes, opts?.timeoutMs ?? 10_000);
  },
};
