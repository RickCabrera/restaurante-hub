import type { RouteObject } from 'react-router-dom';
import { SettingsPage } from './SettingsPage';

export const adminRoutes: RouteObject[] = [{ path: 'configuracion', element: <SettingsPage /> }];
