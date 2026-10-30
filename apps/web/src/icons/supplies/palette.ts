// Paleta compartida para los íconos de insumos (viewBox 64×64).
// Mantener 2–4 rellenos por ícono, tomados de aquí, para que la biblioteca se vea consistente.

export const C = {
  red: '#E63946',
  wine: '#9B2242',
  pink: '#FF8FAB',
  magenta: '#D6336C',
  orange: '#F77F00',
  amber: '#F4A300',
  yellow: '#F4C430',
  butter: '#FFE38A',
  cream: '#FFE8C2',
  tan: '#E0A458',
  kraft: '#D4A373',
  brown: '#8D5524',
  choco: '#5E3217',
  leaf: '#52B788',
  mint: '#95D5B2',
  lime: '#C9E77B',
  olive: '#6A994E',
  dkgreen: '#2D6A4F',
  sky: '#4CC9F0',
  ice: '#CAF0F8',
  blue: '#4361EE',
  purple: '#7B2CBF',
  lilac: '#B57EDC',
  grey: '#ADB5BD',
  silver: '#DEE2E6',
  steel: '#6C757D',
  dark: '#343A40',
  white: '#FFFFFF',
} as const;

/** Color del contorno: un café casi negro, legible sobre fondos claros y oscuros. */
export const OUTLINE = '#1f1a17';

/** Contorno principal (spread en las figuras principales). */
export const S = {
  stroke: OUTLINE,
  strokeWidth: 2.5,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
};

/** Línea de detalle (sin relleno). */
export const L = {
  stroke: OUTLINE,
  strokeWidth: 2,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
  fill: 'none',
};

/** Brillo blanco semitransparente. */
export const HL = {
  stroke: '#FFFFFF',
  strokeWidth: 3,
  strokeLinecap: 'round' as const,
  fill: 'none',
  opacity: 0.6,
};
