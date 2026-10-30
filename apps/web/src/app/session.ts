import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ModuleKey } from '@rh/shared';
import { api } from '@/lib/api';
import { useAuth, type BusinessInfo, type DeviceInfo, type PublicUser, type StaffInfo } from '@/lib/auth-store';
import { applyBrand } from '@/lib/theme';

export interface MeResponse {
  kind: 'user' | 'device' | 'agent';
  user?: PublicUser;
  device?: DeviceInfo;
  staff?: StaffInfo | null;
  business: BusinessInfo;
}

/** Carga /auth/me, guarda el negocio y aplica sus colores. */
export function useMe() {
  const session = useAuth((s) => s.session);
  const setBusiness = useAuth((s) => s.setBusiness);
  const q = useQuery({
    queryKey: ['me', session?.kind, session?.kind === 'user' ? session.user.id : session?.kind === 'device' ? session.device.id : null],
    queryFn: () => api.get<MeResponse>('/auth/me'),
    enabled: !!session,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (q.data?.business) {
      setBusiness(q.data.business);
      applyBrand(q.data.business.primaryColor);
    }
  }, [q.data, setBusiness]);
  return q;
}

export function useModuleEnabled(m: ModuleKey): boolean {
  return useAuth((s) => {
    const mods = s.business?.modules;
    if (!mods) return m !== 'pos';
    return !!mods[m];
  });
}

/** Ruta inicial según el tipo de sesión y el rol. */
export function homePathFor(): string {
  const st = useAuth.getState();
  const s = st.session;
  if (!s) return '/login';
  if (s.kind === 'device') {
    if (s.device.purpose === 'KDS') return '/kds';
    if (s.device.purpose === 'POS') return '/pos';
    return '/tablet';
  }
  switch (s.user.role) {
    case 'DRIVER':
      return '/repartidor';
    case 'CASHIER':
    case 'WAITER':
      return st.business?.modules?.pos ? '/pos' : '/admin/pedidos';
    case 'AREA_LEAD':
    case 'STAFF':
      return '/sin-acceso';
    default:
      return '/admin';
  }
}
