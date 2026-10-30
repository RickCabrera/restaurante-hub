import { C, S, L, HL } from '../palette';

export const otro: Record<string, JSX.Element> = {
  // Caja de cartón
  box: (
    <>
      <path d="M8 22 L32 12 L56 22 L32 32 Z" fill={C.kraft} {...S} />
      <path d="M8 22 L32 32 V58 L8 48 Z" fill={C.tan} {...S} />
      <path d="M32 32 L56 22 V48 L32 58 Z" fill={C.brown} {...S} />
      <path d="M20 17 L44 27 V34 L38 36 V29 L14 19.5" fill={C.cream} {...S} strokeWidth={2} />
    </>
  ),
  // Costal de rafia
  sack: (
    <>
      <path d="M20 10 L24 16 H40 L44 10 C40 12 36 8 32 10 C28 8 24 12 20 10 Z" fill={C.cream} {...S} />
      <path d="M24 16 H40 C50 22 54 34 52 46 C51 54 46 58 32 58 C18 58 13 54 12 46 C10 34 14 22 24 16 Z" fill={C.cream} {...S} />
      <rect x={24} y={14} width={16} height={5} rx={2} fill={C.red} {...S} strokeWidth={2} />
      <path d="M16 36 H48 M15 44 H49" {...L} stroke={C.blue} strokeWidth={3} />
      <path d="M18 28 C18 25 20 23 22 22" {...HL} stroke={C.tan} opacity={1} />
    </>
  ),
  // Bote: frasco/tarro de plástico con tapa
  jar: (
    <>
      <rect x={16} y={8} width={32} height={10} rx={3} fill={C.red} {...S} />
      <path d="M18 18 H46 C50 22 50 26 50 30 V52 C50 56 46 58 42 58 H22 C18 58 14 56 14 52 V30 C14 26 14 22 18 18 Z" fill={C.ice} {...S} />
      <rect x={14} y={30} width={36} height={16} fill={C.white} {...S} strokeWidth={2} />
      <path d="M22 38 H42" {...L} stroke={C.grey} strokeWidth={3} />
      <path d="M19 22 V27 M19 49 V53" {...HL} stroke={C.white} opacity={1} />
    </>
  ),
  // Botella genérica (vidrio verde)
  bottle: (
    <>
      <rect x={27} y={4} width={10} height={6} rx={1.5} fill={C.dark} {...S} />
      <path d="M28 10 H36 V20 C43 23 46 28 46 34 V54 C46 56 44 58 42 58 H22 C20 58 18 56 18 54 V34 C18 28 21 23 28 20 Z" fill={C.olive} {...S} />
      <path d="M23 30 V48" {...HL} strokeWidth={4} />
    </>
  ),
  // Paquete: caja envuelta con cinta
  package: (
    <>
      <rect x={10} y={20} width={44} height={36} rx={3} fill={C.kraft} {...S} />
      <path d="M10 30 H54" {...L} />
      <path d="M28 20 H36 V56 H28 Z" fill={C.yellow} {...S} strokeWidth={2} />
      <path d="M32 20 C26 10 16 12 20 18 C22 21 28 20 32 20 Z" fill={C.yellow} {...S} />
      <path d="M32 20 C38 10 48 12 44 18 C42 21 36 20 32 20 Z" fill={C.yellow} {...S} />
      <path d="M14 38 H22 M14 44 H20" {...L} stroke={C.brown} strokeWidth={2.2} />
    </>
  ),
};
