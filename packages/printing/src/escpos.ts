// Renderizador PrintDocument -> bytes para impresoras térmicas.
//  - ESC_POS: Epson y compatibles (Xprinter, Bixolon, 3nStar, Ec Line, genéricas chinas)
//  - STAR: Star Line Mode (TSP100/TSP143/TSP650, SP700, mC-Print en modo Star)
// Sin dependencias de Node: se usa en print-agent, escritorio, Android (Bluetooth) y navegador.

import { Align, PrintBlock, PrintDocument, TextSize, charsPerLine } from './document';
import { CodePage, encodeText, toPrintable, utf8Bytes } from './codepage';
import { layoutColumns, layoutRow, len, wrapText } from './layout';

export type Dialect = 'ESC_POS' | 'STAR';

export interface EscPosOptions {
  dialect?: Dialect;
  /** Página de códigos. CP858 (por defecto) incluye € y todos los acentos del español. */
  codepage?: CodePage;
  /** false = ignora los bloques `cut`; true = asegura un corte al final de cada copia. */
  cut?: boolean;
  /** false = ignora los bloques `drawer`; true = abre el cajón al final (una sola vez). */
  openDrawer?: boolean;
  /** Número de copias (se repite el documento completo). Default 1. */
  copies?: number;
  /**
   * Comando de zumbador para ESC/POS. 'EPSON' = ESC ( A (TM-T20/T88 con buzzer);
   * 'ESC_B' = ESC B n t (muchas impresoras de cocina genéricas); 'NONE' = no sonar.
   */
  beepCommand?: 'EPSON' | 'ESC_B' | 'NONE';
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Número de tabla de caracteres para ESC t (Epson) / ESC GS t (Star). */
export const CODEPAGE_NUMBER: Record<Dialect, Record<CodePage, number>> = {
  ESC_POS: { CP858: 19, CP850: 2 },
  // Star: 4 = CP858 (CP850 + €). No hay CP850 separada en Star Line Mode.
  STAR: { CP858: 4, CP850: 4 },
};

class Writer {
  bytes: number[] = [];
  constructor(readonly dialect: Dialect, readonly cp: CodePage, readonly beepCommand: 'EPSON' | 'ESC_B' | 'NONE') {}

  raw(...b: number[]) { for (const x of b) this.bytes.push(x & 0xff); }
  push(arr: ArrayLike<number>) { for (let i = 0; i < arr.length; i++) this.bytes.push(arr[i] & 0xff); }
  text(s: string) { this.push(encodeText(s, this.cp)); }
  lf(n = 1) { for (let i = 0; i < n; i++) this.raw(LF); }

  init() {
    this.raw(ESC, 0x40);
    if (this.dialect === 'STAR') this.raw(ESC, GS, 0x74, CODEPAGE_NUMBER.STAR[this.cp]);
    else this.raw(ESC, 0x74, CODEPAGE_NUMBER.ESC_POS[this.cp]);
  }
  align(a: Align = 'left') {
    const n = a === 'center' ? 1 : a === 'right' ? 2 : 0;
    if (this.dialect === 'STAR') this.raw(ESC, GS, 0x61, n);
    else this.raw(ESC, 0x61, n);
  }
  bold(on: boolean) {
    if (this.dialect === 'STAR') this.raw(ESC, on ? 0x45 : 0x46);
    else this.raw(ESC, 0x45, on ? 1 : 0);
  }
  underline(on: boolean) { this.raw(ESC, 0x2d, on ? 1 : 0); }
  invert(on: boolean) {
    if (this.dialect === 'STAR') this.raw(ESC, on ? 0x34 : 0x35);
    else this.raw(GS, 0x42, on ? 1 : 0);
  }
  size(s: TextSize = 1) {
    const m = clampSize(s) - 1;
    if (this.dialect === 'STAR') this.raw(ESC, 0x69, m, m); // ESC i alto ancho
    else this.raw(GS, 0x21, (m << 4) | m);
  }
  resetStyle() {
    this.bold(false); this.underline(false); this.invert(false); this.size(1); this.align('left');
  }
  cut(partial = false) {
    if (this.dialect === 'STAR') this.raw(ESC, 0x64, partial ? 3 : 2); // ESC d n: corta después de alimentar
    else this.raw(GS, 0x56, partial ? 66 : 65, 0); // GS V m n: alimenta y corta (65 total / 66 parcial)
  }
  drawer() {
    if (this.dialect === 'STAR') this.raw(ESC, 0x07, 0x14, 0x14, 0x07); // define pulso + BEL (cajón 1)
    else this.raw(ESC, 0x70, 0, 25, 250);
  }
  beep(times = 1) {
    const t = Math.max(1, Math.min(9, Math.round(times)));
    if (this.dialect === 'STAR') { for (let i = 0; i < t; i++) this.raw(ESC, GS, 0x07, 1, 10, 10); return; }
    if (this.beepCommand === 'NONE') return;
    if (this.beepCommand === 'ESC_B') { this.raw(ESC, 0x42, t, 3); return; }
    // ESC ( A pL pH fn n c t   (fn=48, n=patrón 51, c=veces, t=intervalo)
    this.raw(ESC, 0x28, 0x41, 4, 0, 48, 51, t, 10);
  }
  qr(data: string, size = 6, align: Align = 'center') {
    const d = utf8Bytes(data).slice(0, 700);
    const s = Math.max(1, Math.min(this.dialect === 'STAR' ? 8 : 16, Math.round(size)));
    this.align(align);
    if (this.dialect === 'STAR') {
      this.raw(ESC, GS, 0x79, 0x53, 0x30, 2); // modelo 2
      this.raw(ESC, GS, 0x79, 0x53, 0x31, 1); // corrección M
      this.raw(ESC, GS, 0x79, 0x53, 0x32, s); // tamaño de celda
      this.raw(ESC, GS, 0x79, 0x44, 0x31, 0, d.length & 0xff, d.length >> 8); // guardar datos
      this.push(d);
      this.raw(ESC, GS, 0x79, 0x50); // imprimir
      this.lf();
    } else {
      this.raw(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0); // modelo 2
      this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, s); // tamaño de módulo
      this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31); // corrección M
      const n = d.length + 3;
      this.raw(GS, 0x28, 0x6b, n & 0xff, n >> 8, 0x31, 0x50, 0x30); // guardar datos
      this.push(d);
      this.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30); // imprimir
      this.lf();
    }
    this.align('left');
  }
  barcode(data: string, kind: 'CODE128' | 'EAN13' = 'CODE128') {
    let ascii = toPrintable(data, this.cp).replace(/[^\x20-\x7e]/g, '');
    if (kind === 'EAN13') {
      ascii = ascii.replace(/\D/g, '');
      if (ascii.length !== 12 && ascii.length !== 13) { this.align('center'); this.text(data); this.lf(); this.align('left'); return; }
    }
    if (!ascii) return;
    const bytes = Array.from(ascii).map((c) => c.charCodeAt(0));
    this.align('center');
    if (this.dialect === 'STAR') {
      // ESC b n1 n2 n3 n4 datos RS — n1: 3=EAN13, 6=CODE128; n2: 2 = texto debajo; n3: ancho; n4: alto
      this.raw(ESC, 0x62, kind === 'EAN13' ? 3 : 6, 2, 2, 80);
      this.push(bytes);
      this.raw(0x1e);
    } else {
      this.raw(GS, 0x48, 2); // texto (HRI) debajo
      this.raw(GS, 0x68, 80); // alto
      this.raw(GS, 0x77, 2); // ancho de módulo
      if (kind === 'EAN13') {
        this.raw(GS, 0x6b, 67, bytes.length);
        this.push(bytes);
      } else {
        const payload = [0x7b, 0x42, ...bytes]; // {B = juego de caracteres B
        this.raw(GS, 0x6b, 73, payload.length);
        this.push(payload);
      }
    }
    this.lf();
    this.align('left');
  }
}

function clampSize(s?: number): TextSize {
  const n = Math.round(Number(s) || 1);
  return (n < 1 ? 1 : n > 3 ? 3 : n) as TextSize;
}

function renderBlocks(w: Writer, doc: PrintDocument, opts: EscPosOptions, copyIndex: number) {
  const paper = doc.paperWidth === 58 ? 58 : 80;
  for (const b of doc.blocks as PrintBlock[]) {
    switch (b.type) {
      case 'text': {
        const size = clampSize(b.size);
        const width = charsPerLine(paper, size);
        w.align(b.align ?? 'left');
        if (b.bold) w.bold(true);
        if (b.underline) w.underline(true);
        if (b.invert) w.invert(true);
        if (size !== 1) w.size(size);
        for (const line of wrapText(toPrintable(b.text, w.cp), width)) {
          // Con fondo invertido se rellena para que la franja se vea pareja
          w.text(b.invert && (b.align ?? 'left') === 'left' ? line.padEnd(width, ' ') : line);
          w.lf();
        }
        w.resetStyle();
        break;
      }
      case 'row': {
        const size = clampSize(b.size);
        const width = charsPerLine(paper, size);
        if (b.bold) w.bold(true);
        if (size !== 1) w.size(size);
        for (const line of layoutRow(toPrintable(b.left ?? '', w.cp), toPrintable(b.right ?? '', w.cp), width)) {
          w.text(line); w.lf();
        }
        w.resetStyle();
        break;
      }
      case 'columns': {
        const width = charsPerLine(paper, 1);
        if (b.bold) w.bold(true);
        const cols = (b.cols ?? []).map((c) => ({ ...c, text: toPrintable(c.text ?? '', w.cp) }));
        for (const line of layoutColumns(cols, width)) { w.text(line); w.lf(); }
        w.resetStyle();
        break;
      }
      case 'line': {
        const ch = toPrintable(b.char || '-', w.cp);
        const unit = len(ch) > 0 ? ch : '-';
        const width = charsPerLine(paper, 1);
        w.text(unit.repeat(Math.ceil(width / len(unit))).slice(0, width));
        w.lf();
        break;
      }
      case 'feed':
        w.lf(Math.max(1, Math.min(20, Math.round(b.lines ?? 1))));
        break;
      case 'qr':
        if (b.data) w.qr(b.data, b.size ?? (paper === 58 ? 5 : 6), b.align ?? 'center');
        break;
      case 'barcode':
        if (b.data) w.barcode(b.data, b.kind ?? 'CODE128');
        break;
      case 'image':
        break; // los logos solo se imprimen en navegador/escritorio
      case 'cut':
        if (opts.cut !== false) w.cut(!!b.partial);
        break;
      case 'drawer':
        if (opts.openDrawer !== false && copyIndex === 0) w.drawer();
        break;
      case 'beep':
        w.beep(b.times ?? 1);
        break;
    }
  }
}

/** Convierte un PrintDocument en bytes listos para enviar a la impresora. */
export function renderEscPos(doc: PrintDocument, opts: EscPosOptions = {}): Uint8Array {
  const dialect: Dialect = opts.dialect === 'STAR' ? 'STAR' : 'ESC_POS';
  const cp: CodePage = opts.codepage === 'CP850' ? 'CP850' : 'CP858';
  const w = new Writer(dialect, cp, opts.beepCommand ?? 'EPSON');
  const copies = Math.max(1, Math.min(10, Math.round(opts.copies ?? 1)));
  const blocks = doc?.blocks ?? [];
  const hasCut = blocks.some((b) => b.type === 'cut');
  const hasDrawer = blocks.some((b) => b.type === 'drawer');
  for (let i = 0; i < copies; i++) {
    w.init();
    renderBlocks(w, { ...doc, blocks }, opts, i);
    if (opts.cut === true && !hasCut) { w.lf(4); w.cut(false); }
  }
  if (opts.openDrawer === true && !hasDrawer) w.drawer();
  return Uint8Array.from(w.bytes);
}

export { charsPerLine };
