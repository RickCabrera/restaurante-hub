import type { RouteObject } from 'react-router-dom';
import { PromosPage } from './PromosPage';

export const adminRoutes: RouteObject[] = [{ path: 'promociones', element: <PromosPage /> }];
