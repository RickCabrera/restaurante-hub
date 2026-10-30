import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

export const adminRoutes: RouteObject[] = [
  { path: 'reportes/ventas', element: <UnderConstruction title="Reporte de ventas" /> },
];
