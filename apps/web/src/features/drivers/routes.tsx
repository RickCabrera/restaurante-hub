import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

export const adminRoutes: RouteObject[] = [
  { path: 'repartidores', element: <UnderConstruction title="Repartidores" /> },
];
export const driverRoutes: RouteObject[] = [
  { index: true, element: <UnderConstruction title="Mis entregas" /> },
];
