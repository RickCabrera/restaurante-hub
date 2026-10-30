import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

import { DriversPage as DriversAdminPage } from './admin/DriversPage';
export const adminRoutes: RouteObject[] = [
  { path: 'repartidores', element: <DriversAdminPage /> },
];
// --- App del repartidor (/repartidor) — dueño: equipo público/repartidor/WhatsApp ---
import { DriverApp } from './app/DriverApp';
export const driverRoutes: RouteObject[] = [
  { index: true, element: <DriverApp /> },
];
