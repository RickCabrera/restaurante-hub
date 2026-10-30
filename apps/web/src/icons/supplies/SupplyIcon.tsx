import { SUPPLY_ICON_SVGS, hasSupplyIcon } from './svgs';

export interface SupplyIconProps {
  /** Clave de SUPPLY_ICONS (p. ej. 'tomato'). */
  icon?: string | null;
  /** Foto personalizada; tiene prioridad sobre `icon`. */
  imageUrl?: string | null;
  /** Nombre del insumo (accesibilidad y letra del fallback). */
  label?: string;
  /** Tamaño en px (ancho = alto). */
  size?: number;
  className?: string;
}

const FALLBACK_COLORS = [
  ['#FDE2E4', '#C1121F'],
  ['#FFE8C2', '#B85C00'],
  ['#FFF3B0', '#8A6A00'],
  ['#D8F3DC', '#2D6A4F'],
  ['#CAF0F8', '#0077B6'],
  ['#E0E7FF', '#3A0CA3'],
  ['#F3E8FF', '#7B2CBF'],
  ['#FFE5EC', '#D6336C'],
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function SupplyIcon({ icon, imageUrl, label, size = 96, className }: SupplyIconProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={label ?? ''}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={['object-contain rounded-xl', className].filter(Boolean).join(' ')}
        style={{ width: size, height: size }}
      />
    );
  }

  if (hasSupplyIcon(icon)) {
    return (
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        role="img"
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className={className}
        focusable="false"
      >
        {SUPPLY_ICON_SVGS[icon]}
      </svg>
    );
  }

  const text = (label ?? icon ?? '?').trim();
  const [bg, fg] = FALLBACK_COLORS[hashString(text.toLowerCase()) % FALLBACK_COLORS.length];
  const letter = (text.charAt(0) || '?').toUpperCase();
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      focusable="false"
    >
      <rect x={4} y={4} width={56} height={56} rx={16} fill={bg} />
      <text
        x={32}
        y={33}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={32}
        fontWeight={800}
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        fill={fg}
      >
        {letter}
      </text>
    </svg>
  );
}
