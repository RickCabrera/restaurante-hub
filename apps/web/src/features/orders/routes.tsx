import type { RouteObject } from 'react-router-dom';
import { MonitorPage } from './MonitorPage';
import { OrderDetailPage } from './OrderDetailPage';
import { NewOrderPage } from './NewOrderPage';

export const adminRoutes: RouteObject[] = [
  { path: 'pedidos', element: <MonitorPage /> },
  { path: 'pedidos/nuevo', element: <NewOrderPage /> },
  { path: 'pedidos/:id', element: <OrderDetailPage /> },
];
