import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router-dom';
import { PageLoader } from '@/ui';

const SalesReportPage = lazy(() => import('./SalesReportPage').then((m) => ({ default: m.SalesReportPage })));

export const adminRoutes: RouteObject[] = [
  { path: 'reportes/ventas', element: <Suspense fallback={<PageLoader />}><SalesReportPage /></Suspense> },
];
