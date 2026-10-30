/**
 * delivery-common/queries — Hooks de TanStack Query y claves de caché compartidas (sesión de staff).
 *
 * Claves: `dk.orders(params)`, `dk.order(id)`, `dk.branches`, `dk.drivers`, `dk.menu(channel)`, `dk.zones`, `dk.areas`.
 * Exporta:
 * - `useBranches()`, `useDrivers()`, `useAreas()`, `useMenu(channel)`, `useZones()`
 * - `upsertOrderInCaches(qc, order)` actualiza `['orders', ...]` y `['order', id]` con un OrderView (para eventos RT).
 * - `useOrderRealtime()` suscribe order.created/order.updated → actualiza caches; menu.changed → invalida menú;
 *    store.status → invalida sucursales/zonas. Llamarlo una vez por página que muestre esos datos.
 */
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { RT } from '@rh/shared';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/socket';
import type { Area, Branch, Driver, MenuCategory, OrderView, Zone } from './types';

export const dk = {
  orders: (params?: unknown) => ['orders', params ?? {}] as const,
  order: (id: string) => ['order', id] as const,
  branches: ['branches'] as const,
  drivers: ['drivers'] as const,
  menu: (channel: string) => ['menu', channel] as const,
  zones: ['zones'] as const,
  areas: ['areas'] as const,
};

export const useBranches = () => useQuery({ queryKey: dk.branches, queryFn: () => api.get<Branch[]>('/branches') });
export const useDrivers = () => useQuery({ queryKey: dk.drivers, queryFn: () => api.get<Driver[]>('/drivers') });
export const useAreas = () => useQuery({ queryKey: dk.areas, queryFn: () => api.get<Area[]>('/areas'), staleTime: 5 * 60_000 });
export const useZones = () => useQuery({ queryKey: dk.zones, queryFn: () => api.get<Zone[]>('/zones') });
export const useMenu = (channel: 'pos' | 'web' | 'whatsapp' | 'qr' = 'pos', branchId?: string) =>
  useQuery({ queryKey: [...dk.menu(channel), branchId ?? ''], queryFn: () => api.get<MenuCategory[]>('/menu', { channel, branchId }) });

type OrderList = { items: OrderView[]; total: number };

export function upsertOrderInCaches(qc: QueryClient, o: OrderView) {
  qc.setQueryData(dk.order(o.id), o);
  qc.setQueriesData<OrderList>({ queryKey: ['orders'] }, (old) => {
    if (!old?.items) return old;
    const i = old.items.findIndex((x) => x.id === o.id);
    if (i < 0) return old;
    const items = old.items.slice();
    items[i] = o;
    return { ...old, items };
  });
}

export function useOrderRealtime(opts: { onCreated?: (o: OrderView) => void; onUpdated?: (o: OrderView) => void } = {}) {
  const qc = useQueryClient();
  useRealtime<OrderView>(RT.ORDER_CREATED, (o) => {
    if (!o?.id) return;
    qc.setQueryData(dk.order(o.id), o);
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: dk.drivers });
    opts.onCreated?.(o);
  });
  useRealtime<OrderView | { driverSettlement: unknown }>(RT.ORDER_UPDATED, (o) => {
    if ('driverSettlement' in o) {
      void qc.invalidateQueries({ queryKey: dk.drivers });
      void qc.invalidateQueries({ queryKey: ['driver-summary'] });
      return;
    }
    if (!o?.id) return;
    upsertOrderInCaches(qc, o);
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: dk.drivers });
    opts.onUpdated?.(o);
  });
  useRealtime(RT.MENU_CHANGED, () => {
    void qc.invalidateQueries({ queryKey: ['menu'] });
    void qc.invalidateQueries({ queryKey: ['menu-admin'] });
  });
  useRealtime<{ zonesChanged?: boolean }>(RT.STORE_STATUS, (p) => {
    void qc.invalidateQueries({ queryKey: dk.branches });
    if (p?.zonesChanged) void qc.invalidateQueries({ queryKey: dk.zones });
  });
}
