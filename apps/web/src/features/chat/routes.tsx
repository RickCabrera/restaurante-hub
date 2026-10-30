import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

export const adminRoutes: RouteObject[] = [
  { path: 'chat', element: <UnderConstruction title="Mensajes" /> },
  { path: 'chat/:conversationId', element: <UnderConstruction title="Conversación" /> },
];
