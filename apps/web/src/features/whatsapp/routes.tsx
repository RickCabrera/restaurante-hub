import type { RouteObject } from 'react-router-dom';
import { UnderConstruction } from '@/pages/StatusPages';

export const adminRoutes: RouteObject[] = [
  { path: 'whatsapp', element: <UnderConstruction title="WhatsApp" /> },
  { path: 'whatsapp/simulador', element: <UnderConstruction title="Simulador de WhatsApp" /> },
];
