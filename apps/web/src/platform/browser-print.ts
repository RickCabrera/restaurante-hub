// Impresión HTML de tickets (impresoras tipo BROWSER).
//  - App de escritorio: imprime en silencio en la impresora de Windows indicada (window.rhDesktop.printHtml).
//  - Navegador / Android: iframe oculto + diálogo de impresión del sistema.
import { renderHtml, type PrintDocument } from '@rh/printing';
import { getDesktop } from './native';

export interface BrowserPrintOptions {
  /** Solo escritorio: nombre de la impresora de Windows (vacío = predeterminada). */
  deviceName?: string;
  /** Solo escritorio: false muestra el diálogo. Default true. */
  silent?: boolean;
  copies?: number;
}

/** Imprime un HTML completo con un iframe oculto. Resuelve al cerrar el diálogo (o tras un tiempo). */
export function printHtmlInIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    // fuera de pantalla pero con tamaño real (Safari/Android no imprimen iframes de 0x0)
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:80mm;height:10px;border:0;opacity:0;pointer-events:none;';
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      setTimeout(() => iframe.remove(), 500);
      resolve();
    };
    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        iframe.remove();
        reject(new Error('No se pudo preparar la impresión'));
        return;
      }
      const imgs = Array.from(win.document.images ?? []);
      const ready = Promise.all(
        imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = img.onerror = () => r(); }))),
      );
      const timeout = new Promise<void>((r) => setTimeout(r, 2000));
      void Promise.race([ready, timeout]).then(() => {
        win.addEventListener('afterprint', cleanup);
        try {
          win.focus();
          win.print(); // bloqueante en la mayoría de navegadores de escritorio
        } catch (e) {
          iframe.remove();
          done = true;
          reject(new Error(`El navegador bloqueó la impresión: ${(e as Error).message}`));
          return;
        }
        // si 'afterprint' no llega (Android WebView), liberar después de un rato
        setTimeout(cleanup, 60_000);
        // en navegadores donde print() es bloqueante, ya terminó
        setTimeout(() => { if (document.hasFocus()) cleanup(); }, 1000);
      });
    };
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

/** Renderiza un PrintDocument a HTML (58/80 mm) y lo imprime. */
export async function printDocumentHtml(doc: PrintDocument, opts: BrowserPrintOptions = {}): Promise<void> {
  const html = renderHtml(doc);
  const desktop = getDesktop();
  if (desktop?.printHtml) {
    await desktop.printHtml(html, {
      silent: opts.silent !== false,
      deviceName: opts.deviceName || undefined,
      paperWidth: doc.paperWidth,
      copies: opts.copies ?? 1,
    });
    return;
  }
  const copies = Math.max(1, Math.min(5, opts.copies ?? 1));
  for (let i = 0; i < copies; i++) await printHtmlInIframe(html);
}

/** Vista previa en una pestaña nueva (útil para "Ver ticket"). */
export function previewDocumentHtml(doc: PrintDocument): void {
  const html = renderHtml(doc);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
