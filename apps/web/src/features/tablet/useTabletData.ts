import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RT } from '@rh/shared';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/socket';
import { store } from '@/features/common-req/hooks';
import type { LastRequisition, Paged, Requisition, RequisitionTemplate, TabletCatalog } from '@/features/common-req/types';

const CATALOG_KEY = 'rh.tablet.catalog';

/** Catálogo del área con caché local para arrancar sin conexión (TAB-05). */
export function useTabletCatalog() {
  const qc = useQueryClient();
  const cached = store.get<TabletCatalog | null>(CATALOG_KEY, null);
  const q = useQuery({
    queryKey: ['tablet-catalog'],
    queryFn: async () => {
      const c = await api.get<TabletCatalog>('/tablet/catalog');
      store.set(CATALOG_KEY, c);
      return c;
    },
    initialData: cached ?? undefined,
    initialDataUpdatedAt: cached ? 0 : undefined,
    staleTime: 60_000,
  });
  useRealtime([RT.CATALOG_CHANGED, RT.AREA_UPDATED], () => void qc.invalidateQueries({ queryKey: ['tablet-catalog'] }));
  return q;
}

export function useMyRequisitions() {
  return useQuery({
    queryKey: ['requisitions', 'tablet'],
    queryFn: () => api.get<Paged<Requisition>>('/requisitions', { limit: 40 }),
    refetchInterval: 120_000,
  });
}

export function useTemplates() {
  return useQuery({ queryKey: ['req-templates'], queryFn: () => api.get<RequisitionTemplate[]>('/requisition-templates') });
}

export function useLastRequisition() {
  return useQuery({ queryKey: ['req-last'], queryFn: () => api.get<LastRequisition>('/requisitions/last') });
}
