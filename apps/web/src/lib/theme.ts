// Aplica los colores de marca del negocio a las variables CSS (--brand, --brand-50, ...).

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  a.map((v, i) => Math.round(v + (b[i] - v) * t)) as [number, number, number];

export function applyBrand(primary?: string | null) {
  const rgb = primary ? hexToRgb(primary) : null;
  if (!rgb) return;
  const root = document.documentElement.style;
  const fmt = (c: number[]) => c.join(' ');
  root.setProperty('--brand', fmt(rgb));
  root.setProperty('--brand-50', fmt(mix(rgb, [255, 255, 255], 0.92)));
  root.setProperty('--brand-100', fmt(mix(rgb, [255, 255, 255], 0.82)));
  root.setProperty('--brand-600', fmt(mix(rgb, [0, 0, 0], 0.12)));
  root.setProperty('--brand-700', fmt(mix(rgb, [0, 0, 0], 0.26)));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', primary!);
}

/** Color de texto legible (negro/blanco) sobre un fondo hex. */
export function readableOn(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#fff';
  const [r, g, b] = rgb;
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#1c1917' : '#ffffff';
}
