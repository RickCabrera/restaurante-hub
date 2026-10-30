import { C, S, L, HL } from '../palette';

export const especia: Record<string, JSX.Element> = {
  // Pimentero (molino) + granos
  pepper: (
    <>
      <path d="M26 6 H38 V10 H26 Z" fill={C.dark} {...S} />
      <path d="M22 10 H42 C44 10 46 12 46 16 V20 H18 V16 C18 12 20 10 22 10 Z" fill={C.choco} {...S} />
      <path d="M20 20 H44 C42 28 40 32 40 36 C40 42 44 46 44 52 C44 56 42 58 40 58 H24 C22 58 20 56 20 52 C20 46 24 42 24 36 C24 32 22 28 20 20 Z" fill={C.brown} {...S} />
      <path d="M26 26 C27 30 28 32 28 36" {...HL} opacity={0.5} />
      <g fill={C.dark} stroke="#1f1a17" strokeWidth={1}>
        <circle cx={52} cy={50} r={3} />
        <circle cx={56} cy={56} r={3} />
        <circle cx={49} cy={57} r={3} />
        <circle cx={11} cy={52} r={3} />
        <circle cx={14} cy={58} r={2.6} />
      </g>
    </>
  ),
  // Orégano: ramita de hojas ovaladas
  oregano: (
    <>
      <path d="M32 58 V14" {...L} stroke={C.dkgreen} strokeWidth={3} />
      {[
        [21, 22, -50, C.leaf], [43, 22, 50, C.olive], [20, 35, -55, C.olive], [44, 35, 55, C.leaf], [21, 48, -60, C.leaf], [43, 48, 60, C.olive],
      ].map(([x, y, r, f], i) => (
        <ellipse key={i} cx={x as number} cy={y as number} rx={6} ry={9.5} transform={`rotate(${r} ${x} ${y})`} fill={f as string} {...S} />
      ))}
      <ellipse cx={32} cy={13} rx={5.5} ry={7.5} fill={C.leaf} {...S} />
    </>
  ),
  // Especias: dos frascos de condimento con colores distintos
  spices: (
    <>
      <rect x={8} y={14} width={22} height={8} rx={2} fill={C.dark} {...S} />
      <rect x={8} y={22} width={22} height={34} rx={4} fill={C.ice} {...S} />
      <path d="M8.5 34 H29.5 V52 C29.5 54 28 55.5 26 55.5 H12 C10 55.5 8.5 54 8.5 52 Z" fill={C.red} />
      <rect x={8} y={22} width={22} height={34} rx={4} fill="none" {...S} />
      <rect x={34} y={20} width={22} height={8} rx={2} fill={C.dark} {...S} />
      <rect x={34} y={28} width={22} height={28} rx={4} fill={C.ice} {...S} />
      <path d="M34.5 36 H55.5 V52 C55.5 54 54 55.5 52 55.5 H38 C36 55.5 34.5 54 34.5 52 Z" fill={C.amber} />
      <rect x={34} y={28} width={22} height={28} rx={4} fill="none" {...S} />
      <path d="M13 27 V31 M39 31 V33" {...HL} />
      <g fill="#1f1a17" opacity={0.35}>
        <circle cx={14} cy={42} r={1} />
        <circle cx={22} cy={46} r={1} />
        <circle cx={18} cy={50} r={1} />
        <circle cx={42} cy={44} r={1} />
        <circle cx={48} cy={48} r={1} />
      </g>
    </>
  ),
};
