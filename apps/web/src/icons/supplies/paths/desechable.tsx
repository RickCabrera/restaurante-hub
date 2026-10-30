import { C, S, L, HL } from '../palette';

export const desechable: Record<string, JSX.Element> = {
  // Vasos: pila de vasos desechables (se ven los bordes apilados)
  cup: (
    <>
      <path d="M14 22 H50 L45 58 H19 Z" fill={C.white} {...S} />
      <path d="M15.6 34 H48.4 L46.8 46 H17.2 Z" fill={C.red} />
      <path d="M14 22 H50 L45 58 H19 Z" fill="none" {...S} />
      <path d="M12 14 H52 L51 22 H13 Z" fill={C.white} {...S} />
      <path d="M10 6 H54 L53 14 H11 Z" fill={C.white} {...S} />
      <path d="M20 26 L22 52" {...HL} stroke={C.silver} opacity={1} />
    </>
  ),
  // Tapas: tapa domo de vaso (vista 3/4), pila de dos
  lid: (
    <>
      <ellipse cx={32} cy={48} rx={26} ry={8} fill={C.ice} {...S} />
      <ellipse cx={32} cy={38} rx={26} ry={8} fill={C.ice} {...S} />
      <path d="M12 37 C12 22 52 22 52 37 C46 40 18 40 12 37 Z" fill={C.white} {...S} />
      <ellipse cx={32} cy={26} rx={6} ry={2.2} fill={C.dark} />
      <path d="M32 26 L36 8" fill="none" stroke="#1f1a17" strokeWidth={0} />
      <path d="M18 32 C20 29 23 27 26 26" {...HL} stroke={C.sky} opacity={1} />
    </>
  ),
  // Popotes: varios popotes de colores
  straw: (
    <>
      {[
        ['M20 58 L22 14 L14 6', C.red],
        ['M30 58 L30 10 L36 4', C.blue],
        ['M40 58 L40 14 L48 8', C.leaf],
      ].map(([d, col], i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="#1f1a17" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke={col} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
      <path d="M14 40 H48 V46 H14 Z" fill={C.cream} {...S} strokeWidth={2} />
    </>
  ),
  // Servilletas: servilletero con papel
  napkins: (
    <>
      <path d="M14 34 L18 12 H46 L50 34" fill={C.white} {...S} />
      <path d="M20 34 L24 16 H52 L54 34" fill={C.white} {...S} />
      <path d="M26 20 C30 22 34 18 38 20 C42 22 46 18 50 20" {...L} stroke={C.sky} strokeWidth={2} />
      <path d="M8 34 H56 V52 C56 55 54 58 50 58 H14 C10 58 8 55 8 52 Z" fill={C.sky} {...S} />
      <path d="M16 40 V50" {...HL} />
      <path d="M24 46 H40" {...L} stroke={C.blue} strokeWidth={3} />
    </>
  ),
  // Contenedor tipo clamshell (unicel) abierto
  container: (
    <>
      <path d="M10 30 L16 10 H48 L54 30 Z" fill={C.silver} {...S} />
      <path d="M20 14 H44 L48 26 H16 Z" {...L} stroke={C.white} strokeWidth={2.5} />
      <path d="M6 30 H58 L52 54 C52 56 50 57 48 57 H16 C14 57 12 56 12 54 Z" fill={C.white} {...S} />
      <path d="M6 30 H58" {...L} strokeWidth={2.5} />
      <path d="M18 38 L20 50 H44 L46 38" {...L} stroke={C.silver} strokeWidth={2.5} />
      <rect x={28} y={50} width={8} height={5} rx={1} fill={C.grey} {...S} strokeWidth={1.8} />
    </>
  ),
  // Bolsas: bolsa de plástico tipo camiseta
  bag: (
    <>
      <path d="M18 22 C16 12 20 6 24 6 C28 6 28 12 28 22" fill="none" {...S} strokeWidth={4} />
      <path d="M36 22 C36 12 36 6 40 6 C44 6 48 12 46 22" fill="none" {...S} strokeWidth={4} />
      <path d="M18 22 C16 12 20 6 24 6 C28 6 28 12 28 22" fill="none" stroke={C.white} strokeWidth={1.2} />
      <path d="M36 22 C36 12 36 6 40 6 C44 6 48 12 46 22" fill="none" stroke={C.white} strokeWidth={1.2} />
      <path d="M12 22 H52 C54 34 54 46 50 56 C50 57 48 58 46 58 H18 C16 58 14 57 14 56 C10 46 10 34 12 22 Z" fill={C.white} {...S} />
      <path d="M12 22 H28 V26 C28 28 36 28 36 26 V22 H52" {...L} />
      <path d="M22 34 C24 40 24 46 22 52 M42 34 C40 40 40 46 42 52" {...L} stroke={C.silver} />
      <circle cx={32} cy={42} r={6} fill={C.leaf} {...S} strokeWidth={2} />
    </>
  ),
  // Papel aluminio: rollo con caja
  foil: (
    <>
      <path d="M16 36 L40 54 L56 44 L56 30 Z" fill={C.silver} {...S} />
      <path d="M22 40 L44 44 L36 50" {...L} stroke={C.white} strokeWidth={2.5} />
      <path d="M6 22 L46 12 L58 18 L18 30 Z" fill={C.white} {...S} />
      <path d="M6 22 L18 30 V40 L6 32 Z" fill={C.red} {...S} />
      <path d="M18 30 L58 18 V28 L18 40 Z" fill={C.red} {...S} />
      <path d="M24 32 L50 24" {...L} stroke={C.silver} strokeWidth={3} />
    </>
  ),
  // Plástico emplaye: rollo grande transparente
  'plastic-wrap': (
    <>
      <path d="M10 22 H44 V48 H10 Z" fill={C.ice} {...S} />
      <ellipse cx={44} cy={35} rx={6} ry={13} fill={C.sky} {...S} />
      <ellipse cx={44} cy={35} rx={2.5} ry={5} fill={C.dark} />
      <ellipse cx={10} cy={35} rx={6} ry={13} fill={C.ice} {...S} />
      <path d="M44 48 C48 54 54 56 58 56 L52 46" fill={C.ice} {...S} strokeWidth={2} />
      <path d="M18 28 H36 M18 34 H32" {...HL} stroke={C.white} opacity={0.9} />
    </>
  ),
  // Cubiertos desechables: tenedor + cuchara cruzados
  cutlery: (
    <>
      <g transform="rotate(-30 32 32)">
        <path d="M29 30 H35 L34 58 C34 60 30 60 30 58 Z" fill={C.white} {...S} />
        <path d="M24 6 V20 C24 26 28 30 32 30 C36 30 40 26 40 20 V6" fill={C.white} {...S} />
        <path d="M29 6 V18 M35 6 V18" {...L} />
      </g>
      <g transform="rotate(30 32 32)">
        <path d="M29 30 H35 L34 58 C34 60 30 60 30 58 Z" fill={C.sky} {...S} />
        <ellipse cx={32} cy={17} rx={9} ry={13} fill={C.sky} {...S} />
        <path d="M28 10 C28 14 28 18 29 21" {...HL} />
      </g>
    </>
  ),
  // Platos desechables apilados
  plate: (
    <>
      <ellipse cx={32} cy={44} rx={26} ry={10} fill={C.silver} {...S} />
      <ellipse cx={32} cy={38} rx={26} ry={10} fill={C.white} {...S} />
      <ellipse cx={32} cy={32} rx={26} ry={10} fill={C.white} {...S} />
      <ellipse cx={32} cy={31} rx={16} ry={5.5} {...L} fill={C.ice} />
      <path d="M18 27 C20 25 23 24 26 24" {...HL} stroke={C.white} />
    </>
  ),
  // Guante de látex/nitrilo
  gloves: (
    <>
      <path d="M20 58 V50 C14 42 8 36 10 32 C12 28 16 30 20 34 V12 C20 8 26 8 26 12 V28 V8 C26 4 32 4 32 8 V28 V8 C32 4 38 4 38 8 V28 V12 C38 8 44 8 44 12 V40 C44 46 42 50 40 52 V58 Z" fill={C.sky} {...S} />
      <path d="M20 52 H40" {...L} stroke={C.blue} strokeWidth={3} />
      <path d="M26 16 V24 M32 12 V20" {...HL} />
    </>
  ),
  // Rollo de papel térmico (ticket)
  'paper-roll': (
    <>
      <path d="M32 34 H40 V56 L37 54 L34 56 L31 54 L28 56 L25 54 L22 56 V34" fill={C.white} {...S} />
      <path d="M26 40 H36 M26 45 H34 M26 50 H36" {...L} stroke={C.grey} strokeWidth={2} />
      <circle cx={30} cy={24} r={16} fill={C.white} {...S} />
      <circle cx={30} cy={24} r={11} {...L} stroke={C.silver} />
      <circle cx={30} cy={24} r={5} fill={C.amber} {...S} />
      <circle cx={30} cy={24} r={2} fill={C.dark} />
    </>
  ),
  // Caja de pizza
  'pizza-box': (
    <>
      <path d="M6 30 L22 22 H58 L42 30 Z" fill={C.kraft} {...S} />
      <path d="M6 30 H42 V48 H6 Z" fill={C.tan} {...S} />
      <path d="M42 30 L58 22 V40 L42 48 Z" fill={C.brown} {...S} />
      <path d="M6 30 H42 V48 H6 Z" fill="none" {...S} />
      <path d="M24 30 L36 34 L28 44 Z" fill={C.yellow} {...S} strokeWidth={2} />
      <circle cx={29} cy={36} r={1.8} fill={C.red} />
      <circle cx={31} cy={40} r={1.5} fill={C.red} />
      <path d="M28 24 C34 23 40 23 46 24" {...L} stroke={C.red} strokeWidth={2.5} />
    </>
  ),
};
