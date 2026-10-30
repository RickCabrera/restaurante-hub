// Integración con la plataforma (navegador / escritorio / Android) e impresión del lado del cliente.
export * from './platform';
export * from './browser-print';
export * from './bluetooth';
export * from './print-client';
export { getDesktop, isNative } from './native';
export type { RhDesktopApi } from './native';
