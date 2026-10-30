import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { AdminLayout } from '@/layouts/AdminLayout';
import { Guard } from './guards';
import { homePathFor } from './session';
import { LoginPage } from '@/pages/LoginPage';
import { PairDevicePage } from '@/pages/PairDevicePage';
import { ServerSetupPage } from '@/pages/ServerSetupPage';
import { NoAccessPage, NotFoundPage } from '@/pages/StatusPages';

// Cada módulo define sus rutas en src/features/<modulo>/routes.tsx
import * as dashboard from '@/features/dashboard/routes';
import * as requisitions from '@/features/requisitions/routes';
import * as catalog from '@/features/catalog/routes';
import * as chat from '@/features/chat/routes';
import * as team from '@/features/team/routes';
import * as settings from '@/features/settings/routes';
import * as reports from '@/features/reports/routes';
import * as tablet from '@/features/tablet/routes';
import * as orders from '@/features/orders/routes';
import * as menu from '@/features/menu/routes';
import * as customers from '@/features/customers/routes';
import * as zones from '@/features/zones/routes';
import * as promos from '@/features/promos/routes';
import * as whatsapp from '@/features/whatsapp/routes';
import * as drivers from '@/features/drivers/routes';
import * as publicPages from '@/features/public/routes';
import * as sales from '@/features/sales/routes';
import * as printing from '@/features/printing/routes';
import * as kds from '@/features/kds/routes';
import * as pos from '@/features/pos/routes';

function Home() {
  return <Navigate to={homePathFor()} replace />;
}

export const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/emparejar', element: <PairDevicePage /> },
  { path: '/servidor', element: <ServerSetupPage /> },
  { path: '/sin-acceso', element: <NoAccessPage /> },

  // Panel de la dueña / administración (caja y mesero ven solo lo permitido por el menú y cada página)
  {
    path: '/admin',
    element: (
      <Guard roles={['OWNER', 'ADMIN', 'CASHIER']}>
        <AdminLayout />
      </Guard>
    ),
    children: [
      ...dashboard.adminRoutes,
      ...requisitions.adminRoutes,
      ...catalog.adminRoutes,
      ...chat.adminRoutes,
      ...team.adminRoutes,
      ...settings.adminRoutes,
      ...reports.adminRoutes,
      ...orders.adminRoutes,
      ...menu.adminRoutes,
      ...customers.adminRoutes,
      ...zones.adminRoutes,
      ...promos.adminRoutes,
      ...whatsapp.adminRoutes,
      ...drivers.adminRoutes,
      ...sales.adminRoutes,
      ...printing.adminRoutes,
      ...pos.adminRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },

  // Tablet de área (requisiciones + chat) — dispositivo emparejado con propósito AREA
  { path: '/tablet', element: <Guard devices={['AREA']}><TabletOutlet /></Guard>, children: tablet.tabletRoutes },

  // Pantalla de cocina (KDS) — dispositivo KDS o dueña
  { path: '/kds', element: <Guard devices={['KDS']} roles={['OWNER', 'ADMIN']}><KdsOutlet /></Guard>, children: kds.kdsRoutes },

  // Punto de venta (módulo opcional) — tablet POS con PIN o usuario caja/mesero
  { path: '/pos', element: <Guard devices={['POS']} roles={['OWNER', 'ADMIN', 'CASHIER', 'WAITER']} module="pos"><PosOutlet /></Guard>, children: pos.posRoutes },

  // Repartidor
  { path: '/repartidor', element: <Guard roles={['DRIVER', 'OWNER', 'ADMIN']} module="delivery"><DriverOutlet /></Guard>, children: drivers.driverRoutes },

  // Páginas públicas para clientes (menú web, seguimiento, menú QR)
  ...publicPages.publicRoutes.map((r) => ({ ...r, path: `/${r.path}` })),

  { path: '*', element: <NotFoundPage /> },
];

import { Outlet } from 'react-router-dom';
function TabletOutlet() {
  return <div className="h-full"><Outlet /></div>;
}
function KdsOutlet() {
  return <div className="h-full"><Outlet /></div>;
}
function PosOutlet() {
  return <div className="h-full"><Outlet /></div>;
}
function DriverOutlet() {
  return <div className="min-h-full"><Outlet /></div>;
}
