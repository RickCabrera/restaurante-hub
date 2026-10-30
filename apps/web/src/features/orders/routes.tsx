import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

export const adminRoutes: RouteObject[] = [
  { path: 'pedidos', element: <UnderConstruction title="Pedidos" /> },
  { path: 'pedidos/nuevo', element: <UnderConstruction title="Nuevo pedido" /> },
  { path: 'pedidos/:id', element: <UnderConstruction title="Pedido" /> },
];
