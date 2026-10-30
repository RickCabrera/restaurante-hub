import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

export const adminRoutes: RouteObject[] = [
  { path: 'clientes', element: <UnderConstruction title="Clientes" /> },
  { path: 'clientes/:id', element: <UnderConstruction title="Cliente" /> },
];
