import type { RouteObject } from 'react-router-dom';
import { CustomersPage } from './CustomersPage';
import { CustomerDetailPage } from './CustomerDetailPage';

export const adminRoutes: RouteObject[] = [
  { path: 'clientes', element: <CustomersPage /> },
  { path: 'clientes/:id', element: <CustomerDetailPage /> },
];
