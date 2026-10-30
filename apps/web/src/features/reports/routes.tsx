import type { RouteObject } from 'react-router-dom';
import { ReportsHub, RequisitionsReport } from './ReportsPages';

export const adminRoutes: RouteObject[] = [
  { path: 'reportes', element: <ReportsHub /> },
  { path: 'reportes/requisiciones', element: <RequisitionsReport /> },
];
