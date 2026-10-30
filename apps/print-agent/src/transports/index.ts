import type { PrinterConfig, PrinterConnection } from '@rh/shared';
import { networkTransport } from './network';
import { usbDeviceTransport } from './usb-device';
import { windowsTransport } from './windows';
import { serialTransport } from './serial';
import { Transport, TransportError } from './types';

export const transports: Partial<Record<PrinterConnection, Transport>> = {
  NETWORK: networkTransport,
  USB_DEVICE: usbDeviceTransport,
  WINDOWS_PRINTER: windowsTransport,
  SERIAL: serialTransport,
};

/** Conexiones que atiende un agente de impresión. */
export const AGENT_CONNECTIONS: PrinterConnection[] = ['NETWORK', 'USB_DEVICE', 'WINDOWS_PRINTER', 'SERIAL'];

export function sendToPrinter(printer: PrinterConfig, bytes: Uint8Array, opts?: { timeoutMs?: number }): Promise<void> {
  const t = transports[printer.connection];
  if (!t) return Promise.reject(new TransportError(`El agente no puede imprimir conexiones de tipo ${printer.connection}`));
  return t.print(printer, bytes, opts);
}

export * from './types';
export { sendTcp, networkTransport, DEFAULT_RAW_PORT } from './network';
export { writeDevice, usbDeviceTransport } from './usb-device';
export { printWindowsRaw, windowsTransport, RAW_PRINT_PS1 } from './windows';
export { writeSerial, serialTransport, listSerialPorts, loadSerialPort } from './serial';
export { runPowerShell } from './powershell';
