import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { ModuleKey, Role } from '@rh/shared';
import { useAuth } from '@/lib/auth-store';
import { useMe, useModuleEnabled } from './session';
import { EmptyState, PageLoader } from '@/ui';

type Purpose = 'AREA' | 'KDS' | 'POS';

/**
 * Protege rutas.
 *  - roles: roles de usuario permitidos (OWNER siempre pasa)
 *  - devices: propósitos de tablet permitidos (AREA/KDS/POS)
 *  - module: módulo que debe estar activo
 */
export function Guard({ children, roles, devices, module }: { children: ReactNode; roles?: Role[]; devices?: Purpose[]; module?: ModuleKey }) {
  const session = useAuth((s) => s.session);
  const location = useLocation();
  const me = useMe();
  const moduleOn = useModuleEnabled(module ?? 'requisitions');

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.isLoading && !useAuth.getState().business) return <PageLoader />;

  if (session.kind === 'device') {
    if (!devices?.includes(session.device.purpose)) return <Navigate to="/" replace />;
  } else {
    const r = session.user.role;
    if (roles && r !== 'OWNER' && !roles.includes(r)) return <Navigate to="/" replace />;
    if (!roles && devices) return <Navigate to="/" replace />;
  }
  if (module && !moduleOn) {
    return <EmptyState title="Módulo no activado" description="Actívalo en Configuración → Módulos." className="h-full" />;
  }
  return <>{children}</>;
}
