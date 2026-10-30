import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

export const posRoutes: RouteObject[] = [
  { index: true, element: <UnderConstruction title="Punto de venta" /> },
  { path: 'cuenta/:id', element: <UnderConstruction title="Cuenta" /> },
  { path: 'caja', element: <UnderConstruction title="Caja" /> },
];
export const adminRoutes: RouteObject[] = [
  { path: 'caja', element: <UnderConstruction title="Caja y cortes" /> },
  { path: 'mesas', element: <UnderConstruction title="Mesas" /> },
  { path: 'reportes/pos', element: <UnderConstruction title="Reporte de punto de venta" /> },
];
