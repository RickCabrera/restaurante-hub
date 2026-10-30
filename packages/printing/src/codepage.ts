// Mapeo Unicode -> páginas de códigos CP850 / CP858 escrito a mano.
// No depende de iconv-lite para poder usarse en navegador y Android.
// CP858 = CP850 con el símbolo del euro (€) en 0xD5 (en CP850 es la "ı" sin punto).

export type CodePage = 'CP858' | 'CP850';

// Caracteres de 0x80 a 0xFF en CP850 (índice = byte - 0x80).
const CP850_HIGH =
  'ÇüéâäàåçêëèïîìÄÅ' + // 0x80
  'ÉæÆôöòûùÿÖÜø£Ø×ƒ' + // 0x90
  'áíóúñÑªº¿®¬½¼¡«»' + // 0xA0
  '░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐' + // 0xB0
  '└┴┬├─┼ãÃ╚╔╩╦╠═╬¤' + // 0xC0
  'ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀' + // 0xD0
  'ÓßÔÒõÕµþÞÚÛÙýÝ¯´' + // 0xE0
  '­±‗¾¶§÷¸°¨·¹³²■ '; // 0xF0

const BASE_TABLE: Map<string, number> = (() => {
  const m = new Map<string, number>();
  for (let i = 0; i < CP850_HIGH.length; i++) m.set(CP850_HIGH[i], 0x80 + i);
  return m;
})();

const TABLES: Record<CodePage, Map<string, number>> = {
  CP850: BASE_TABLE,
  CP858: (() => {
    const m = new Map(BASE_TABLE);
    m.delete('ı');
    m.set('€', 0xd5);
    return m;
  })(),
};

/** Sustituciones tipográficas comunes antes de quitar acentos. */
const SUBSTITUTIONS: Record<string, string> = {
  '€': 'EUR', '‘': "'", '’': "'", '‚': ',', '“': '"', '”': '"', '„': '"', '–': '-', '—': '-', '−': '-',
  '…': '...', '•': '*', '·': '.', '×': 'x', ' ': ' ', '\t': ' ', '™': 'TM', '→': '->', '←': '<-',
  '✓': 'v', '✔': 'v', '✗': 'x', '¢': 'c', 'Œ': 'OE', 'œ': 'oe', 'ß': 'ss',
};

/** ¿Se puede representar este carácter en la página de códigos? */
export function canEncode(ch: string, cp: CodePage = 'CP858'): boolean {
  const c = ch.charCodeAt(0);
  if (ch.length === 1 && c >= 0x20 && c < 0x7f) return true;
  if (ch === '\n') return true;
  return TABLES[cp].has(ch);
}

/**
 * Convierte un texto a caracteres representables en la página de códigos
 * (el resultado tiene un carácter por columna impresa).
 * Desconocidos: sustitución → sin diacríticos → '?'.
 */
export function toPrintable(text: string, cp: CodePage = 'CP858'): string {
  let out = '';
  for (const ch of Array.from(text ?? '')) {
    if (canEncode(ch, cp)) { out += ch; continue; }
    // ESC/POS no maneja caracteres de control dentro de un texto
    const code = ch.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f) continue;
    const sub = SUBSTITUTIONS[ch];
    if (sub !== undefined) {
      out += Array.from(sub).every((c) => canEncode(c, cp)) ? sub : sub.normalize('NFD').replace(/[̀-ͯ]/g, '');
      continue;
    }
    const stripped = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (stripped && Array.from(stripped).every((c) => canEncode(c, cp))) { out += stripped; continue; }
    out += '?';
  }
  return out;
}

/** Codifica un texto (ya pasado o no por toPrintable) a bytes de la página de códigos. */
export function encodeText(text: string, cp: CodePage = 'CP858'): number[] {
  const table = TABLES[cp];
  const bytes: number[] = [];
  for (const ch of Array.from(toPrintable(text, cp))) {
    const c = ch.charCodeAt(0);
    if (c < 0x80) bytes.push(c);
    else bytes.push(table.get(ch) ?? 0x3f);
  }
  return bytes;
}

/** Bytes UTF-8 de un texto (para datos de QR). Sin TextEncoder para máxima compatibilidad. */
export function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of Array.from(text)) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}
