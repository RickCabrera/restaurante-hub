import type { RouteObject } from 'react-router-dom';
import { ChatPage } from './ChatPage';

export const adminRoutes: RouteObject[] = [
  { path: 'chat', element: <ChatPage /> },
  { path: 'chat/:conversationId', element: <ChatPage /> },
];
