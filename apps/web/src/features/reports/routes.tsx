import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

export const adminRoutes: RouteObject[] = [
  { path: 'reportes', element: <UnderConstruction title="Reportes" /> },
  { path: 'reportes/requisiciones', element: <UnderConstruction title="Reporte de requisiciones" /> },
];
