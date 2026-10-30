import { C, S, L, HL } from '../palette';

export const barra: Record<string, JSX.Element> = {
  // Tarro de cerveza con espuma
  beer: (
    <>
      <path d="M44 24 C54 24 56 30 56 36 C56 44 52 46 44 46" fill="none" stroke="#1f1a17" strokeWidth={9} strokeLinecap="round" />
      <path d="M44 24 C54 24 56 30 56 36 C56 44 52 46 44 46" fill="none" stroke={C.ice} strokeWidth={4} strokeLinecap="round" />
      <path d="M12 20 H46 V54 C46 56 44 58 42 58 H16 C14 58 12 56 12 54 Z" fill={C.amber} {...S} />
      <path d="M20 28 V50 M29 28 V50 M38 28 V50" {...L} stroke={C.yellow} strokeWidth={3} />
      <path d="M10 22 C6 16 12 10 18 12 C20 6 30 6 32 11 C36 6 46 8 46 14 C52 16 50 24 44 24 C42 28 36 26 34 24 C30 28 22 28 20 24 C16 28 10 26 10 22 Z" fill={C.white} {...S} />
      <path d="M12 20 H46 V54 C46 56 44 58 42 58 H16 C14 58 12 56 12 54 Z" fill="none" {...S} />
    </>
  ),
  // Barril metálico con llave
  'beer-keg': (
    <>
      <path d="M14 14 C14 10 50 10 50 14 V54 C50 58 14 58 14 54 Z" fill={C.silver} {...S} />
      <path d="M12 22 C12 18 52 18 52 22 V26 C52 30 12 30 12 26 Z" fill={C.grey} {...S} />
      <path d="M12 42 C12 38 52 38 52 42 V46 C52 50 12 50 12 46 Z" fill={C.grey} {...S} />
      <path d="M20 32 V38" {...HL} strokeWidth={4} />
      <ellipse cx={32} cy={13} rx={18} ry={4} fill={C.white} {...S} />
      <rect x={28} y={4} width={8} height={9} rx={1.5} fill={C.dark} {...S} />
      <path d="M36 7 H46" fill="none" stroke="#1f1a17" strokeWidth={7} strokeLinecap="round" />
      <path d="M36 7 H46" fill="none" stroke={C.red} strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  // Tequila: botella + caballito con limón
  tequila: (
    <>
      <rect x={18} y={4} width={10} height={6} rx={1.5} fill={C.brown} {...S} />
      <path d="M19 10 H27 V16 C33 18 36 22 36 28 V54 C36 56 34 58 32 58 H14 C12 58 10 56 10 54 V28 C10 22 13 18 19 16 Z" fill={C.butter} {...S} />
      <path d="M10.5 30 H35.5" {...L} strokeWidth={0} />
      <rect x={10} y={32} width={26} height={14} fill={C.leaf} {...S} strokeWidth={2} />
      <path d="M17 42 L23 34 L29 42 M20 42 V37 M26 42 V37" {...L} stroke={C.dkgreen} strokeWidth={2} />
      <path d="M38 38 H56 L53 58 H41 Z" fill={C.ice} {...S} />
      <path d="M39.2 46 H54.8 L53.3 57 H41.7 Z" fill={C.butter} />
      <path d="M38 38 H56 L53 58 H41 Z" fill="none" {...S} />
      <path d="M44 38 A8 8 0 0 1 58 34 Z" fill={C.leaf} {...S} strokeWidth={2} />
      <path d="M15 22 V27" {...HL} />
    </>
  ),
  // Vino: botella + copa
  wine: (
    <>
      <rect x={14} y={4} width={8} height={8} rx={1.5} fill={C.wine} {...S} />
      <path d="M14 12 H22 V20 C27 22 30 26 30 32 V55 C30 57 28 58 26 58 H10 C8 58 6 57 6 55 V32 C6 26 9 22 14 20 Z" fill={C.dkgreen} {...S} />
      <rect x={6} y={36} width={24} height={12} fill={C.cream} {...S} strokeWidth={2} />
      <path d="M11 26 V31" {...HL} />
      <path d="M36 22 H56 C56 34 52 40 46 40 C40 40 36 34 36 22 Z" fill={C.ice} {...S} />
      <path d="M36.6 28 H55.4 C54.6 36 51 39 46 39 C41 39 37.4 36 36.6 28 Z" fill={C.wine} />
      <path d="M36 22 H56 C56 34 52 40 46 40 C40 40 36 34 36 22 Z" fill="none" {...S} />
      <path d="M46 40 V54 M39 56 H53" {...L} strokeWidth={3} />
    </>
  ),
  // Whisky: botella cuadrada ámbar + vaso con hielo
  whisky: (
    <>
      <rect x={16} y={4} width={10} height={6} rx={1.5} fill={C.dark} {...S} />
      <path d="M17 10 H25 V16 H32 C34 16 36 18 36 20 V55 C36 57 34 58 32 58 H10 C8 58 6 57 6 55 V20 C6 18 8 16 10 16 H17 Z" fill={C.orange} {...S} />
      <rect x={6} y={30} width={30} height={14} fill={C.dark} {...S} strokeWidth={2} />
      <path d="M12 37 H30" {...L} stroke={C.yellow} strokeWidth={2.5} />
      <path d="M11 20 V26" {...HL} />
      <path d="M38 34 H58 L56 58 H40 Z" fill={C.ice} {...S} />
      <path d="M38.9 44 H57.1 L56 57 H40 Z" fill={C.amber} />
      <rect x={42} y={38} width={8} height={8} rx={1.5} transform="rotate(15 46 42)" fill={C.white} {...S} strokeWidth={1.8} />
      <path d="M38 34 H58 L56 58 H40 Z" fill="none" {...S} />
    </>
  ),
  // Hielo: cubos
  ice: (
    <>
      <path d="M8 32 L22 26 L36 32 L22 38 Z" fill={C.white} {...S} />
      <path d="M8 32 L22 38 V54 L8 48 Z" fill={C.ice} {...S} />
      <path d="M22 38 L36 32 V48 L22 54 Z" fill={C.sky} {...S} />
      <path d="M28 18 L42 12 L56 18 L42 24 Z" fill={C.white} {...S} />
      <path d="M28 18 L42 24 V40 L28 34 Z" fill={C.ice} {...S} />
      <path d="M42 24 L56 18 V34 L42 40 Z" fill={C.sky} {...S} />
      <path d="M38 46 L48 42 L58 46 L48 50 Z" fill={C.white} {...S} />
      <path d="M38 46 L48 50 V60 L38 56 Z" fill={C.ice} {...S} strokeWidth={0} />
      <path d="M48 50 L58 46 V56 L48 60 Z" fill={C.sky} {...S} strokeWidth={0} />
      <path d="M38 46 V56 L48 60 L58 56 V46" fill="none" {...S} />
      <path d="M48 50 V60" {...L} />
      <path d="M12 38 L12 44 M32 22 V28" {...HL} />
    </>
  ),
  // Jarabe: botella con dosificador (pump)
  syrup: (
    <>
      <path d="M30 18 V8 H44" fill="none" stroke="#1f1a17" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 18 V8 H44" fill="none" stroke={C.dark} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={24} y={16} width={12} height={8} rx={2} fill={C.dark} {...S} />
      <path d="M26 24 H34 V28 C42 30 44 34 44 40 V54 C44 56 42 58 40 58 H20 C18 58 16 56 16 54 V40 C16 34 18 30 26 28 Z" fill={C.magenta} {...S} />
      <rect x={16} y={40} width={28} height={10} fill={C.white} {...S} strokeWidth={2} />
      <circle cx={30} cy={45} r={3} fill={C.red} />
      <path d="M21 33 V37" {...HL} />
    </>
  ),
  // Clamato: botella roja con almeja/tomate
  clamato: (
    <>
      <rect x={26} y={4} width={12} height={6} rx={1.5} fill={C.dkgreen} {...S} />
      <path d="M27 10 H37 V16 C44 20 46 24 46 30 V54 C46 56 44 58 42 58 H22 C20 58 18 56 18 54 V30 C18 24 20 20 27 16 Z" fill={C.red} {...S} />
      <rect x={18} y={32} width={28} height={16} fill={C.white} {...S} strokeWidth={2} />
      <path d="M24 46 C24 38 40 38 40 46 Z" fill={C.sky} {...S} strokeWidth={1.8} />
      <path d="M28 46 L30 40 M32 46 V39 M36 46 L34 40" {...L} stroke={C.blue} strokeWidth={1.5} />
      <circle cx={38} cy={36} r={3.5} fill={C.red} {...S} strokeWidth={1.6} />
      <path d="M23 22 V28" {...HL} />
    </>
  ),
  // Hierbabuena: ramito de hojas dentadas
  mint: (
    <>
      <path d="M32 58 V20" {...L} stroke={C.dkgreen} strokeWidth={3} />
      <path d="M32 24 C24 22 14 14 16 4 C26 4 32 12 32 24 Z" fill={C.leaf} {...S} />
      <path d="M32 24 C40 22 50 14 48 4 C38 4 32 12 32 24 Z" fill={C.leaf} {...S} />
      <path d="M32 44 C22 44 8 38 8 26 C20 24 30 32 32 44 Z" fill={C.mint} {...S} />
      <path d="M32 44 C42 44 56 38 56 26 C44 24 34 32 32 44 Z" fill={C.mint} {...S} />
      <path d="M31 22 L20 9 M33 22 L44 9 M31 42 L13 29 M33 42 L51 29" {...L} stroke={C.dkgreen} strokeWidth={1.8} />
    </>
  ),
};
