import type { RouteObject } from 'react-router-dom';
import { CatalogPage } from './CatalogPage';

export const adminRoutes: RouteObject[] = [
  { path: 'insumos', element: <CatalogPage /> },
  { path: 'proveedores', element: <CatalogPage initialTab="proveedores" /> },
];
