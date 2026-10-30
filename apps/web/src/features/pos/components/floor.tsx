import { useEffect, useRef, useState } from 'react';
import type { TableShape } from '../api';

/** Tamaño base (px del plano) de cada forma de mesa. */
export function tableSize(shape: TableShape): { w: number; h: number } {
  if (shape === 'rect') return { w: 170, h: 100 };
  return { w: 110, h: 110 };
}

/** Medidas de un elemento (ResizeObserver). */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Caja que contiene todas las mesas (mínimo un lienzo de 600×400). */
export function floorBounds(tables: { posX: number; posY: number; shape: TableShape }[], pad = 20) {
  let w = 600;
  let h = 400;
  for (const t of tables) {
    const s = tableSize(t.shape);
    w = Math.max(w, t.posX + s.w + pad);
    h = Math.max(h, t.posY + s.h + pad);
  }
  return { w, h };
}
