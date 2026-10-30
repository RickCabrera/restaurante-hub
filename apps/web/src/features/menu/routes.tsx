import type { RouteObject } from 'react-router-dom';
import { MenuPage } from './MenuPage';

export const adminRoutes: RouteObject[] = [{ path: 'menu', element: <MenuPage /> }];
