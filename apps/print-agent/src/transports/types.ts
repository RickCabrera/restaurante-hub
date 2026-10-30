import type { PrinterConfig } from '@rh/shared';

export interface Transport {
  print(printer: PrinterConfig, bytes: Uint8Array, opts?: { timeoutMs?: number }): Promise<void>;
}

export class TransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransportError';
  }
}
