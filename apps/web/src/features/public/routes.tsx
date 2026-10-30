import { lazy, Suspense, type ReactNode } from 'react';
import type { RouteObject } from 'react-router-dom';
import { PublicSkeleton } from './states';

const OrderPage = lazy(() => import('./OrderPage').then((m) => ({ default: m.OrderPage })));
const TrackingPage = lazy(() => import('./TrackingPage').then((m) => ({ default: m.TrackingPage })));
const QrMenuPage = lazy(() => import('./QrMenuPage').then((m) => ({ default: m.QrMenuPage })));

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<PublicSkeleton />}>{children}</Suspense>;

export const publicRoutes: RouteObject[] = [
  { path: 'pedir', element: <S><OrderPage /></S> },
  { path: 'pedido/:token', element: <S><TrackingPage /></S> },
  { path: 'menu-qr', element: <S><QrMenuPage /></S> },
];
