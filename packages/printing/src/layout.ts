// Utilidades de maquetado en texto de ancho fijo (renglones de impresora térmica).
import type { Align } from './document';

/** Divide un texto en renglones de máximo `width` columnas, respetando palabras. */
export function wrapText(text: string, width: number): string[] {
  const w = Math.max(1, width);
  const out: string[] = [];
  for (const paragraph of String(text ?? '').split(/\r?\n/)) {
    // se conserva la sangría inicial (p. ej. "   + modificador") también en los renglones siguientes
    const rawIndent = /^ */.exec(paragraph)![0];
    const indent = rawIndent.length <= Math.floor(w / 3) ? rawIndent : '';
    const words = paragraph.trim().split(/ +/).filter((x) => x.length > 0);
    if (words.length === 0) { out.push(''); continue; }
    let line = indent;
    let hasWord = false;
    const flush = () => { out.push(line); line = indent; hasWord = false; };
    for (const word of words) {
      const sep = hasWord ? ' ' : '';
      if (len(line) + sep.length + len(word) <= w) { line += sep + word; hasWord = true; continue; }
      if (hasWord) flush();
      // palabra más larga que el renglón: se corta
      let rest = Array.from(word);
      while (len(line) + rest.length > w) {
        const room = Math.max(1, w - len(line));
        line += rest.slice(0, room).join('');
        rest = rest.slice(room);
        out.push(line);
        line = indent;
      }
      if (rest.length) { line += rest.join(''); hasWord = true; }
    }
    if (hasWord) out.push(line);
  }
  return out;
}

export function len(s: string): number {
  return Array.from(s).length;
}

/** Recorta o rellena a exactamente `width` columnas según alineación. */
export function pad(text: string, width: number, align: Align = 'left'): string {
  const chars = Array.from(text);
  if (chars.length >= width) return chars.slice(0, width).join('');
  const gap = width - chars.length;
  if (align === 'right') return ' '.repeat(gap) + text;
  if (align === 'center') {
    const l = Math.floor(gap / 2);
    return ' '.repeat(l) + text + ' '.repeat(gap - l);
  }
  return text + ' '.repeat(gap);
}

/**
 * Renglón con texto a la izquierda y a la derecha, rellenado al ancho.
 * Si el texto izquierdo es largo se parte en varios renglones y el derecho
 * queda en el primero.
 */
export function layoutRow(left: string, right: string, width: number): string[] {
  const r = len(right);
  if (r === 0) return wrapText(left, width).map((l) => pad(l, width));
  if (len(left) + 1 + r <= width) return [left + ' '.repeat(width - len(left) - r) + right];
  if (r <= Math.floor(width / 2)) {
    const lines = wrapText(left, width - r - 1);
    return lines.map((l, i) => (i === 0 ? pad(l, width - r) + right : pad(l, width)));
  }
  // el texto derecho no cabe junto: va en su propio renglón alineado a la derecha
  return [...wrapText(left, width).map((l) => pad(l, width)), ...wrapText(right, width).map((l) => pad(l, width, 'right'))];
}

/** Columnas por fracción del ancho; la última toma el sobrante. */
export function layoutColumns(cols: { text: string; width: number; align?: Align }[], width: number): string[] {
  if (cols.length === 0) return [];
  const total = cols.reduce((a, c) => a + Math.max(0, c.width), 0) || 1;
  const widths: number[] = [];
  let used = 0;
  cols.forEach((c, i) => {
    if (i === cols.length - 1) widths.push(Math.max(1, width - used));
    else {
      const w = Math.max(1, Math.floor((Math.max(0, c.width) / Math.max(1, total)) * width));
      widths.push(w);
      used += w;
    }
  });
  // espacio de separación: se reserva 1 columna al final de cada columna (menos la última)
  const wrapped = cols.map((c, i) => wrapText(c.text, i < cols.length - 1 && widths[i] > 1 ? widths[i] - 1 : widths[i]));
  const rows = Math.max(...wrapped.map((w) => w.length));
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    cols.forEach((c, i) => {
      const inner = i < cols.length - 1 && widths[i] > 1 ? widths[i] - 1 : widths[i];
      const cell = pad(wrapped[i][r] ?? '', inner, c.align ?? 'left');
      line += i < cols.length - 1 && widths[i] > 1 ? cell + ' ' : cell;
    });
    out.push(line);
  }
  return out;
}
