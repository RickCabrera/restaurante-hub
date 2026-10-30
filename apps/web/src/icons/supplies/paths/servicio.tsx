import { C, S, L, HL } from '../palette';

export const servicio: Record<string, JSX.Element> = {
  // Tanque de gas LP
  gas: (
    <>
      <path d="M22 14 V8 H42 V14" fill="none" {...S} strokeWidth={4} />
      <path d="M22 14 V8 H42 V14" fill="none" stroke={C.silver} strokeWidth={1.5} />
      <rect x={28} y={10} width={8} height={6} rx={1} fill={C.dark} {...S} />
      <path d="M16 24 C16 18 22 14 32 14 C42 14 48 18 48 24 V52 C48 56 44 58 40 58 H24 C20 58 16 56 16 52 Z" fill={C.silver} {...S} />
      <path d="M16 30 H48 M16 48 H48" {...L} strokeWidth={2.2} />
      <path d="M33 33 C28 37 28 43 32 45 C36 45 38 41 35 37 C35 39 34 40 33 40 C34 38 34 36 33 33 Z" fill={C.orange} {...S} strokeWidth={1.6} />
      <path d="M21 34 V44" {...HL} strokeWidth={4} />
    </>
  ),
  // Carbón: costal con trozos negros
  charcoal: (
    <>
      <path d="M14 22 C10 32 10 46 14 56 C15 58 17 58 20 58 H44 C47 58 49 58 50 56 C54 46 54 32 50 22 Z" fill={C.kraft} {...S} />
      <path d="M14 22 C22 18 42 18 50 22 C42 26 22 26 16 22 Z" fill={C.tan} {...S} />
      <path d="M22 18 L28 8 L34 14 Z" fill={C.dark} {...S} strokeWidth={2} />
      <path d="M32 16 L40 6 L44 16 Z" fill={C.dark} {...S} strokeWidth={2} />
      <path d="M22 36 L28 32 L36 34 L40 40 L34 46 L24 44 Z" fill={C.dark} {...S} strokeWidth={2} />
      <path d="M26 38 L30 36" {...L} stroke={C.steel} strokeWidth={1.8} />
      <path d="M18 30 V38" {...HL} />
    </>
  ),
  lightbulb: (
    <>
      <path d="M32 6 C20 6 14 15 14 24 C14 32 20 36 22 42 H42 C44 36 50 32 50 24 C50 15 44 6 32 6 Z" fill={C.yellow} {...S} />
      <path d="M22 42 H42 V50 H22 Z" fill={C.silver} {...S} />
      <path d="M22 46 H42" {...L} strokeWidth={2} />
      <path d="M26 50 H38 L35 56 H29 Z" fill={C.dark} {...S} />
      <path d="M27 32 L30 24 L32 30 L34 24 L37 32" {...L} stroke={C.orange} strokeWidth={2} />
      <path d="M21 22 C21 17 24 13 28 12" {...HL} strokeWidth={3.5} />
    </>
  ),
  // Pilas AA
  battery: (
    <>
      <rect x={14} y={8} width={6} height={5} rx={1} fill={C.silver} {...S} strokeWidth={2} />
      <rect x={8} y={12} width={18} height={44} rx={4} fill={C.dark} {...S} />
      <path d="M8.5 36 H25.5 V52 C25.5 54 24 55.5 22 55.5 H12 C10 55.5 8.5 54 8.5 52 Z" fill={C.orange} />
      <rect x={8} y={12} width={18} height={44} rx={4} fill="none" {...S} />
      <rect x={38} y={8} width={6} height={5} rx={1} fill={C.silver} {...S} strokeWidth={2} />
      <rect x={32} y={12} width={18} height={44} rx={4} fill={C.dark} {...S} />
      <path d="M32.5 36 H49.5 V52 C49.5 54 48 55.5 46 55.5 H36 C34 55.5 32.5 54 32.5 52 Z" fill={C.orange} />
      <rect x={32} y={12} width={18} height={44} rx={4} fill="none" {...S} />
      <path d="M17 22 V28 M14 25 H20 M38 25 H44" {...L} stroke={C.white} strokeWidth={2.5} />
    </>
  ),
  // Mantenimiento: llave inglesa + desarmador cruzados
  tools: (
    <>
      <g transform="rotate(45 32 32)">
        <rect x={28} y={20} width={8} height={36} rx={3} fill={C.grey} {...S} />
        <path d="M22 8 C22 16 26 20 32 20 C38 20 42 16 42 8 L37 8 V14 H27 V8 Z" fill={C.grey} {...S} />
        <path d="M30 26 V48" {...HL} />
      </g>
      <g transform="rotate(-45 32 32)">
        <path d="M30.5 4 H33.5 V32 H30.5 Z" fill={C.silver} {...S} strokeWidth={2} />
        <rect x={26} y={32} width={12} height={24} rx={4} fill={C.red} {...S} />
        <path d="M30 37 V51 M34 37 V51" {...L} stroke="#B02A35" strokeWidth={2} />
      </g>
    </>
  ),
};
