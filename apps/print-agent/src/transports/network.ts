// Impresoras de red: ESC/POS crudo por TCP (puerto 9100 "RAW/JetDirect").
import net from 'node:net';
import type { PrinterConfig } from '@rh/shared';
import { Transport, TransportError } from './types';

export const DEFAULT_RAW_PORT = 9100;

export function sendTcp(host: string, port: number, bytes: Uint8Array, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const socket = new net.Socket();
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.on('error', () => {});
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new TransportError(`Tiempo agotado al imprimir en ${host}:${port}. Revisa que la impresora esté encendida y en la misma red.`)),
      timeoutMs,
    );
    socket.setNoDelay(true);
    socket.once('error', (e: NodeJS.ErrnoException) => {
      const reason =
        e.code === 'ECONNREFUSED' ? 'la impresora rechazó la conexión (¿puerto correcto?)'
        : e.code === 'EHOSTUNREACH' || e.code === 'ENETUNREACH' ? 'no se encuentra en la red (¿IP correcta?)'
        : e.code === 'ETIMEDOUT' ? 'no respondió' : e.message;
      finish(new TransportError(`No se pudo imprimir en ${host}:${port}: ${reason}`));
    });
    socket.connect(port, host, () => {
      socket.write(Buffer.from(bytes), (err) => {
        if (err) return finish(new TransportError(`Error al enviar a ${host}:${port}: ${err.message}`));
        // end() envía FIN tras vaciar el búfer; esperamos 'close' (o 'finish') para confirmar
        socket.end(() => finish());
      });
    });
  });
}

export const networkTransport: Transport = {
  async print(printer: PrinterConfig, bytes: Uint8Array, opts) {
    const host = printer.host?.trim();
    if (!host) throw new TransportError(`La impresora "${printer.name}" no tiene IP configurada`);
    await sendTcp(host, printer.port || DEFAULT_RAW_PORT, bytes, opts?.timeoutMs ?? 10_000);
  },
};
