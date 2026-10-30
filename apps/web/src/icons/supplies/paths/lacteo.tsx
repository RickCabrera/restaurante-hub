import { C, S, L, HL } from '../palette';

export const lacteo: Record<string, JSX.Element> = {
  // Cartón de leche
  milk: (
    <>
      <path d="M18 22 L24 10 H40 L46 22 Z" fill={C.blue} {...S} />
      <rect x={24} y={6} width={16} height={5} rx={1} fill={C.blue} {...S} />
      <rect x={18} y={22} width={28} height={36} rx={2} fill={C.white} {...S} />
      <path d="M18 22 H46" {...L} />
      <path d="M18 44 C24 40 28 48 34 44 C38 41 42 44 46 42 V58 H18 Z" fill={C.sky} />
      <rect x={18} y={22} width={28} height={36} rx={2} fill="none" {...S} />
      <ellipse cx={32} cy={33} rx={6} ry={5} fill={C.blue} />
      <path d="M30 30.5 C31 30 33 30 34 30.5" {...L} stroke={C.white} strokeWidth={1.5} />
    </>
  ),
  cheese: (
    <>
      <path d="M8 30 L46 14 L56 28 V48 L8 52 Z" fill={C.yellow} {...S} />
      <path d="M8 30 L56 28" {...L} strokeWidth={2.5} />
      <path d="M8 30 L46 14 L56 28 Z" fill={C.butter} {...S} />
      <g fill={C.amber} {...S} strokeWidth={2}>
        <circle cx={20} cy={40} r={4} />
        <circle cx={38} cy={44} r={3} />
        <circle cx={46} cy={36} r={2.5} />
      </g>
      <ellipse cx={34} cy={23} rx={3} ry={1.6} fill={C.amber} />
    </>
  ),
  // Botella/frasco de crema
  cream: (
    <>
      <path d="M20 22 C20 18 24 16 24 12 H40 C40 16 44 18 44 22 V54 C44 56 42 58 40 58 H24 C22 58 20 56 20 54 Z" fill={C.white} {...S} />
      <rect x={23} y={6} width={18} height={7} rx={2} fill={C.red} {...S} />
      <rect x={20} y={30} width={24} height={16} fill={C.leaf} {...S} />
      <path d="M26 38 C28 34 36 34 38 38 C36 42 28 42 26 38 Z" fill={C.white} />
      <path d="M24 24 V28" {...HL} stroke={C.grey} />
    </>
  ),
  // Mantequilla: barra con cuchillo untador
  butter: (
    <>
      <path d="M6 42 L20 34 H58 L44 42 Z" fill={C.butter} {...S} />
      <path d="M6 42 H44 V56 H6 Z" fill={C.yellow} {...S} />
      <path d="M44 42 L58 34 V48 L44 56 Z" fill={C.amber} {...S} />
      <path d="M22 39 C24 36 30 36 32 39" {...L} stroke={C.amber} strokeWidth={2} />
      <path d="M10 49 H22" {...HL} />
      <path d="M26 36 C26 30 34 18 42 16 L46 20 C42 26 34 34 30 37 Z" fill={C.silver} {...S} />
      <path d="M44 18 L54 6" fill="none" stroke="#1f1a17" strokeWidth={10} strokeLinecap="round" />
      <path d="M44 18 L54 6" fill="none" stroke={C.brown} strokeWidth={5.5} strokeLinecap="round" />
    </>
  ),
  yogurt: (
    <>
      <path d="M14 18 H50 L46 54 C46 56 44 58 42 58 H22 C20 58 18 56 18 54 Z" fill={C.white} {...S} />
      <path d="M16 32 H48 L46.6 46 H17.4 Z" fill={C.pink} />
      <path d="M14 18 H50 L46 54 C46 56 44 58 42 58 H22 C20 58 18 56 18 54 Z" fill="none" {...S} />
      <ellipse cx={32} cy={18} rx={20} ry={5} fill={C.silver} {...S} />
      <path d="M44 15 C48 10 54 9 56 12" fill="none" {...S} stroke={C.steel} />
      <circle cx={32} cy={39} r={3.5} fill={C.red} />
    </>
  ),
  'ice-cream': (
    <>
      <path d="M18 34 L32 60 L46 34 Z" fill={C.tan} {...S} />
      <path d="M22 38 L36 52 M28 36 L40 46 M42 38 L28 52 M36 36 L24 46" {...L} stroke={C.brown} strokeWidth={1.8} />
      <circle cx={32} cy={20} r={10} fill={C.choco} {...S} />
      <path d="M14 30 C12 22 18 18 24 20 C30 18 36 22 34 28 C34 34 28 36 24 34 C20 36 14 36 14 30 Z" fill={C.pink} {...S} />
      <path d="M30 28 C30 22 36 18 42 20 C48 20 52 24 50 30 C50 36 44 36 40 34 C36 36 30 34 30 28 Z" fill={C.cream} {...S} />
      <path d="M17 26 C18 24 20 23 22 23" {...HL} />
      <circle cx={32} cy={10} r={3.5} fill={C.red} {...S} strokeWidth={2} />
    </>
  ),
};
