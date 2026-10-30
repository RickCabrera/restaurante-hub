import type { RouteObject } from 'react-router-dom';
import { InboxPage } from './InboxPage';
import { DetailPage } from './DetailPage';
import { ShoppingPage } from './ShoppingPage';

export const adminRoutes: RouteObject[] = [
  { path: 'requisiciones', element: <InboxPage /> },
  { path: 'requisiciones/:id', element: <DetailPage /> },
  { path: 'compras', element: <ShoppingPage /> },
];
