import { C, S, L, HL } from '../palette';

export const panaderia: Record<string, JSX.Element> = {
  // Bolillo
  bread: (
    <>
      <path d="M6 36 C6 24 20 18 32 18 C44 18 58 24 58 36 C58 46 46 50 32 50 C18 50 6 46 6 36 Z" fill={C.tan} {...S} />
      <path d="M20 28 C26 34 38 34 44 28" {...L} stroke={C.brown} strokeWidth={3} />
      <path d="M22 30 C28 28 36 28 42 30" {...L} stroke={C.cream} strokeWidth={2.5} />
      <path d="M12 34 C12 30 15 27 19 25" {...HL} />
    </>
  ),
  'burger-bun': (
    <>
      <path d="M8 44 H56 V48 C56 52 52 54 48 54 H16 C12 54 8 52 8 48 Z" fill={C.tan} {...S} />
      <path d="M8 38 C8 22 20 12 32 12 C44 12 56 22 56 38 Z" fill={C.amber} {...S} />
      <path d="M8 38 H56 V42 H8 Z" fill={C.cream} {...S} strokeWidth={2} />
      <g fill={C.cream}>
        <ellipse cx={22} cy={24} rx={1.6} ry={1} transform="rotate(-30 22 24)" />
        <ellipse cx={30} cy={19} rx={1.6} ry={1} />
        <ellipse cx={40} cy={22} rx={1.6} ry={1} transform="rotate(30 40 22)" />
        <ellipse cx={35} cy={28} rx={1.6} ry={1} />
        <ellipse cx={26} cy={30} rx={1.6} ry={1} />
        <ellipse cx={46} cy={30} rx={1.6} ry={1} />
      </g>
      <path d="M14 30 C15 25 18 21 22 18" {...HL} />
    </>
  ),
  'hotdog-bun': (
    <>
      <path d="M8 38 C8 30 14 26 20 28 H44 C50 26 56 30 56 38 C56 46 50 50 44 50 H20 C14 50 8 46 8 38 Z" fill={C.tan} {...S} />
      <rect x={10} y={30} width={44} height={10} rx={5} fill={C.wine} {...S} />
      <path d="M16 35 C20 31 24 39 28 35 C32 31 36 39 40 35 C44 31 48 39 50 35" {...L} stroke={C.yellow} strokeWidth={2.5} />
      <path d="M8 36 C8 42 14 46 20 46 H44 C50 46 56 42 56 36 C56 44 52 50 44 50 H20 C12 50 8 44 8 36 Z" fill={C.amber} {...S} />
    </>
  ),
  croissant: (
    <>
      <path d="M6 42 C4 36 8 32 14 34 L20 38 Z" fill={C.amber} {...S} />
      <path d="M58 42 C60 36 56 32 50 34 L44 38 Z" fill={C.amber} {...S} />
      <path d="M12 34 C10 26 16 20 22 22 L28 36 C22 42 14 40 12 34 Z" fill={C.amber} {...S} />
      <path d="M52 34 C54 26 48 20 42 22 L36 36 C42 42 50 40 52 34 Z" fill={C.amber} {...S} />
      <path d="M20 22 C22 14 42 14 44 22 L38 42 C34 46 30 46 26 42 Z" fill={C.yellow} {...S} />
      <path d="M26 22 C26 28 28 34 30 40 M38 22 C38 28 36 34 34 40" {...L} stroke={C.amber} strokeWidth={2.5} />
      <path d="M26 20 C28 18 30 18 32 18" {...HL} />
    </>
  ),
  cake: (
    <>
      <path d="M8 34 H56 V54 C56 56 54 58 52 58 H12 C10 58 8 56 8 54 Z" fill={C.cream} {...S} />
      <path d="M8 44 H56" {...L} stroke={C.pink} strokeWidth={4} />
      <path d="M8 34 C8 28 12 26 16 26 H48 C52 26 56 28 56 34 V38 C52 42 48 36 44 40 C40 44 36 36 32 40 C28 44 24 36 20 40 C16 44 12 38 8 40 Z" fill={C.pink} {...S} />
      <rect x={30} y={12} width={4} height={14} rx={1} fill={C.sky} {...S} strokeWidth={2} />
      <path d="M32 4 C35 8 35 10 32 11 C29 10 29 8 32 4 Z" fill={C.orange} {...S} strokeWidth={1.6} />
      <circle cx={18} cy={24} r={3} fill={C.red} {...S} strokeWidth={1.8} />
      <circle cx={46} cy={24} r={3} fill={C.red} {...S} strokeWidth={1.8} />
    </>
  ),
};
