import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

export const adminRoutes: RouteObject[] = [
  { path: 'insumos', element: <UnderConstruction title="Insumos" /> },
  { path: 'proveedores', element: <UnderConstruction title="Proveedores" /> },
];
