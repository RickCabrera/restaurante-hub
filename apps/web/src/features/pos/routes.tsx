import type { RouteObject } from 'react-router-dom';
import { PosLayout } from './PosLayout';
import { FloorPage } from './FloorPage';
import { TicketPage } from './TicketPage';
import { CashPage } from './CashPage';
import { TablesAdminPage } from './admin/TablesAdminPage';
import { CashAdminPage } from './admin/CashAdminPage';
import { PosReportPage } from './admin/PosReportPage';

// /pos — pantalla completa con su propia barra (sin menú lateral)
export const posRoutes: RouteObject[] = [
  {
    element: <PosLayout />,
    children: [
      { index: true, element: <FloorPage /> },
      { path: 'cuenta/:id', element: <TicketPage /> },
      { path: 'caja', element: <CashPage /> },
    ],
  },
];

// /admin/...
export const adminRoutes: RouteObject[] = [
  { path: 'caja', element: <CashAdminPage /> },
  { path: 'mesas', element: <TablesAdminPage /> },
  { path: 'reportes/pos', element: <PosReportPage /> },
];
