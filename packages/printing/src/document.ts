// Modelo de documento de impresión independiente del dispositivo.
// La API genera un PrintDocument (JSON) y cada cliente lo renderiza:
//  - print-agent / app de escritorio / Android Bluetooth -> bytes ESC/POS o STAR (escpos.ts)
//  - navegador -> HTML 58/80 mm (html.ts)
//  - pantalla de cocina -> se usa el JSON directo

export type Align = 'left' | 'center' | 'right';
export type TextSize = 1 | 2 | 3; // multiplicador ancho/alto

export type PrintBlock =
  | { type: 'text'; text: string; align?: Align; bold?: boolean; size?: TextSize; invert?: boolean; underline?: boolean }
  | { type: 'row'; left: string; right: string; bold?: boolean; size?: TextSize } // texto a izquierda y derecha
  | { type: 'columns'; cols: { text: string; width: number; align?: Align }[]; bold?: boolean } // width: fracción 0..1
  | { type: 'line'; char?: string } // separador
  | { type: 'feed'; lines?: number }
  | { type: 'qr'; data: string; size?: number; align?: Align }
  | { type: 'barcode'; data: string; kind?: 'CODE128' | 'EAN13' }
  | { type: 'image'; url: string; width?: number } // logo (solo navegador/escritorio)
  | { type: 'cut'; partial?: boolean }
  | { type: 'drawer' } // abrir cajón de dinero
  | { type: 'beep'; times?: number };

export interface PrintDocument {
  title: string; // para logs / cola
  paperWidth: 58 | 80;
  blocks: PrintBlock[];
}

/** Caracteres por renglón en fuente A según ancho de papel. */
export function charsPerLine(paperWidth: 58 | 80, size: TextSize = 1): number {
  const base = paperWidth === 58 ? 32 : 48;
  return Math.floor(base / size);
}
