// Renderizador PrintDocument -> documento HTML independiente para papel térmico 58/80 mm.
// Se imprime con el diálogo del navegador (o en silencio desde la app de escritorio).
import qrcode from 'qrcode-generator';
import { Align, PrintBlock, PrintDocument, TextSize, charsPerLine } from './document';

export interface HtmlOptions {
  /** <title> del documento (default: doc.title). */
  title?: string;
  /** Incluir estilos para verse como "papel" al abrirlo en pantalla (vista previa). Default true. */
  screenPreview?: boolean;
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeUrl = (u: string) => (/^(https?:|data:image\/)/i.test(u.trim()) ? u.trim() : '');

function clampSize(s?: number): TextSize {
  const n = Math.round(Number(s) || 1);
  return (n < 1 ? 1 : n > 3 ? 3 : n) as TextSize;
}

/** QR como <svg> en línea (no requiere red ni canvas). */
export function qrSvg(data: string, opts: { cellSize?: number; margin?: number } = {}): string {
  const qr = qrcode(0, 'M');
  // qrcode-generator codifica por defecto en "Byte" con stringToBytes ISO-8859-1; forzamos UTF-8
  const bytes = utf8String(data);
  qr.addData(bytes, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const margin = opts.margin ?? 2;
  const size = n + margin * 2;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) path += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" class="qr" role="img" aria-label="QR"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

/** Convierte a una cadena "binaria" UTF-8 (un char por byte) para el modo Byte de qrcode-generator. */
function utf8String(s: string): string {
  let out = '';
  for (const ch of Array.from(s)) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out += ch;
    else if (cp < 0x800) out += String.fromCharCode(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out += String.fromCharCode(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out += String.fromCharCode(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

function alignClass(a?: Align) {
  return a === 'center' ? ' c' : a === 'right' ? ' r' : '';
}

function blockHtml(b: PrintBlock, paper: 58 | 80): string {
  switch (b.type) {
    case 'text': {
      const cls = `t s${clampSize(b.size)}${alignClass(b.align)}${b.bold ? ' b' : ''}${b.underline ? ' u' : ''}${b.invert ? ' inv' : ''}`;
      return `<div class="${cls}">${esc(b.text)}</div>`;
    }
    case 'row': {
      const size = clampSize(b.size);
      return `<div class="row s${size}${b.bold ? ' b' : ''}"><span class="l">${esc(b.left)}</span><span class="rt">${esc(b.right)}</span></div>`;
    }
    case 'columns': {
      const total = (b.cols ?? []).reduce((a, c) => a + Math.max(0, c.width), 0) || 1;
      const cells = (b.cols ?? [])
        .map((c) => `<span class="col${alignClass(c.align)}" style="flex:0 0 ${((Math.max(0, c.width) / total) * 100).toFixed(3)}%">${esc(c.text)}</span>`)
        .join('');
      return `<div class="cols${b.bold ? ' b' : ''}">${cells}</div>`;
    }
    case 'line': {
      const ch = b.char || '-';
      if (ch === '-' || ch === '_') return '<hr class="ln dash"/>';
      if (ch === '=') return '<hr class="ln dbl"/>';
      const width = charsPerLine(paper, 1);
      return `<div class="t ln-txt">${esc(ch.repeat(Math.ceil(width / Math.max(1, ch.length))).slice(0, width))}</div>`;
    }
    case 'feed':
      return `<div class="feed" style="height:${Math.max(1, Math.min(20, b.lines ?? 1)) * 1.25}em"></div>`;
    case 'qr': {
      if (!b.data) return '';
      const mm = Math.max(18, Math.min(paper === 58 ? 44 : 60, (b.size ?? 6) * 7));
      return `<div class="qrw${alignClass(b.align ?? 'center')}"><div style="display:inline-block;width:${mm}mm;max-width:100%">${qrSvg(b.data)}</div></div>`;
    }
    case 'barcode':
      // Sin generador de código de barras: se imprime el valor legible.
      return b.data ? `<div class="t c bc">${esc(b.data)}</div>` : '';
    case 'image': {
      const url = safeUrl(b.url ?? '');
      if (!url) return '';
      const px = b.width ? `max-width:min(100%, ${Math.round(b.width)}px);` : 'max-width:100%;';
      return `<div class="img c"><img src="${esc(url)}" style="${px}" alt=""/></div>`;
    }
    case 'cut':
      return '<div class="cut"></div>';
    case 'drawer':
    case 'beep':
      return '';
    default:
      return '';
  }
}

/** Genera un documento HTML completo listo para imprimir en papel térmico. */
export function renderHtml(doc: PrintDocument, opts: HtmlOptions = {}): string {
  const paper: 58 | 80 = doc?.paperWidth === 58 ? 58 : 80;
  // ancho imprimible típico: 80 mm -> 72 mm, 58 mm -> 48 mm
  const printable = paper === 58 ? 48 : 72;
  const cpl = charsPerLine(paper, 1);
  const title = opts.title ?? doc?.title ?? 'Ticket';
  const body = (doc?.blocks ?? []).map((b) => blockHtml(b, paper)).join('\n');
  const preview = opts.screenPreview !== false;
  // tamaño de letra para que quepan `cpl` caracteres monoespaciados en el ancho imprimible
  // (en monoespaciadas el ancho de un carácter ≈ 0.6 em)
  const fontMm = (printable / cpl / 0.6).toFixed(3);
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>
@page { size: ${paper}mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ticket { width: ${paper}mm; padding: 2mm ${(paper - printable) / 2}mm 4mm; font-family: "Courier New", Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace; font-size: ${fontMm}mm; line-height: 1.2; }
.t { white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
.c { text-align: center; } .r { text-align: right; }
.b { font-weight: 700; } .u { text-decoration: underline; }
.inv { background: #000; color: #fff; padding: 0 1mm; }
.s2 { font-size: 2em; line-height: 1.1; } .s3 { font-size: 3em; line-height: 1.05; }
.row { display: flex; justify-content: space-between; gap: 1ch; align-items: flex-start; }
.row .l { flex: 1 1 auto; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.row .rt { flex: 0 0 auto; text-align: right; white-space: nowrap; }
.cols { display: flex; }
.col { white-space: pre-wrap; overflow-wrap: anywhere; padding-right: 0.5ch; }
.col:last-child { padding-right: 0; }
hr.ln { border: 0; margin: 0.4em 0; } hr.dash { border-top: 1px dashed #000; } hr.dbl { border-top: 3px double #000; }
.qrw { margin: 1mm 0; } .qr { width: 100%; height: auto; display: block; }
.img img { display: inline-block; height: auto; filter: grayscale(1); }
.bc { letter-spacing: 0.2em; }
.cut { break-after: page; page-break-after: always; height: 0; }
.cut:last-child { break-after: auto; page-break-after: auto; }
${preview ? `@media screen { body { background: #e5e7eb; padding: 16px 0; } .ticket { margin: 0 auto; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.2); } .cut { border-bottom: 1px dashed #9ca3af; margin: 2mm 0; } }` : ''}
@media print { html, body { width: ${paper}mm; } .ticket { box-shadow: none; } }
</style>
</head>
<body>
<div class="ticket" data-paper="${paper}" data-cpl="${cpl}">
${body}
</div>
</body>
</html>`;
}
