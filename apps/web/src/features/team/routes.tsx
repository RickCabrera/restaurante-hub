import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

export const adminRoutes: RouteObject[] = [
  { path: 'equipo', element: <UnderConstruction title="Equipo y tablets" /> },
];
