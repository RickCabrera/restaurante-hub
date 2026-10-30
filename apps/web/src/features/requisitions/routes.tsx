import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

export const adminRoutes: RouteObject[] = [
  { path: 'requisiciones', element: <UnderConstruction title="Requisiciones" /> },
  { path: 'requisiciones/:id', element: <UnderConstruction title="Requisición" /> },
  { path: 'compras', element: <UnderConstruction title="Lista de compras" /> },
];
