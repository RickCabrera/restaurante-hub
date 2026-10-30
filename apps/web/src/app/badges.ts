import { create } from 'zustand';

/** Contadores del menú lateral. Cada módulo actualiza los suyos (p.ej. pedidos activos, requisiciones pendientes). */
type BadgeKey = 'requisitions' | 'orders' | 'chat' | 'whatsapp';

export const useBadges = create<{ counts: Partial<Record<BadgeKey, number>>; set: (k: BadgeKey, n: number) => void }>((set) => ({
  counts: {},
  set: (k, n) => set((s) => (s.counts[k] === n ? s : { counts: { ...s.counts, [k]: n } })),
}));

export const setBadge = (k: BadgeKey, n: number) => useBadges.getState().set(k, n);
