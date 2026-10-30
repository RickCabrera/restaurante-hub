import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { roundQty } from '@rh/shared';
import type { Priority } from '@rh/shared';

export interface CartLine {
  supplyId: string;
  qty: number;
  note?: string;
}

interface CartState {
  lines: Record<string, CartLine>;
  /** orden en que se agregaron */
  order: string[];
  priority: Priority;
  note: string;
  setQty: (supplyId: string, qty: number, note?: string) => void;
  setNote: (supplyId: string, note: string) => void;
  remove: (supplyId: string) => void;
  setPriority: (p: Priority) => void;
  setGeneralNote: (n: string) => void;
  load: (items: { supplyId: string; quantity: number }[], replace?: boolean) => void;
  clear: () => void;
}

/** Carrito de la tablet. Se guarda en este dispositivo (sobrevive recargas y apagones). */
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: {},
      order: [],
      priority: 'NORMAL',
      note: '',
      setQty: (supplyId, qty, note) =>
        set((s) => {
          const q = roundQty(Math.max(0, qty));
          if (q <= 0) {
            const { [supplyId]: _, ...rest } = s.lines;
            return { lines: rest, order: s.order.filter((x) => x !== supplyId) };
          }
          const prev = s.lines[supplyId];
          return {
            lines: { ...s.lines, [supplyId]: { supplyId, qty: q, note: note !== undefined ? note : prev?.note } },
            order: prev ? s.order : [...s.order, supplyId],
          };
        }),
      setNote: (supplyId, note) =>
        set((s) => (s.lines[supplyId] ? { lines: { ...s.lines, [supplyId]: { ...s.lines[supplyId], note } } } : s)),
      remove: (supplyId) =>
        set((s) => {
          const { [supplyId]: _, ...rest } = s.lines;
          return { lines: rest, order: s.order.filter((x) => x !== supplyId) };
        }),
      setPriority: (priority) => set({ priority }),
      setGeneralNote: (note) => set({ note }),
      load: (items, replace = true) =>
        set((s) => {
          const lines: Record<string, CartLine> = replace ? {} : { ...s.lines };
          const order = replace ? [] : [...s.order];
          for (const it of items) {
            const prev = lines[it.supplyId];
            lines[it.supplyId] = { supplyId: it.supplyId, qty: roundQty((prev?.qty ?? 0) + it.quantity), note: prev?.note };
            if (!prev) order.push(it.supplyId);
          }
          return { lines, order };
        }),
      clear: () => set({ lines: {}, order: [], priority: 'NORMAL', note: '' }),
    }),
    { name: 'rh.tablet.cart', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

/** Historial local de insumos pedidos (para "Frecuentes"). */
const FREQ_KEY = 'rh.tablet.freq';
export function getFrequency(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FREQ_KEY) ?? '{}');
  } catch {
    return {};
  }
}
export function recordFrequency(supplyIds: string[]) {
  const f = getFrequency();
  for (const id of supplyIds) f[id] = (f[id] ?? 0) + 1;
  try {
    localStorage.setItem(FREQ_KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}
