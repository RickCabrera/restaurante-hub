import { describe, expect, it } from 'vitest';
import { PrintDocument, charsPerLine } from './document';
import { renderEscPos } from './escpos';
import { encodeText, toPrintable } from './codepage';
import { layoutColumns, layoutRow, wrapText } from './layout';
import { buildCustomerTicket, buildKitchenTicket, buildTestTicket } from './templates';

const doc = (blocks: PrintDocument['blocks'], paperWidth: 58 | 80 = 80): PrintDocument => ({ title: 't', paperWidth, blocks });
const bytes = (u: Uint8Array) => Array.from(u);

function indexOfSeq(hay: number[], needle: number[], from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
const count = (hay: number[], needle: number[]) => {
  let n = 0;
  let i = -1;
  while ((i = indexOfSeq(hay, needle, i + 1)) !== -1) n++;
  return n;
};

describe('renderEscPos — ESC/POS', () => {
  it('inicia con ESC @ y selecciona CP858 (ESC t 19)', () => {
    const b = bytes(renderEscPos(doc([])));
    expect(b.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 19]);
  });

  it('CP850 usa ESC t 2', () => {
    const b = bytes(renderEscPos(doc([]), { codepage: 'CP850' }));
    expect(b.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 2]);
  });

  it('negritas, subrayado, invertido, tamaño y alineación', () => {
    const b = bytes(renderEscPos(doc([{ type: 'text', text: 'Hola', bold: true, underline: true, invert: true, size: 2, align: 'center' }])));
    expect(indexOfSeq(b, [0x1b, 0x61, 1])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1b, 0x45, 1])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1b, 0x2d, 1])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1d, 0x42, 1])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1d, 0x21, 0x11])).toBeGreaterThan(-1);
    const hola = indexOfSeq(b, [...'Hola'].map((c) => c.charCodeAt(0)));
    expect(hola).toBeGreaterThan(indexOfSeq(b, [0x1b, 0x45, 1]));
    // después del texto se apagan los estilos
    expect(indexOfSeq(b, [0x1b, 0x45, 0], hola)).toBeGreaterThan(hola);
    expect(indexOfSeq(b, [0x1d, 0x21, 0x00], hola)).toBeGreaterThan(hola);
  });

  it('tamaño 3 = GS ! 0x22', () => {
    const b = bytes(renderEscPos(doc([{ type: 'text', text: 'X', size: 3 }])));
    expect(indexOfSeq(b, [0x1d, 0x21, 0x22])).toBeGreaterThan(-1);
  });

  it('corte total y parcial (GS V)', () => {
    const b = bytes(renderEscPos(doc([{ type: 'cut' }, { type: 'cut', partial: true }])));
    expect(indexOfSeq(b, [0x1d, 0x56, 65, 0])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1d, 0x56, 66, 0])).toBeGreaterThan(-1);
  });

  it('cut:false ignora los cortes; cut:true agrega uno si no hay', () => {
    expect(indexOfSeq(bytes(renderEscPos(doc([{ type: 'cut' }]), { cut: false })), [0x1d, 0x56])).toBe(-1);
    expect(indexOfSeq(bytes(renderEscPos(doc([{ type: 'text', text: 'a' }]), { cut: true })), [0x1d, 0x56, 65, 0])).toBeGreaterThan(-1);
  });

  it('cajón de dinero ESC p 0 25 250', () => {
    const withBlock = bytes(renderEscPos(doc([{ type: 'drawer' }])));
    expect(indexOfSeq(withBlock, [0x1b, 0x70, 0, 25, 250])).toBeGreaterThan(-1);
    const byOpt = bytes(renderEscPos(doc([]), { openDrawer: true }));
    expect(indexOfSeq(byOpt, [0x1b, 0x70, 0, 25, 250])).toBeGreaterThan(-1);
    const disabled = bytes(renderEscPos(doc([{ type: 'drawer' }]), { openDrawer: false }));
    expect(indexOfSeq(disabled, [0x1b, 0x70])).toBe(-1);
  });

  it('beep Epson ESC ( A', () => {
    const b = bytes(renderEscPos(doc([{ type: 'beep', times: 2 }])));
    expect(indexOfSeq(b, [0x1b, 0x28, 0x41, 4, 0, 48, 51, 2, 10])).toBeGreaterThan(-1);
  });

  it('QR nativo GS ( k modelo 2, tamaño, nivel M, datos e impresión', () => {
    const data = 'https://maps.google.com/?q=1,2';
    const b = bytes(renderEscPos(doc([{ type: 'qr', data, size: 6 }])));
    expect(indexOfSeq(b, [0x1d, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x43, 6])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31])).toBeGreaterThan(-1);
    const n = data.length + 3;
    const store = indexOfSeq(b, [0x1d, 0x28, 0x6b, n & 0xff, n >> 8, 0x31, 0x50, 0x30]);
    expect(store).toBeGreaterThan(-1);
    expect(String.fromCharCode(...b.slice(store + 8, store + 8 + data.length))).toBe(data);
    expect(indexOfSeq(b, [0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30])).toBeGreaterThan(store);
  });

  it('código de barras CODE128 y EAN13 (GS k)', () => {
    const b = bytes(renderEscPos(doc([{ type: 'barcode', data: 'P-0123' }, { type: 'barcode', data: '750100000001', kind: 'EAN13' }])));
    expect(indexOfSeq(b, [0x1d, 0x6b, 73, 8, 0x7b, 0x42, ...'P-0123'.split('').map((c) => c.charCodeAt(0))])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1d, 0x6b, 67, 12])).toBeGreaterThan(-1);
  });

  it('copias repiten el documento completo', () => {
    const b = bytes(renderEscPos(doc([{ type: 'text', text: 'ABC' }, { type: 'cut' }]), { copies: 3 }));
    expect(count(b, [0x1b, 0x40])).toBe(3);
    expect(count(b, [0x1d, 0x56, 65, 0])).toBe(3);
  });

  it('el cajón se abre una sola vez aunque haya copias', () => {
    const b = bytes(renderEscPos(doc([{ type: 'drawer' }]), { copies: 2 }));
    expect(count(b, [0x1b, 0x70, 0, 25, 250])).toBe(1);
  });

  it('las imágenes se omiten', () => {
    const b = renderEscPos(doc([{ type: 'image', url: 'https://x/logo.png' }]));
    expect(b.length).toBe(5);
  });

  it('separador ocupa todo el ancho', () => {
    const b = bytes(renderEscPos(doc([{ type: 'line' }], 58)));
    expect(count(b, [0x2d])).toBe(32);
    const b2 = bytes(renderEscPos(doc([{ type: 'line', char: '=' }], 80)));
    expect(count(b2, [0x3d])).toBe(48);
  });
});

describe('renderEscPos — STAR', () => {
  it('init + code page Star (ESC GS t 4)', () => {
    const b = bytes(renderEscPos(doc([]), { dialect: 'STAR' }));
    expect(b.slice(0, 6)).toEqual([0x1b, 0x40, 0x1b, 0x1d, 0x74, 4]);
  });
  it('corte Star ESC d 2/3 en vez de GS V', () => {
    const b = bytes(renderEscPos(doc([{ type: 'cut' }, { type: 'cut', partial: true }]), { dialect: 'STAR' }));
    expect(indexOfSeq(b, [0x1b, 0x64, 2])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1b, 0x64, 3])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1d, 0x56])).toBe(-1);
  });
  it('negritas Star ESC E / ESC F, cajón BEL, QR ESC GS y', () => {
    const b = bytes(renderEscPos(doc([{ type: 'text', text: 'a', bold: true }, { type: 'drawer' }, { type: 'qr', data: 'x' }]), { dialect: 'STAR' }));
    expect(indexOfSeq(b, [0x1b, 0x45])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1b, 0x46])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1b, 0x07, 0x14, 0x14, 0x07])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1b, 0x1d, 0x79, 0x53, 0x30, 2])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1b, 0x1d, 0x79, 0x44, 0x31, 0, 1, 0, 0x78])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1b, 0x1d, 0x79, 0x50])).toBeGreaterThan(-1);
    expect(indexOfSeq(b, [0x1d, 0x28, 0x6b])).toBe(-1);
  });
});

describe('página de códigos', () => {
  it('codifica acentos del español en CP858', () => {
    expect(encodeText('áéíóúñÑüÜ¿¡°')).toEqual([0xa0, 0x82, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0x81, 0x9a, 0xa8, 0xad, 0xf8]);
    expect(encodeText('ÁÉÍÓÚ')).toEqual([0xb5, 0x90, 0xd6, 0xe0, 0xe9]);
  });
  it('€ = 0xD5 en CP858 y "EUR" en CP850', () => {
    expect(encodeText('€', 'CP858')).toEqual([0xd5]);
    expect(encodeText('€', 'CP850')).toEqual([0x45, 0x55, 0x52]);
  });
  it('caracteres desconocidos: sin diacríticos o "?"', () => {
    expect(toPrintable('ăčŝ “hola” — 😀')).toBe('acs "hola" - ?');
  });
  it('el texto acentuado del ticket llega codificado', () => {
    const b = bytes(renderEscPos(doc([{ type: 'text', text: 'Jalapeño' }])));
    expect(indexOfSeq(b, [0x4a, 0x61, 0x6c, 0x61, 0x70, 0x65, 0xa4, 0x6f, 0x0a])).toBeGreaterThan(-1);
  });
});

describe('maquetado', () => {
  it('charsPerLine', () => {
    expect(charsPerLine(58)).toBe(32);
    expect(charsPerLine(80)).toBe(48);
    expect(charsPerLine(80, 2)).toBe(24);
  });
  it('row rellena a 32 y 48 columnas', () => {
    const r32 = layoutRow('Subtotal', '$120.00', 32);
    expect(r32).toEqual(['Subtotal' + ' '.repeat(32 - 8 - 7) + '$120.00']);
    const r48 = layoutRow('TOTAL', '$1,250.50', 48);
    expect(r48[0].length).toBe(48);
    expect(r48[0].startsWith('TOTAL')).toBe(true);
    expect(r48[0].endsWith('$1,250.50')).toBe(true);
  });
  it('row parte texto izquierdo largo y deja el precio en el primer renglón', () => {
    const rows = layoutRow('2 x Hamburguesa doble con tocino y queso extra', '$250.00', 32);
    expect(rows.length).toBeGreaterThan(1);
    rows.forEach((r) => expect(r.length).toBe(32));
    expect(rows[0].endsWith('$250.00')).toBe(true);
  });
  it('row en documento a 58 mm produce renglón de 32', () => {
    const b = bytes(renderEscPos(doc([{ type: 'row', left: 'A', right: 'B' }], 58)));
    const a = b.indexOf(0x41);
    expect(b.slice(a, a + 32)).toEqual([0x41, ...Array(30).fill(0x20), 0x42]);
    expect(b[a + 32]).toBe(0x0a);
  });
  it('row de tamaño 2 usa la mitad de columnas', () => {
    const b = bytes(renderEscPos(doc([{ type: 'row', left: 'TOTAL', right: '$9', size: 2 }], 80)));
    const a = indexOfSeq(b, [0x54, 0x4f, 0x54]);
    expect(b.indexOf(0x0a, a) - a).toBe(24);
  });
  it('wrapText respeta palabras y sangría', () => {
    expect(wrapText('uno dos tres cuatro', 9)).toEqual(['uno dos', 'tres', 'cuatro']);
    expect(wrapText('   + sin cebolla ni jitomate', 16)).toEqual(['   + sin cebolla', '   ni jitomate']);
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });
  it('columns por fracción', () => {
    const rows = layoutColumns([{ text: 'Cant', width: 0.25 }, { text: 'Producto', width: 0.5 }, { text: '$10', width: 0.25, align: 'right' }], 32);
    expect(rows).toEqual(['Cant    Producto             $10']);
    expect(rows[0].length).toBe(32);
  });
});

describe('plantillas renderizan sin errores', () => {
  it('comanda, ticket de cliente y prueba', () => {
    const k = buildKitchenTicket({
      folio: 'P-0001', areaName: 'Cocina', createdAt: new Date().toISOString(), serviceLabel: 'DOMICILIO',
      lines: [{ quantity: 2, name: 'Tacos al pastor', modifiers: [{ name: 'Sin cebolla' }], note: 'Bien dorados' }],
    }, 58);
    expect(renderEscPos(k).length).toBeGreaterThan(50);
    const c = buildCustomerTicket({
      business: { name: 'Mi Restaurante', footer: '¡Gracias!' }, folio: 'P-1', createdAt: new Date().toISOString(),
      channelLabel: 'WhatsApp', typeLabel: 'Domicilio', customerName: 'Ana', customerPhone: '555', mapsUrl: 'https://maps.google.com/?q=1,2',
      lines: [{ quantity: 1, name: 'Pizza', totalCents: 15000 }], subtotalCents: 15000, discountCents: 0, deliveryFeeCents: 3000,
      totalCents: 18000, paymentLabel: 'Efectivo', cashGivenCents: 20000,
    });
    expect(renderEscPos(c, { dialect: 'STAR', copies: 2 }).length).toBeGreaterThan(100);
    expect(renderEscPos(buildTestTicket({ printerName: 'Caja', connectionLabel: 'Red', paperWidth: 80, createdAt: new Date().toISOString() })).length).toBeGreaterThan(50);
  });
});
