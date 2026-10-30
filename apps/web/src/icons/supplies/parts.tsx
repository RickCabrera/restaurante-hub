import { OUTLINE } from './palette';

/**
 * Dibuja varias figuras como una sola silueta: primero un contorno grueso y luego el relleno encima,
 * así las uniones internas no muestran línea. Las figuras no deben traer fill/stroke propios.
 */
export function union(fill: string, shapes: JSX.Element) {
  return (
    <>
      <g fill={fill} stroke={OUTLINE} strokeWidth={5} strokeLinejoin="round">
        {shapes}
      </g>
      <g fill={fill}>{shapes}</g>
    </>
  );
}

/** Trazo grueso con contorno (popotes, asas, mangos…). */
export function tube(d: string, color: string, width = 5) {
  return (
    <>
      <path d={d} fill="none" stroke={OUTLINE} strokeWidth={width + 5} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}
