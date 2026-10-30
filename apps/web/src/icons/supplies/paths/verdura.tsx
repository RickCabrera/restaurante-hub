import { C, S, L, HL, OUTLINE } from '../palette';
import { union } from '../parts';

export const verdura: Record<string, JSX.Element> = {
  tomato: (
    <>
      <ellipse cx={32} cy={37} rx={22} ry={19} fill={C.red} {...S} />
      <path d="M17 34 C18 28 22 24 27 23" {...HL} />
      <path d="M32 17 L36 22 L44 20 L40 26 L32 24 L24 26 L20 20 L28 22 Z" fill={C.leaf} {...S} />
      <path d="M32 21 V11" {...L} strokeWidth={3.5} stroke={C.dkgreen} />
    </>
  ),
  'green-tomato': (
    <>
      <path d="M32 27 C24 12 10 12 8 28 C14 25 20 25 26 30 Z" fill={C.cream} {...S} />
      <path d="M32 27 C40 12 54 12 56 28 C50 25 44 25 38 30 Z" fill={C.cream} {...S} />
      <ellipse cx={32} cy={40} rx={19} ry={16} fill={C.leaf} {...S} />
      <path d="M19 39 C20 34 23 31 27 30" {...HL} />
      <path d="M32 26 V16" {...L} strokeWidth={3.5} />
    </>
  ),
  onion: (
    <>
      <path d="M32 14 C34 22 52 26 52 40 C52 50 43 55 32 55 C21 55 12 50 12 40 C12 26 30 22 32 14 Z" fill={C.lilac} {...S} />
      <path d="M31 19 C22 28 20 44 26 54" {...L} stroke={C.purple} strokeWidth={2.5} />
      <path d="M33 19 C42 28 44 44 38 54" {...L} stroke={C.purple} strokeWidth={2.5} />
      <path d="M18 38 C18 33 20 30 23 28" {...HL} />
      <path d="M32 15 C31 11 33 8 36 7" {...L} stroke={C.leaf} strokeWidth={4} />
      <path d="M27 55 L25 59 M32 56 V59 M37 55 L39 59" {...L} />
    </>
  ),
  garlic: (
    <>
      <path d="M48 34 C57 41 57 54 46 56 C39 57 39 45 48 34 Z" fill={C.cream} {...S} />
      <path d="M27 10 C29 18 46 23 46 38 C46 50 38 55 27 55 C16 55 8 50 8 38 C8 23 25 18 27 10 Z" fill={C.white} {...S} />
      <path d="M27 17 C21 28 21 44 25 54" {...L} />
      <path d="M27 17 C33 28 33 44 29 54" {...L} />
      <path d="M20 24 C13 32 13 46 17 52 M34 24 C41 32 41 46 37 52" {...L} stroke={C.lilac} />
      <path d="M23 55 L22 59 M27 55 V59 M31 55 L32 59" {...L} />
    </>
  ),
  chili: (
    <>
      <path d="M33 18 C32 30 26 42 10 54 C26 56 44 46 49 32 C51 26 49 20 46 18 Z" fill={C.red} {...S} />
      <path d="M43 25 C41 34 35 42 27 47" {...HL} />
      <path d="M30 19 C32 12 46 12 49 19 C44 22 35 22 30 19 Z" fill={C.leaf} {...S} />
      <path d="M40 15 C40 11 42 8 46 7" {...L} stroke={C.dkgreen} strokeWidth={4} />
    </>
  ),
  'bell-pepper': (
    <>
      <path d="M13 32 C12 21 23 18 32 22 C41 18 52 21 51 32 C52 42 50 54 42 56 C38 57 35 55 32 55 C29 55 26 57 22 56 C14 54 12 42 13 32 Z" fill={C.orange} {...S} />
      <path d="M32 26 V52" {...L} stroke="#C25E00" strokeWidth={2.5} />
      <path d="M22 26 C19 34 19 44 22 52 M42 26 C45 34 45 44 42 52" {...L} stroke="#C25E00" strokeWidth={2.5} />
      <path d="M17 34 C17 30 18 28 21 26" {...HL} />
      <path d="M23 23 C25 16 39 16 41 23 C36 26 28 26 23 23 Z" fill={C.leaf} {...S} />
      <path d="M32 19 C32 13 34 10 38 9" {...L} stroke={C.dkgreen} strokeWidth={4} />
    </>
  ),
  avocado: (
    <>
      <path d="M32 7 C40 7 42 17 46 25 C54 35 53 57 32 57 C11 57 10 35 18 25 C22 17 24 7 32 7 Z" fill={C.dkgreen} {...S} />
      <path d="M32 13 C38 13 39 21 42 28 C48 37 47 52 32 52 C17 52 16 37 22 28 C25 21 26 13 32 13 Z" fill={C.lime} />
      <circle cx={32} cy={40} r={8.5} fill={C.brown} {...S} />
      <circle cx={29.5} cy={37.5} r={2.2} fill="#fff" opacity={0.6} />
    </>
  ),
  lettuce: (
    <>
      <path d="M30 56 C14 52 6 34 13 13 C23 15 30 32 32 56 Z" fill={C.leaf} {...S} />
      <path d="M34 56 C50 52 58 34 51 13 C41 15 34 32 32 56 Z" fill={C.leaf} {...S} />
      <path d="M32 57 C21 50 19 26 32 7 C45 26 43 50 32 57 Z" fill={C.mint} {...S} />
      <path d="M32 54 V16" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
      <path d="M32 30 L25 24 M32 40 L24 33 M32 30 L39 24 M32 40 L40 33" {...L} stroke="#fff" strokeWidth={2} />
      <path d="M29 53 C24 44 19 32 16 20 M35 53 C40 44 45 32 48 20" {...L} stroke={C.mint} strokeWidth={2} />
    </>
  ),
  cabbage: (
    <>
      <circle cx={32} cy={34} r={22} fill={C.mint} {...S} />
      <path d="M22 28 C24 20 38 18 42 26" {...L} />
      <path d="M26 33 C28 28 36 28 37 33" {...L} />
      <path d="M10 33 C10 47 20 56 32 56 C44 56 54 47 54 33 C48 42 40 45 32 45 C24 45 16 42 10 33 Z" fill={C.leaf} {...S} />
      <path d="M32 45 V54 M32 47 L23 52 M32 47 L41 52" {...L} stroke={C.dkgreen} />
      <path d="M17 26 C19 21 22 18 26 16" {...HL} />
    </>
  ),
  carrot: (
    <>
      <path d="M42 22 C42 12 45 7 50 7 C51 13 49 19 45 24 Z" fill={C.leaf} {...S} />
      <path d="M44 25 C50 19 55 19 58 22 C55 27 50 29 46 28 Z" fill={C.leaf} {...S} />
      <path d="M38 21 C36 13 38 8 42 7 C45 12 44 18 42 22 Z" fill={C.dkgreen} {...S} />
      <path d="M30 22 C34 17 43 18 46 22 C50 27 49 33 44 36 L14 55 C11 57 8 54 10 51 Z" fill={C.orange} {...S} />
      <path d="M24 34 L28 38 M19 42 L22 45 M33 28 L37 32 M30 40 L33 43" {...L} />
    </>
  ),
  potato: (
    <>
      <path d="M12 35 C10 22 23 13 36 15 C49 16 55 26 53 38 C51 50 40 55 27 53 C17 52 13 45 12 35 Z" fill={C.kraft} {...S} />
      <path d="M19 30 C20 25 24 21 29 20" {...HL} />
      <g fill={C.brown}>
        <circle cx={27} cy={30} r={1.8} />
        <circle cx={41} cy={26} r={1.8} />
        <circle cx={37} cy={42} r={1.8} />
        <circle cx={22} cy={43} r={1.8} />
        <circle cx={46} cy={37} r={1.5} />
      </g>
    </>
  ),
  cucumber: (
    <>
      <g transform="rotate(-38 28 28)">
        <rect x={6} y={18} width={46} height={19} rx={9.5} fill={C.dkgreen} {...S} />
        <path d="M14 24 H44" {...L} stroke={C.leaf} strokeWidth={2.5} />
        <path d="M14 31 H44" {...L} stroke={C.leaf} strokeWidth={2.5} />
      </g>
      <circle cx={45} cy={45} r={11} fill={C.dkgreen} {...S} />
      <circle cx={45} cy={45} r={8} fill={C.lime} />
      <g fill={C.dkgreen}>
        <ellipse cx={45} cy={41} rx={1.2} ry={2} />
        <ellipse cx={41.5} cy={47} rx={1.2} ry={2} transform="rotate(60 41.5 47)" />
        <ellipse cx={48.5} cy={47} rx={1.2} ry={2} transform="rotate(-60 48.5 47)" />
      </g>
    </>
  ),
  cilantro: (
    <>
      <path d="M32 56 L20 26 M32 56 L32 18 M32 56 L44 26 M32 56 L26 36 M32 56 L39 36" {...L} stroke={C.dkgreen} strokeWidth={3} />
      {union(
        C.leaf,
        <>
          <circle cx={17} cy={24} r={6} />
          <circle cx={23} cy={19} r={5} />
          <circle cx={32} cy={13} r={6} />
          <circle cx={27} cy={18} r={4} />
          <circle cx={37} cy={18} r={4} />
          <circle cx={41} cy={19} r={5} />
          <circle cx={47} cy={24} r={6} />
          <circle cx={24} cy={32} r={5} />
          <circle cx={40} cy={32} r={5} />
        </>,
      )}
      <rect x={26} y={44} width={12} height={6} rx={2} fill={C.red} {...S} />
    </>
  ),
  corn: (
    <>
      <path d="M32 8 C42 8 44 24 44 34 C44 46 38 52 32 52 C26 52 20 46 20 34 C20 24 22 8 32 8 Z" fill={C.yellow} {...S} />
      <path d="M27 11 C25 24 25 40 27 50 M32 9 V51 M37 11 C39 24 39 40 37 50" {...L} stroke="#C99700" strokeWidth={1.8} />
      <path d="M22 20 H42 M21 27 H43 M20 34 H44 M21 41 H43 M23 47 H41" {...L} stroke="#C99700" strokeWidth={1.8} />
      <path d="M31 58 C18 56 11 44 13 26 C18 34 22 42 31 46 Z" fill={C.leaf} {...S} />
      <path d="M33 58 C46 56 53 44 51 26 C46 34 42 42 33 46 Z" fill={C.dkgreen} {...S} />
    </>
  ),
  mushroom: (
    <>
      <path d="M24 37 C24 45 22 51 24 55 C28 57 36 57 40 55 C42 51 40 45 40 37 Z" fill={C.cream} {...S} />
      <path d="M9 34 C9 18 21 9 32 9 C43 9 55 18 55 34 C55 38 51 39 47 39 H17 C13 39 9 38 9 34 Z" fill={C.kraft} {...S} />
      <g fill={C.cream}>
        <circle cx={22} cy={22} r={3} />
        <circle cx={34} cy={17} r={2.5} />
        <circle cx={44} cy={26} r={3} />
        <circle cx={30} cy={30} r={2} />
      </g>
    </>
  ),
  broccoli: (
    <>
      <path d="M26 56 L28 36 H36 L38 56 Z" fill={C.mint} {...S} />
      <path d="M30 40 L24 34 M34 40 L40 34" {...L} />
      {union(
        C.dkgreen,
        <>
          <circle cx={18} cy={30} r={9} />
          <circle cx={32} cy={21} r={12} />
          <circle cx={46} cy={30} r={9} />
          <circle cx={25} cy={35} r={7} />
          <circle cx={39} cy={35} r={7} />
        </>,
      )}
      <g fill={C.leaf}>
        <circle cx={26} cy={18} r={2.5} />
        <circle cx={36} cy={15} r={2.5} />
        <circle cx={16} cy={28} r={2.5} />
        <circle cx={46} cy={27} r={2.5} />
        <circle cx={33} cy={28} r={2.5} />
      </g>
    </>
  ),
  zucchini: (
    <>
      <g transform="rotate(-30 32 34)">
        <ellipse cx={30} cy={34} rx={22} ry={12} fill={C.mint} {...S} />
        <path d="M12 30 C22 26 38 26 50 30 M12 38 C22 42 38 42 50 38" {...L} stroke={C.leaf} strokeWidth={2.5} />
        <path d="M10 34 H50" {...L} stroke={C.leaf} strokeWidth={2.5} />
        <rect x={50} y={30.5} width={8} height={7} rx={2} fill={C.dkgreen} {...S} />
      </g>
      <g fill={C.dkgreen} opacity={0.7}>
        <circle cx={22} cy={42} r={1.2} />
        <circle cx={30} cy={34} r={1.2} />
        <circle cx={38} cy={30} r={1.2} />
        <circle cx={26} cy={30} r={1.2} />
      </g>
    </>
  ),
  radish: (
    <>
      <path d="M31 26 C24 24 13 18 15 8 C24 8 30 15 31 26 Z" fill={C.leaf} {...S} />
      <path d="M33 26 C40 24 51 18 49 8 C40 8 34 15 33 26 Z" fill={C.leaf} {...S} />
      <path d="M32 53 L33 59" {...L} strokeWidth={2.5} />
      <circle cx={32} cy={39} r={15} fill={C.magenta} {...S} />
      <path d="M22 50 C26 54 38 54 42 50 C38 55 26 55 22 50 Z" fill={C.white} {...S} />
      <path d="M22 36 C23 32 25 29 29 27" {...HL} />
      <path d="M32 24 V18" {...L} stroke={C.dkgreen} strokeWidth={3} />
    </>
  ),
  eggplant: (
    <>
      <path d="M36 15 C44 15 46 23 44 31 C42 41 47 48 41 54 C35 60 18 58 13 48 C9 38 19 32 25 26 C30 21 29 15 36 15 Z" fill={C.purple} {...S} />
      <path d="M19 44 C19 39 22 35 26 33" {...HL} />
      <path d="M28 20 C30 11 42 10 47 16 C45 22 41 20 38 25 C36 20 32 23 28 20 Z" fill={C.leaf} {...S} />
      <path d="M41 13 C41 10 43 8 46 7" {...L} stroke={C.dkgreen} strokeWidth={4} />
    </>
  ),
  nopal: (
    <>
      <ellipse cx={46} cy={18} rx={7} ry={10} transform="rotate(35 46 18)" fill={C.leaf} {...S} />
      <ellipse cx={28} cy={38} rx={16} ry={20} transform="rotate(-12 28 38)" fill={C.leaf} {...S} />
      <g {...L} stroke={OUTLINE} strokeWidth={1.6}>
        <path d="M21 26 l-2 -2 M21 26 l2 -2 M33 24 l-2 -2 M33 24 l2 -2 M19 38 l-2 -2 M19 38 l2 -2 M30 36 l-2 -2 M30 36 l2 -2 M39 42 l-2 -2 M39 42 l2 -2 M24 49 l-2 -2 M24 49 l2 -2 M34 51 l-2 -2 M34 51 l2 -2 M46 17 l-2 -2 M46 17 l2 -2" />
      </g>
      <g fill={C.lime}>
        <circle cx={21} cy={26} r={1.6} />
        <circle cx={33} cy={24} r={1.6} />
        <circle cx={19} cy={38} r={1.6} />
        <circle cx={30} cy={36} r={1.6} />
        <circle cx={39} cy={42} r={1.6} />
        <circle cx={24} cy={49} r={1.6} />
        <circle cx={34} cy={51} r={1.6} />
        <circle cx={46} cy={17} r={1.6} />
      </g>
    </>
  ),
};
