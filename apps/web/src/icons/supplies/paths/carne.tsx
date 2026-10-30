import { C, S, L, HL } from '../palette';

export const carne: Record<string, JSX.Element> = {
  // Pollo entero rostizado
  // Pollo: pierna (muslo) dorada, el ícono más universal
  chicken: (
    <>
      <path d="M38 38 L50 50" fill="none" stroke="#1f1a17" strokeWidth={11} strokeLinecap="round" />
      <path d="M38 38 L50 50" fill="none" stroke={C.cream} strokeWidth={6} strokeLinecap="round" />
      <circle cx={49} cy={56} r={4.5} fill={C.cream} {...S} />
      <circle cx={56} cy={49} r={4.5} fill={C.cream} {...S} />
      <path d="M50 51 L52 53" stroke={C.cream} strokeWidth={6} strokeLinecap="round" />
      <path d="M14 14 C24 4 42 6 46 20 C50 32 44 40 38 44 C32 48 22 46 16 40 C8 32 6 22 14 14 Z" fill={C.tan} {...S} />
      <path d="M20 16 C26 12 34 12 38 18" {...HL} strokeWidth={4} />
      <path d="M20 30 C24 34 30 36 36 34" {...L} stroke={C.brown} strokeWidth={2.2} />
    </>
  ),
  beef: (
    <>
      <path d="M10 30 C10 18 26 12 40 14 C52 16 57 26 54 36 C51 48 38 54 24 52 C14 51 10 42 10 30 Z" fill={C.red} {...S} />
      <path d="M18 30 C18 23 28 19 38 20 C47 21 50 28 47 35" {...L} stroke={C.white} strokeWidth={3.5} />
      <circle cx={36} cy={37} r={6} fill={C.white} {...S} />
      <circle cx={36} cy={37} r={2.2} fill={C.cream} />
      <path d="M20 42 L26 40 M42 24 L45 28" {...L} stroke={C.pink} strokeWidth={2.5} />
    </>
  ),
  // Chuleta de cerdo (rosa, con hueso en T)
  // Cerdo: cara de cochinito (lo más reconocible a golpe de vista)
  pork: (
    <>
      <path d="M12 22 L10 8 L24 14 Z" fill={C.pink} {...S} />
      <path d="M52 22 L54 8 L40 14 Z" fill={C.pink} {...S} />
      <circle cx={32} cy={35} r={21} fill={C.pink} {...S} />
      <ellipse cx={32} cy={42} rx={10} ry={7.5} fill="#FFB3C6" {...S} />
      <ellipse cx={28.5} cy={42} rx={1.8} ry={2.6} fill={C.dark} />
      <ellipse cx={35.5} cy={42} rx={1.8} ry={2.6} fill={C.dark} />
      <circle cx={23} cy={29} r={2.6} fill={C.dark} />
      <circle cx={41} cy={29} r={2.6} fill={C.dark} />
      <circle cx={16} cy={41} r={2.5} fill={C.magenta} opacity={0.5} />
      <circle cx={48} cy={41} r={2.5} fill={C.magenta} opacity={0.5} />
    </>
  ),
  bacon: (
    <>
      <path d="M10 18 C18 12 24 24 32 18 C40 12 46 24 54 18 L56 28 C48 34 42 22 34 28 C26 34 20 22 12 28 Z" fill={C.red} {...S} />
      <path d="M11 23 C19 17 25 29 33 23 C41 17 47 29 55 23" {...L} stroke={C.cream} strokeWidth={2.5} />
      <path d="M10 38 C18 32 24 44 32 38 C40 32 46 44 54 38 L56 48 C48 54 42 42 34 48 C26 54 20 42 12 48 Z" fill={C.red} {...S} />
      <path d="M11 43 C19 37 25 49 33 43 C41 37 47 49 55 43" {...L} stroke={C.cream} strokeWidth={2.5} />
    </>
  ),
  sausage: (
    <>
      <path d="M10 22 C14 46 40 54 54 40" fill="none" stroke="#1f1a17" strokeWidth={17} strokeLinecap="round" />
      <path d="M10 22 C14 46 40 54 54 40" fill="none" stroke={C.wine} strokeWidth={12} strokeLinecap="round" />
      <path d="M14 26 C18 40 32 46 44 42" {...HL} />
      <path d="M8 17 L5 13 M7 17 L10 13 M56 39 L60 36 M56 40 L60 42" {...L} strokeWidth={2.2} />
      <path d="M21 39 L23 36 M32 45 L33 41 M43 44 L42 40" {...L} stroke={C.dark} strokeWidth={1.8} opacity={0.5} />
    </>
  ),
  // Pierna de jamón con hueso
  ham: (
    <>
      <path d="M40 22 L52 10" fill="none" stroke="#1f1a17" strokeWidth={10} strokeLinecap="round" />
      <path d="M40 22 L52 10" fill="none" stroke={C.cream} strokeWidth={5.5} strokeLinecap="round" />
      <circle cx={50} cy={8} r={4} fill={C.cream} {...S} />
      <circle cx={55} cy={13} r={4} fill={C.cream} {...S} />
      <path d="M44 26 C50 36 44 52 30 56 C18 59 7 50 8 38 C9 26 20 18 32 18 C38 18 42 22 44 26 Z" fill={C.magenta} {...S} />
      <ellipse cx={25} cy={40} rx={13} ry={12} fill={C.pink} {...S} />
      <ellipse cx={25} cy={40} rx={8} ry={7} fill="#FFB3C6" />
      <circle cx={27} cy={38} r={3} fill={C.cream} {...S} strokeWidth={2} />
    </>
  ),
  fish: (
    <>
      <path d="M44 32 L58 20 L55 32 L58 44 Z" fill={C.blue} {...S} />
      <path d="M6 32 C14 18 30 14 44 22 C48 25 48 39 44 42 C30 50 14 46 6 32 Z" fill={C.sky} {...S} />
      <path d="M24 18 L30 12 L36 18 M26 46 L30 50 L34 46" fill={C.blue} {...S} />
      <path d="M22 22 C26 28 26 36 22 42" {...L} />
      <circle cx={14} cy={30} r={2.5} fill={C.dark} />
      <path d="M30 28 L33 32 L30 36 M36 28 L39 32 L36 36" {...L} stroke={C.blue} />
    </>
  ),
  shrimp: (
    <>
      <path d="M22 12 C38 8 54 18 52 34 C51 44 44 50 36 52 L30 46 C38 44 43 38 42 32 C42 22 32 20 24 22 Z" fill={C.orange} {...S} />
      <path d="M32 12 C34 16 34 20 33 22 M42 15 C42 20 40 24 39 26 M48 24 C46 28 44 30 42 32 M49 36 C46 37 44 38 42 38" {...L} stroke="#C25E00" />
      <path d="M36 52 L28 58 L26 50 L30 46 Z" fill={C.red} {...S} />
      <path d="M22 12 C16 14 14 20 18 23 C20 24 22 24 24 22 Z" fill={C.red} {...S} />
      <path d="M17 16 C10 14 6 16 6 22 M19 14 C14 8 8 8 6 10" {...L} />
      <circle cx={20} cy={18} r={1.5} fill={C.dark} />
    </>
  ),
  egg: (
    <>
      <path d="M32 8 C44 8 52 26 52 38 C52 50 43 57 32 57 C21 57 12 50 12 38 C12 26 20 8 32 8 Z" fill={C.cream} {...S} />
      <path d="M20 32 C21 24 24 19 28 16" {...HL} strokeWidth={4} opacity={0.9} />
    </>
  ),
  // Alitas: dos alitas con salsa naranja-roja
  // Alitas: tazón con alitas pequeñas en salsa roja (pollo = una pierna grande dorada)
  wings: (
    <>
      {[
        ['M20 34 L12 14', 10, 12],
        ['M32 32 V10', 32, 8],
        ['M44 34 L52 14', 54, 12],
      ].map(([d, bx, by], i) => (
        <g key={i}>
          <path d={d as string} fill="none" stroke="#1f1a17" strokeWidth={14} strokeLinecap="round" />
          <path d={d as string} fill="none" stroke={i === 1 ? C.orange : C.red} strokeWidth={9} strokeLinecap="round" />
          <circle cx={bx as number} cy={by as number} r={3.2} fill={C.cream} {...S} strokeWidth={2} />
        </g>
      ))}
      <path d="M8 34 H56 C56 48 46 56 32 56 C18 56 8 48 8 34 Z" fill={C.white} {...S} />
      <path d="M14 42 H50" {...L} stroke={C.red} strokeWidth={3} />
      <path d="M16 18 L14 14 M36 14 V10" {...HL} />
    </>
  ),
  'burger-patty': (
    <>
      <ellipse cx={32} cy={42} rx={24} ry={10} fill={C.choco} {...S} />
      <path d="M8 34 V42 M56 34 V42" {...L} strokeWidth={0} />
      <path d="M8 36 C8 30 18 24 32 24 C46 24 56 30 56 36 C56 42 46 46 32 46 C18 46 8 42 8 36 Z" fill={C.brown} {...S} />
      <path d="M18 32 L24 38 M28 28 L36 36 M40 28 L46 34" {...L} stroke={C.choco} strokeWidth={3} />
      <path d="M14 34 C16 30 20 28 24 27" {...HL} opacity={0.4} />
    </>
  ),
};
