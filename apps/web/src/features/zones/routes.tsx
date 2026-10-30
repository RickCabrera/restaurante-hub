import type { RouteObject } from 'react-router-dom';
import { ZonesPage } from './ZonesPage';

export const adminRoutes: RouteObject[] = [{ path: 'zonas', element: <ZonesPage /> }];
