import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

export const publicRoutes: RouteObject[] = [
  { path: 'pedir', element: <UnderConstruction title="Haz tu pedido" /> },
  { path: 'pedido/:token', element: <UnderConstruction title="Tu pedido" /> },
  { path: 'menu-qr', element: <UnderConstruction title="Menú" /> },
];
