import { C, S, L, HL } from '../palette';

/** Costal/bolsa genérica de granos con una etiqueta de color y una muestra encima. */
function sackOf(bag: string, band: string, grain: JSX.Element) {
  return (
    <>
      <path d="M16 20 C12 30 10 44 14 54 C16 57 18 58 22 58 H42 C46 58 48 57 50 54 C54 44 52 30 48 20 Z" fill={bag} {...S} />
      <path d="M16 20 C22 16 42 16 48 20 C42 24 22 24 16 20 Z" fill={bag} {...S} />
      <rect x={18} y={34} width={28} height={14} rx={3} fill={band} {...S} strokeWidth={2} />
      {grain}
    </>
  );
}

export const abarrote: Record<string, JSX.Element> = {
  // Tazón con montaña de arroz blanco
  rice: (
    <>
      <path d="M10 30 C10 14 22 8 32 8 C42 8 54 14 54 30 Z" fill={C.white} {...S} />
      <g fill={C.silver}>
        {[
          [22, 20, -30], [30, 15, 10], [40, 18, 40], [26, 26, 20], [36, 25, -20], [45, 26, 60], [18, 27, -60],
        ].map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={2.6} ry={1.3} transform={`rotate(${r} ${x} ${y})`} />
        ))}
      </g>
      <path d="M8 30 H56 C56 44 46 54 32 54 C18 54 8 44 8 30 Z" fill={C.sky} {...S} />
      <path d="M14 38 H50" {...L} stroke={C.blue} strokeWidth={3} />
      <path d="M24 54 H40 V58 H24 Z" fill={C.blue} {...S} />
      <path d="M36 10 L44 4 M39 12 L47 6" {...L} stroke={C.brown} strokeWidth={0} />
    </>
  ),
  beans: (
    <>
      <path d="M8 30 H56 C56 44 46 54 32 54 C18 54 8 44 8 30 Z" fill={C.tan} {...S} />
      <path d="M12 30 C12 26 52 26 52 30" fill={C.choco} {...S} />
      {[
        [18, 24], [26, 20], [34, 19], [42, 21], [48, 26], [22, 28], [30, 26], [38, 26],
      ].map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx={4.6} ry={3.2} transform={`rotate(${i * 29} ${x} ${y})`} fill={C.choco} stroke="#1f1a17" strokeWidth={1.8} />
          <circle cx={x - 1} cy={y - 1} r={0.9} fill={C.white} opacity={0.7} />
        </g>
      ))}
      <path d="M14 38 H50" {...L} stroke={C.brown} strokeWidth={3} />
      <path d="M24 54 H40 V58 H24 Z" fill={C.brown} {...S} />
    </>
  ),
  // Harina: costal de papel con espiga de trigo
  flour: (
    <>
      <path d="M14 14 L18 8 H46 L50 14 Z" fill={C.silver} {...S} />
      <path d="M14 14 H50 L52 54 C52 56 50 58 48 58 H16 C14 58 12 56 12 54 Z" fill={C.white} {...S} />
      <path d="M32 54 V26" {...L} stroke={C.brown} strokeWidth={2.5} />
      {[[28, 30, -30], [36, 30, 30], [28, 38, -30], [36, 38, 30], [28, 46, -30], [36, 46, 30], [32, 22, 0]].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx={3} ry={5} transform={`rotate(${r} ${x} ${y})`} fill={C.amber} stroke="#1f1a17" strokeWidth={1.8} />
      ))}
      <path d="M18 20 V30" {...HL} stroke={C.silver} opacity={1} />
    </>
  ),
  // Azúcar: terrones
  sugar: (
    <>
      <path d="M10 34 L20 28 L34 30 L24 36 Z" fill={C.white} {...S} />
      <path d="M10 34 L24 36 V52 L10 50 Z" fill={C.silver} {...S} />
      <path d="M24 36 L34 30 V46 L24 52 Z" fill={C.grey} {...S} />
      <path d="M30 22 L40 16 L54 18 L44 24 Z" fill={C.white} {...S} />
      <path d="M30 22 L44 24 V40 L30 38 Z" fill={C.silver} {...S} />
      <path d="M44 24 L54 18 V34 L44 40 Z" fill={C.grey} {...S} />
      <path d="M34 42 L44 44 V56 L34 54 Z" fill={C.silver} {...S} />
      <path d="M44 44 L52 40 V52 L44 56 Z" fill={C.grey} {...S} />
      <path d="M34 42 L42 38 L52 40 L44 44 Z" fill={C.white} {...S} />
    </>
  ),
  // Salero (tapa con agujeros) + cristales
  salt: (
    <>
      <path d="M20 26 C20 20 24 16 32 16 C40 16 44 20 44 26 Z" fill={C.silver} {...S} />
      <g fill={C.dark}>
        <circle cx={28} cy={21} r={1.5} />
        <circle cx={32} cy={19.5} r={1.5} />
        <circle cx={36} cy={21} r={1.5} />
      </g>
      <path d="M18 26 H46 L44 56 H20 Z" fill={C.white} {...S} />
      <path d="M19 40 H45 L44 56 H20 Z" fill={C.ice} />
      <path d="M18 26 H46 L44 56 H20 Z" fill="none" {...S} />
      <path d="M24 32 V48" {...HL} stroke={C.sky} />
      <path d="M32 8 V10 M24 8 L25 11 M40 8 L39 11" {...L} stroke={C.steel} strokeWidth={2.5} />
    </>
  ),
  // Botella de aceite dorado
  oil: (
    <>
      <rect x={27} y={6} width={10} height={6} rx={1.5} fill={C.red} {...S} />
      <path d="M27 12 H37 V18 C44 22 46 26 46 32 V54 C46 56 44 58 42 58 H22 C20 58 18 56 18 54 V32 C18 26 20 22 27 18 Z" fill={C.amber} {...S} />
      <path d="M18 30 H46" {...L} strokeWidth={2} opacity={0} />
      <rect x={18} y={34} width={28} height={14} fill={C.leaf} {...S} strokeWidth={2} />
      <path d="M32 37 C28 41 28 44 32 45 C36 44 36 41 32 37 Z" fill={C.yellow} {...S} strokeWidth={1.6} />
      <path d="M23 24 V30 M23 51 V54" {...HL} />
    </>
  ),
  pasta: (
    <>
      <path d="M8 34 H56 C56 46 46 54 32 54 C18 54 8 46 8 34 Z" fill={C.white} {...S} />
      <path d="M12 34 C10 26 18 22 22 26 C20 18 30 14 34 20 C36 14 46 16 46 22 C52 22 56 28 52 34 Z" fill={C.butter} {...S} />
      <path d="M18 30 C22 26 28 30 32 26 C36 22 42 28 46 26 M16 34 C20 30 28 32 34 30 C40 28 44 32 50 32" {...L} stroke={C.amber} strokeWidth={2} />
      <circle cx={28} cy={28} r={4.5} fill={C.red} {...S} strokeWidth={2} />
      <path d="M40 8 L36 32 M46 10 L38 32" {...L} stroke={C.steel} strokeWidth={3} />
      <path d="M14 42 C18 47 24 49 30 50" {...L} stroke={C.silver} strokeWidth={2.5} />
    </>
  ),
  // Pila de tortillas en tortillero
  tortilla: (
    <>
      <ellipse cx={32} cy={46} rx={24} ry={9} fill={C.tan} {...S} />
      <ellipse cx={32} cy={40} rx={24} ry={9} fill={C.butter} {...S} />
      <ellipse cx={32} cy={34} rx={24} ry={9} fill={C.butter} {...S} />
      <ellipse cx={32} cy={28} rx={24} ry={9} fill={C.butter} {...S} />
      <g fill={C.tan}>
        <circle cx={24} cy={26} r={2} />
        <circle cx={36} cy={24} r={1.6} />
        <circle cx={42} cy={30} r={2.2} />
        <circle cx={30} cy={31} r={1.4} />
      </g>
    </>
  ),
  canned: (
    <>
      <ellipse cx={32} cy={50} rx={17} ry={6} fill={C.grey} {...S} />
      <rect x={15} y={16} width={34} height={34} fill={C.red} />
      <path d="M15 16 V50 M49 16 V50" {...L} strokeWidth={2.5} />
      <rect x={15} y={24} width={34} height={18} fill={C.cream} />
      <path d="M15 24 H49 M15 42 H49" {...L} strokeWidth={2} />
      <path d="M26 33 C26 29 30 28 32 30 C34 28 38 29 38 33 C38 37 34 39 32 39 C30 39 26 37 26 33 Z" fill={C.orange} {...S} strokeWidth={1.8} />
      <ellipse cx={32} cy={16} rx={17} ry={6} fill={C.silver} {...S} />
      <ellipse cx={32} cy={16} rx={12} ry={3.6} {...L} stroke={C.steel} />
      <path d="M19 46 V48" {...HL} />
    </>
  ),
  // Botella de salsa picante
  sauce: (
    <>
      <path d="M28 4 H36 V12 H28 Z" fill={C.dkgreen} {...S} />
      <path d="M27 12 H37 V20 C44 24 46 30 46 36 V54 C46 56 44 58 42 58 H22 C20 58 18 56 18 54 V36 C18 30 20 24 27 20 Z" fill={C.red} {...S} />
      <path d="M18 36 H46 V50 H18 Z" fill={C.butter} {...S} strokeWidth={2} />
      <path d="M28 46 C28 42 34 40 37 38 C36 42 34 46 30 47 Z" fill={C.red} {...S} strokeWidth={1.6} />
      <path d="M23 26 V32" {...HL} />
    </>
  ),
  // Mayonesa: frasco blanco con tapa azul
  mayo: (
    <>
      <rect x={14} y={8} width={36} height={10} rx={3} fill={C.blue} {...S} />
      <path d="M16 18 H48 C50 18 52 20 52 22 V52 C52 55 50 58 46 58 H18 C14 58 12 55 12 52 V22 C12 20 14 18 16 18 Z" fill={C.white} {...S} />
      <rect x={12} y={30} width={40} height={16} fill={C.sky} {...S} strokeWidth={2} />
      <path d="M22 38 C22 34 26 33 28 35 M30 38 C30 34 34 33 36 35 M38 38 C38 34 42 33 44 35" {...L} stroke={C.white} strokeWidth={2.5} />
      <path d="M18 22 V27" {...HL} stroke={C.grey} />
    </>
  ),
  // Mostaza: botella amarilla para exprimir
  mustard: (
    <>
      <path d="M30 4 L34 4 L35 12 H29 Z" fill={C.yellow} {...S} />
      <path d="M24 12 H40 L42 18 H22 Z" fill={C.red} {...S} />
      <path d="M22 18 H42 C46 22 48 28 48 36 V54 C48 56 46 58 44 58 H20 C18 58 16 56 16 54 V36 C16 28 18 22 22 18 Z" fill={C.yellow} {...S} />
      <path d="M16 36 H48 V48 H16 Z" fill={C.red} {...S} strokeWidth={2} />
      <path d="M22 42 C26 38 30 46 34 42 C38 38 42 46 44 42" {...L} stroke={C.yellow} strokeWidth={2.5} />
      <path d="M22 24 V30" {...HL} />
    </>
  ),
  // Vinagre: botella transparente alta
  vinegar: (
    <>
      <rect x={27} y={5} width={10} height={6} rx={1.5} fill={C.dark} {...S} />
      <path d="M28 11 H36 V20 C42 24 44 28 44 34 V54 C44 56 42 58 40 58 H24 C22 58 20 56 20 54 V34 C20 28 22 24 28 20 Z" fill={C.ice} {...S} />
      <path d="M20.5 30 H43.5 V54 C43.5 56 42 57.5 40 57.5 H24 C22 57.5 20.5 56 20.5 54 Z" fill={C.butter} />
      <path d="M28 11 H36 V20 C42 24 44 28 44 34 V54 C44 56 42 58 40 58 H24 C22 58 20 56 20 54 V34 C20 28 22 24 28 20 Z" fill="none" {...S} />
      <rect x={20} y={38} width={24} height={10} fill={C.purple} {...S} strokeWidth={2} />
      <path d="M25 33 V35 M25 51 V54" {...HL} />
    </>
  ),
  // Miel: tarro con cuchara de miel
  honey: (
    <>
      <path d="M14 26 C14 22 18 20 22 20 H42 C46 20 50 22 50 26 V50 C50 54 46 58 42 58 H22 C18 58 14 54 14 50 Z" fill={C.amber} {...S} />
      <rect x={16} y={14} width={32} height={8} rx={2} fill={C.kraft} {...S} />
      <path d="M14 28 C18 32 22 28 24 32 C26 38 28 32 30 30 C34 28 38 34 40 30 C44 26 46 30 50 28" fill={C.yellow} {...S} strokeWidth={2} />
      <path d="M26 42 L32 38 L38 42 V48 L32 52 L26 48 Z" fill={C.yellow} {...S} strokeWidth={2} />
      <path d="M44 14 L54 4" fill="none" stroke="#1f1a17" strokeWidth={6} strokeLinecap="round" />
      <path d="M44 14 L54 4" fill="none" stroke={C.brown} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M19 36 V44" {...HL} />
    </>
  ),
  chocolate: (
    <>
      <path d="M10 20 L44 12 L54 46 L20 54 Z" fill={C.choco} {...S} />
      <path d="M21 18.5 L31 52 M32 16 L42 49 M15 31 L48 23 M18 42 L51 34" {...L} stroke="#3E1F0D" strokeWidth={2.5} />
      <path d="M8 34 L42 26 L52 60" fill="none" stroke="none" />
      <path d="M22 38 L52 31 L56 46 L20 54 Z" fill={C.red} {...S} />
      <path d="M22 38 L52 31" {...L} stroke={C.silver} strokeWidth={3} />
      <path d="M14 22 L18 21" {...HL} />
    </>
  ),
  // Café: bolsa con granos
  coffee: (
    <>
      <path d="M16 14 H48 L50 54 C50 56 48 58 46 58 H18 C16 58 14 56 14 54 Z" fill={C.brown} {...S} />
      <path d="M16 14 L20 8 H44 L48 14" fill={C.choco} {...S} />
      <ellipse cx={32} cy={36} rx={9} ry={12} transform="rotate(25 32 36)" fill={C.choco} {...S} />
      <path d="M28 27 C34 32 30 40 36 45" {...L} stroke={C.tan} strokeWidth={2.5} />
      <path d="M20 20 V26" {...HL} />
    </>
  ),
  // Té: taza con bolsita
  tea: (
    <>
      <path d="M10 26 H46 V40 C46 50 38 56 28 56 C18 56 10 50 10 40 Z" fill={C.white} {...S} />
      <path d="M46 30 C54 30 56 36 54 40 C52 44 48 44 44 44" fill="none" {...S} strokeWidth={4} />
      <path d="M46 30 C54 30 56 36 54 40 C52 44 48 44 44 44" fill="none" stroke={C.white} strokeWidth={1.5} />
      <ellipse cx={28} cy={26} rx={18} ry={4} fill={C.amber} {...S} />
      <path d="M36 26 L38 8" {...L} />
      <path d="M33 8 H45 V18 H33 Z" fill={C.leaf} {...S} />
      <path d="M36 12 H42" {...L} stroke={C.white} strokeWidth={2} />
      <path d="M16 34 V42" {...HL} stroke={C.silver} />
    </>
  ),
  // Cereal: caja con tazón
  cereal: (
    <>
      <path d="M12 8 H40 V56 H12 Z" fill={C.red} {...S} />
      <path d="M40 8 L46 12 V58 L40 56" fill="#B02A35" {...S} />
      <circle cx={26} cy={22} r={7} fill={C.yellow} {...S} strokeWidth={2} />
      <path d="M22 50 C22 44 54 44 54 50 Z" fill={C.amber} {...S} strokeWidth={2} />
      <g fill={C.yellow} stroke="#1f1a17" strokeWidth={1.5}>
        <circle cx={30} cy={44} r={3} />
        <circle cx={38} cy={42} r={3} />
        <circle cx={46} cy={44} r={3} />
      </g>
      <path d="M20 48 H56 C56 54 50 58 38 58 C26 58 20 54 20 48 Z" fill={C.sky} {...S} />
    </>
  ),
  // Nueces / cacahuates
  nuts: (
    <>
      <path d="M8 38 C8 30 16 28 20 32 C24 28 32 30 32 38 C32 46 24 48 20 44 C16 48 8 46 8 38 Z" fill={C.tan} {...S} />
      <path d="M14 36 L16 40 M24 36 L26 40" {...L} stroke={C.brown} strokeWidth={1.6} />
      <path d="M36 14 C46 12 56 20 54 32 C52 40 46 44 40 44 C32 44 28 36 30 26 C31 20 33 15 36 14 Z" fill={C.brown} {...S} />
      <path d="M42 15 C38 22 38 34 41 43" {...L} stroke={C.choco} strokeWidth={2} />
      <path d="M36 22 C35 26 35 30 36 34" {...HL} opacity={0.4} />
      <ellipse cx={32} cy={52} rx={9} ry={5} transform="rotate(-15 32 52)" fill={C.kraft} {...S} />
      <path d="M26 52 C30 50 34 50 38 52" {...L} stroke={C.brown} strokeWidth={1.6} />
    </>
  ),
  // Totopos: bolsa abierta con triángulos
  chips: (
    <>
      <path d="M22 18 L30 4 L36 16 Z" fill={C.yellow} {...S} />
      <path d="M32 16 L44 6 L44 20 Z" fill={C.amber} {...S} />
      <path d="M18 18 L20 6 L28 16 Z" fill={C.amber} {...S} />
      <path d="M14 16 H50 C48 22 48 26 50 30 C52 40 50 50 48 58 H16 C14 50 12 40 14 30 C16 26 16 22 14 16 Z" fill={C.orange} {...S} />
      <path d="M14 16 H50" {...L} />
      <path d="M22 32 L32 46 L42 32 Z" fill={C.yellow} {...S} />
      <path d="M20 22 V28" {...HL} />
    </>
  ),
};
