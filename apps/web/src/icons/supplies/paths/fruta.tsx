import { C, S, L, HL } from '../palette';

export const fruta: Record<string, JSX.Element> = {
  lemon: (
    <>
      <circle cx={24} cy={36} r={16} fill={C.leaf} {...S} />
      <path d="M14 32 C15 27 18 24 22 23" {...HL} />
      <path d="M24 20 C26 14 31 12 36 13 C34 18 29 20 24 20 Z" fill={C.dkgreen} {...S} />
      <path d="M36 36 C36 25 45 18 56 20 C58 32 52 44 40 46 Z" fill={C.dkgreen} {...S} />
      <path d="M38.5 41 C39 31 45 25 53 23 C54 32 50 40 41 43 Z" fill={C.lime} />
      <path d="M40 42 L46 30 M40 42 L52 26 M40 42 L49 37" {...L} stroke={C.white} strokeWidth={1.8} />
    </>
  ),
  orange: (
    <>
      <circle cx={32} cy={36} r={20} fill={C.orange} {...S} />
      <path d="M19 32 C20 26 24 22 29 21" {...HL} />
      <g fill="#C25E00">
        <circle cx={40} cy={40} r={1.3} />
        <circle cx={34} cy={46} r={1.3} />
        <circle cx={44} cy={32} r={1.3} />
        <circle cx={26} cy={44} r={1.3} />
      </g>
      <path d="M32 16 C30 10 34 7 37 7" {...L} stroke={C.brown} strokeWidth={3.5} />
      <path d="M33 15 C38 8 47 8 50 12 C45 17 38 18 33 15 Z" fill={C.leaf} {...S} />
    </>
  ),
  banana: (
    <>
      <path d="M12 22 C14 44 30 54 50 46 C54 44 55 40 52 39 C36 42 24 34 20 20 Z" fill={C.yellow} {...S} />
      <path d="M18 24 C22 36 32 44 46 43" {...L} stroke="#C99700" />
      <path d="M22 20 C30 36 42 40 54 36 C56 35 56 32 54 31 C42 32 33 26 28 16 Z" fill={C.butter} {...S} />
      <path d="M26 17 L22 9 L18 11 L20 20" fill={C.brown} {...S} />
    </>
  ),
  apple: (
    <>
      <path d="M32 21 C26 15 12 15 11 30 C10 44 20 57 28 56 C30 56 31 55 32 55 C33 55 34 56 36 56 C44 57 54 44 53 30 C52 15 38 15 32 21 Z" fill={C.red} {...S} />
      <path d="M17 32 C17 27 19 24 23 22" {...HL} />
      <path d="M32 21 C32 15 33 11 36 8" {...L} stroke={C.brown} strokeWidth={3.5} />
      <path d="M34 15 C37 8 46 7 49 11 C45 16 38 17 34 15 Z" fill={C.leaf} {...S} />
    </>
  ),
  pineapple: (
    <>
      <path d="M32 24 L24 8 L30 14 L32 5 L34 14 L40 8 Z" fill={C.leaf} {...S} />
      <path d="M32 24 L18 14 L26 22 Z M32 24 L46 14 L38 22 Z" fill={C.dkgreen} {...S} />
      <ellipse cx={32} cy={41} rx={16} ry={18} fill={C.amber} {...S} />
      <path d="M21 30 L42 54 M18 40 L33 58 M27 25 L46 46 M43 30 L22 54 M46 40 L31 58 M37 25 L18 46" {...L} stroke={C.brown} strokeWidth={1.8} />
    </>
  ),
  strawberry: (
    <>
      <path d="M32 57 C22 52 12 40 12 29 C12 21 20 18 32 20 C44 18 52 21 52 29 C52 40 42 52 32 57 Z" fill={C.red} {...S} />
      <g fill={C.butter}>
        <ellipse cx={22} cy={30} rx={1.3} ry={2} />
        <ellipse cx={32} cy={29} rx={1.3} ry={2} />
        <ellipse cx={42} cy={30} rx={1.3} ry={2} />
        <ellipse cx={27} cy={39} rx={1.3} ry={2} />
        <ellipse cx={37} cy={39} rx={1.3} ry={2} />
        <ellipse cx={32} cy={47} rx={1.3} ry={2} />
        <ellipse cx={21} cy={39} rx={1.1} ry={1.8} />
        <ellipse cx={43} cy={39} rx={1.1} ry={1.8} />
      </g>
      <path d="M32 23 L22 25 L25 18 L18 14 L28 14 L32 8 L36 14 L46 14 L39 18 L42 25 Z" fill={C.leaf} {...S} />
    </>
  ),
  mango: (
    <>
      <path d="M18 18 C30 6 54 14 54 34 C54 50 40 58 28 55 C14 52 8 40 10 30 C11 24 14 21 18 18 Z" fill={C.yellow} {...S} />
      <path d="M38 13 C48 16 54 26 54 34 C54 46 46 54 38 56 C44 48 46 30 38 13 Z" fill={C.red} />
      <path d="M38 13 C46 26 46 44 38 56" fill="none" stroke={C.orange} strokeWidth={6} opacity={0.8} />
      <path d="M18 18 C30 6 54 14 54 34 C54 50 40 58 28 55 C14 52 8 40 10 30 C11 24 14 21 18 18 Z" fill="none" {...S} />
      <path d="M16 32 C16 27 19 23 23 21" {...HL} />
      <path d="M22 16 C20 11 21 8 24 6" {...L} stroke={C.brown} strokeWidth={3.5} />
      <path d="M24 10 C28 3 38 3 41 7 C36 12 29 13 24 10 Z" fill={C.leaf} {...S} />
    </>
  ),
  watermelon: (
    <>
      <path d="M6 24 H58 C58 42 46 55 32 55 C18 55 6 42 6 24 Z" fill={C.dkgreen} {...S} />
      <path d="M11 24 H53 C53 39 43 50 32 50 C21 50 11 39 11 24 Z" fill={C.white} />
      <path d="M14 24 H50 C50 37 42 47 32 47 C22 47 14 37 14 24 Z" fill={C.red} />
      <path d="M6 24 H58" {...L} strokeWidth={2.5} />
      <g fill={C.dark}>
        <ellipse cx={24} cy={31} rx={1.5} ry={2.3} />
        <ellipse cx={32} cy={36} rx={1.5} ry={2.3} />
        <ellipse cx={40} cy={31} rx={1.5} ry={2.3} />
        <ellipse cx={28} cy={41} rx={1.5} ry={2.3} />
        <ellipse cx={36} cy={41} rx={1.5} ry={2.3} />
      </g>
    </>
  ),
  grapes: (
    <>
      <path d="M32 16 C32 12 34 9 37 7" {...L} stroke={C.brown} strokeWidth={3.5} />
      <path d="M34 13 C40 6 50 8 52 13 C46 17 39 17 34 13 Z" fill={C.leaf} {...S} />
      <g fill={C.purple} {...S}>
        <circle cx={21} cy={23} r={7} />
        <circle cx={32} cy={22} r={7} />
        <circle cx={43} cy={23} r={7} />
        <circle cx={26} cy={34} r={7} />
        <circle cx={38} cy={34} r={7} />
        <circle cx={32} cy={45} r={7} />
        <circle cx={22} cy={44} r={6} opacity={0} />
      </g>
      <g fill={C.lilac}>
        <circle cx={19} cy={21} r={2} />
        <circle cx={30} cy={20} r={2} />
        <circle cx={41} cy={21} r={2} />
        <circle cx={24} cy={32} r={2} />
        <circle cx={36} cy={32} r={2} />
        <circle cx={30} cy={43} r={2} />
      </g>
      <circle cx={32} cy={55} r={0} />
    </>
  ),
  coconut: (
    <>
      <circle cx={24} cy={36} r={17} fill={C.brown} {...S} />
      <path d="M12 30 L16 34 M18 22 L21 26 M14 42 L18 44 M28 22 L29 26" {...L} stroke={C.choco} />
      <path d="M32 36 C32 24 44 20 52 26 C58 32 56 46 46 50 C38 52 32 46 32 36 Z" fill={C.brown} {...S} />
      <path d="M36 37 C36 28 45 25 50 29 C54 34 52 44 45 46 C40 47 36 43 36 37 Z" fill={C.white} />
      <path d="M38 38 C38 32 43 29 47 31" {...L} stroke={C.silver} strokeWidth={2} />
    </>
  ),
};
