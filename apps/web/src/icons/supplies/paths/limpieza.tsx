import { C, S, L, HL } from '../palette';

export const limpieza: Record<string, JSX.Element> = {
  // Detergente en polvo: caja con burbujas
  detergent: (
    <>
      <g fill={C.white} stroke="#1f1a17" strokeWidth={1.8}>
        <circle cx={22} cy={10} r={4} />
        <circle cx={32} cy={8} r={5} />
        <circle cx={42} cy={12} r={3.5} />
      </g>
      <path d="M12 18 H52 V54 C52 56 50 58 48 58 H16 C14 58 12 56 12 54 Z" fill={C.orange} {...S} />
      <path d="M12 18 H52 V24 H12 Z" fill={C.blue} {...S} />
      <circle cx={32} cy={40} r={10} fill={C.sky} {...S} />
      <path d="M26 40 C28 36 36 36 38 40 C36 44 28 44 26 40 Z" fill={C.white} />
      <path d="M17 30 V36" {...HL} />
    </>
  ),
  // Lavatrastes: botella con plato y burbujas
  'dish-soap': (
    <>
      <path d="M32 4 H40 V8 H34 V12" fill="none" stroke="#1f1a17" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 4 H40 V8 H34 V12" fill="none" stroke={C.white} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={28} y={10} width={10} height={6} rx={1.5} fill={C.white} {...S} />
      <path d="M24 16 H42 C46 20 48 24 46 30 C44 34 44 40 46 46 C48 52 46 58 42 58 H24 C20 58 18 52 20 46 C22 40 22 34 20 30 C18 24 20 20 24 16 Z" fill={C.leaf} {...S} />
      <ellipse cx={33} cy={40} rx={8} ry={8} fill={C.white} {...S} strokeWidth={2} />
      <ellipse cx={33} cy={40} rx={4} ry={4} {...L} stroke={C.silver} />
      <g fill={C.white} stroke="#1f1a17" strokeWidth={1.6}>
        <circle cx={12} cy={22} r={4} />
        <circle cx={8} cy={32} r={2.5} />
        <circle cx={54} cy={24} r={3} />
      </g>
      <path d="M25 22 V28" {...HL} />
    </>
  ),
  // Cloro: galón blanco con asa y tapa azul
  bleach: (
    <>
      <rect x={18} y={4} width={12} height={7} rx={1.5} fill={C.blue} {...S} />
      <path d="M20 11 H28 V16 H36 C38 10 46 8 50 12 C54 16 54 22 52 26 V54 C52 56 50 58 48 58 H14 C12 58 10 56 10 54 V24 C10 20 14 16 20 16 Z" fill={C.white} {...S} />
      <path d="M40 16 C42 13 46 13 47 16 C48 19 46 22 42 22" {...L} />
      <rect x={10} y={30} width={42} height={16} fill={C.sky} {...S} strokeWidth={2} />
      <path d="M31 33 C27 38 27 42 31 43 C35 42 35 38 31 33 Z" fill={C.white} {...S} strokeWidth={1.6} />
      <path d="M15 22 V26" {...HL} stroke={C.silver} />
    </>
  ),
  // Fibra / esponja bicolor
  sponge: (
    <>
      <path d="M8 26 L18 18 H56 L46 26 Z" fill={C.leaf} {...S} />
      <path d="M8 26 H46 V34 H8 Z" fill={C.dkgreen} {...S} />
      <path d="M46 26 L56 18 V26 L46 34 Z" fill={C.dkgreen} {...S} />
      <path d="M8 34 H46 V50 H8 Z" fill={C.yellow} {...S} />
      <path d="M46 34 L56 26 V42 L46 50 Z" fill={C.amber} {...S} />
      <g fill={C.amber}>
        <circle cx={16} cy={41} r={2} />
        <circle cx={26} cy={44} r={1.6} />
        <circle cx={36} cy={40} r={2} />
        <circle cx={22} cy={39} r={1.2} />
      </g>
    </>
  ),
  // Bolsa negra de basura amarrada
  'trash-bag': (
    <>
      <path d="M26 16 L20 6 L30 10 L32 4 L34 10 L44 6 L38 16 Z" fill={C.dark} {...S} />
      <path d="M26 16 H38 C50 22 56 34 54 46 C52 56 44 58 32 58 C20 58 12 56 10 46 C8 34 14 22 26 16 Z" fill={C.dark} {...S} />
      <rect x={26} y={14} width={12} height={5} rx={2} fill={C.yellow} {...S} strokeWidth={2} />
      <path d="M18 34 C18 30 20 27 23 25" {...HL} opacity={0.4} />
      <path d="M28 30 L26 52 M38 30 L42 50" {...L} stroke={C.steel} strokeWidth={2} />
    </>
  ),
  'toilet-paper': (
    <>
      <path d="M46 40 V56 L42 54 L38 56 L34 54 L30 56 V40" fill={C.white} {...S} />
      <path d="M12 18 V46 C12 52 18 56 26 56 C34 56 40 52 40 46 V18" fill={C.white} {...S} />
      <path d="M30 40 H46 V44" {...L} />
      <ellipse cx={26} cy={18} rx={14} ry={9} fill={C.white} {...S} />
      <ellipse cx={26} cy={18} rx={5} ry={3.5} fill={C.kraft} {...S} strokeWidth={2} />
      <path d="M18 30 V44" {...HL} stroke={C.silver} opacity={1} />
      <path d="M12 46 C12 52 18 56 26 56 C34 56 40 52 40 46 V40 H46" fill="none" {...S} />
    </>
  ),
  // Trapeador
  mop: (
    <>
      <path d="M40 4 L30 38" fill="none" stroke="#1f1a17" strokeWidth={8} strokeLinecap="round" />
      <path d="M40 4 L30 38" fill="none" stroke={C.brown} strokeWidth={3.5} strokeLinecap="round" />
      <rect x={22} y={34} width={16} height={8} rx={2} fill={C.blue} {...S} />
      <path d="M22 42 C16 48 12 54 12 58 H48 C48 54 44 48 38 42 Z" fill={C.white} {...S} />
      <path d="M20 46 L16 58 M26 44 L24 58 M32 44 V58 M38 44 L40 58 M42 48 L45 58" {...L} stroke={C.grey} strokeWidth={2} />
      <path d="M8 58 H56" {...L} stroke={C.sky} strokeWidth={0} />
    </>
  ),
  // Desinfectante multiusos: botella con atomizador (spray)
  disinfectant: (
    <>
      <path d="M22 18 V10 C22 7 24 6 27 6 H42 L46 12 H38 V18" fill={C.purple} {...S} />
      <path d="M30 18 L28 26 H36 L34 18" fill={C.purple} {...S} />
      <path d="M50 8 L56 6 M50 12 H57 M50 16 L56 18" {...L} stroke={C.sky} strokeWidth={2.5} />
      <path d="M20 18 H38 V26 C42 30 44 34 44 40 V54 C44 56 42 58 40 58 H18 C16 58 14 56 14 54 V40 C14 32 18 28 20 26 Z" fill={C.lilac} {...S} />
      <rect x={14} y={38} width={30} height={12} fill={C.white} {...S} strokeWidth={2} />
      <path d="M24 44 L28 48 L36 40" {...L} stroke={C.leaf} strokeWidth={3} />
      <path d="M20 30 V34" {...HL} />
    </>
  ),
};
