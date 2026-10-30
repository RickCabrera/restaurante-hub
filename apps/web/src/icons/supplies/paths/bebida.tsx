import { C, S, L, HL } from '../palette';

export const bebida: Record<string, JSX.Element> = {
  // Garrafón de 20 L
  'water-jug': (
    <>
      <rect x={26} y={4} width={12} height={7} rx={2} fill={C.blue} {...S} />
      <path d="M28 11 H36 V15 C46 17 52 22 52 30 V52 C52 55 50 58 46 58 H18 C14 58 12 55 12 52 V30 C12 22 18 17 28 15 Z" fill={C.sky} {...S} />
      <path d="M12.5 36 C20 33 28 39 36 36 C42 34 47 35 51.5 36 V52 C51.5 55 49.5 57.5 46 57.5 H18 C14.5 57.5 12.5 55 12.5 52 Z" fill={C.blue} opacity={0.55} />
      <path d="M12 30 H52 M12 46 H52" {...L} strokeWidth={2.2} />
      <path d="M18 34 V42" {...HL} strokeWidth={4} />
      <path d="M32 22 C29 26 29 28 32 29 C35 28 35 26 32 22 Z" fill={C.white} {...S} strokeWidth={1.6} />
    </>
  ),
  'water-bottle': (
    <>
      <rect x={26} y={4} width={12} height={6} rx={1.5} fill={C.blue} {...S} />
      <path d="M27 10 H37 V15 C42 18 44 22 44 26 V54 C44 56 42 58 40 58 H24 C22 58 20 56 20 54 V26 C20 22 22 18 27 15 Z" fill={C.ice} {...S} />
      <rect x={20} y={32} width={24} height={12} fill={C.sky} {...S} strokeWidth={2} />
      <path d="M32 34.5 C30 37 30 39 32 40 C34 39 34 37 32 34.5 Z" fill={C.white} />
      <path d="M20 26 H44 M20 50 H44" {...L} strokeWidth={1.8} />
      <path d="M25 22 V28" {...HL} />
    </>
  ),
  // Refresco de cola: botella contorneada roja/oscura
  soda: (
    <>
      <rect x={27} y={3} width={10} height={6} rx={1.5} fill={C.red} {...S} />
      <path d="M28 9 H36 V14 C40 18 42 22 41 28 C40 32 39 34 40 38 C42 44 42 50 41 54 C41 56 40 58 37 58 H27 C24 58 23 56 23 54 C22 50 22 44 24 38 C25 34 24 32 23 28 C22 22 24 18 28 14 Z" fill={C.choco} {...S} />
      <path d="M23.5 30 H40.5 V40 H23.5 Z" fill={C.red} {...S} strokeWidth={2} />
      <path d="M26 35 C30 32 34 38 38 35" {...L} stroke={C.white} strokeWidth={2.2} />
      <path d="M27 18 V24 M27 44 V50" {...HL} />
    </>
  ),
  // Jugo: cartón con popote y naranja
  juice: (
    <>
      <path d="M16 20 L22 10 H42 L48 20 Z" fill={C.amber} {...S} />
      <rect x={16} y={20} width={32} height={38} rx={2} fill={C.yellow} {...S} />
      <path d="M38 10 L42 2" {...L} strokeWidth={0} />
      <path d="M36 12 L40 2 H46" fill="none" stroke="#1f1a17" strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 12 L40 2 H46" fill="none" stroke={C.red} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={32} cy={40} r={10} fill={C.orange} {...S} />
      <path d="M32 31 V49 M23 40 H41 M26 34 L38 46 M38 34 L26 46" {...L} stroke={C.butter} strokeWidth={1.8} />
      <circle cx={32} cy={40} r={10} fill="none" {...S} />
      <path d="M32 29 C34 25 38 25 40 26 C38 30 35 30 32 29 Z" fill={C.leaf} {...S} strokeWidth={1.6} />
    </>
  ),
  // Agua mineral: botella verde con burbujas
  'mineral-water': (
    <>
      <rect x={27} y={3} width={10} height={6} rx={1.5} fill={C.silver} {...S} />
      <path d="M28 9 H36 V16 C42 20 44 24 44 30 V54 C44 56 42 58 40 58 H24 C22 58 20 56 20 54 V30 C20 24 22 20 28 16 Z" fill={C.leaf} {...S} />
      <rect x={20} y={34} width={24} height={12} fill={C.butter} {...S} strokeWidth={2} />
      <path d="M26 40 H38" {...L} stroke={C.red} strokeWidth={3} />
      <g fill={C.white} stroke="#1f1a17" strokeWidth={1.5}>
        <circle cx={51} cy={22} r={3.5} />
        <circle cx={55} cy={34} r={2.5} />
        <circle cx={50} cy={44} r={3} />
        <circle cx={12} cy={26} r={2.5} />
        <circle cx={10} cy={40} r={3.5} />
      </g>
      <path d="M25 24 V30 M25 50 V53" {...HL} />
    </>
  ),
  // Bebida energética: lata delgada con rayo
  'energy-drink': (
    <>
      <path d="M20 10 C20 7 44 7 44 10 V54 C44 58 20 58 20 54 Z" fill={C.dark} {...S} />
      <ellipse cx={32} cy={10} rx={12} ry={3.5} fill={C.silver} {...S} />
      <path d="M35 16 L24 36 H31 L28 50 L40 28 H33 Z" fill={C.lime} {...S} strokeWidth={2} />
      <path d="M24 16 V22 M24 46 V50" {...HL} />
    </>
  ),
};
