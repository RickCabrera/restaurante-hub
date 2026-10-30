import { lazy, Suspense, type ReactNode } from 'react';
import type { RouteObject } from 'react-router-dom';
import { PageLoader } from '@/ui';

const InboxPage = lazy(() => import('./InboxPage').then((m) => ({ default: m.InboxPage })));
const SimulatorPage = lazy(() => import('./SimulatorPage').then((m) => ({ default: m.SimulatorPage })));
const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<PageLoader />}>{children}</Suspense>;

export const adminRoutes: RouteObject[] = [
  { path: 'whatsapp', element: <S><InboxPage /></S> },
  { path: 'whatsapp/simulador', element: <S><SimulatorPage /></S> },
  { path: 'whatsapp/:id', element: <S><InboxPage /></S> },
];
