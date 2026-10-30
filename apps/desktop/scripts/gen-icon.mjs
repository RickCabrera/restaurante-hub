// Genera el ícono de la app (PNG 512x512) solo con módulos integrados de Node (zlib).
// Fondo naranja redondeado con las iniciales "RH" en blanco.
//   node scripts/gen-icon.mjs   → resources/icon.png y build/icon.png
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 512;
const BG = [249, 115, 22]; // #f97316
const FG = [255, 255, 255];

// Fuente de 5x7 para R y H
const GLYPHS = {
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
};

const px = Buffer.alloc(SIZE * SIZE * 4);
const radius = 96;
const inRounded = (x, y) => {
  const cx = x < radius ? radius : x > SIZE - 1 - radius ? SIZE - 1 - radius : x;
  const cy = y < radius ? radius : y > SIZE - 1 - radius ? SIZE - 1 - radius : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    if (inRounded(x, y)) {
      px[i] = BG[0]; px[i + 1] = BG[1]; px[i + 2] = BG[2]; px[i + 3] = 255;
    }
  }
}
// dibujar "RH": celdas de 30 px, separación de 1 celda
const cell = 30;
const text = 'RH';
const textW = (text.length * 5 + (text.length - 1)) * cell;
const textH = 7 * cell;
const x0 = Math.round((SIZE - textW) / 2);
const y0 = Math.round((SIZE - textH) / 2);
[...text].forEach((ch, k) => {
  GLYPHS[ch].forEach((row, r) => {
    [...row].forEach((bit, c) => {
      if (bit !== '1') return;
      const gx = x0 + (k * 6 + c) * cell;
      const gy = y0 + r * cell;
      for (let y = gy; y < gy + cell; y++) {
        for (let x = gx; x < gx + cell; x++) {
          const i = (y * SIZE + x) * 4;
          px[i] = FG[0]; px[i + 1] = FG[1]; px[i + 2] = FG[2]; px[i + 3] = 255;
        }
      }
    });
  });
});

// --- codificar PNG ---
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // profundidad
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filtro none
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

for (const dir of ['resources', 'build']) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, dir, 'icon.png'), png);
}
console.log(`icon.png ${SIZE}x${SIZE} (${png.length} bytes) → resources/, build/`);
