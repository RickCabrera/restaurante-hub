import type { RouteObject } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';

export const adminRoutes: RouteObject[] = [{ index: true, element: <DashboardPage /> }];
