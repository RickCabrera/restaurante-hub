import type { RouteObject } from 'react-router-dom';
import { PrintersPage } from './PrintersPage';

export const adminRoutes: RouteObject[] = [{ path: 'impresoras', element: <PrintersPage /> }];
