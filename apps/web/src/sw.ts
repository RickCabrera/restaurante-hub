/// <reference lib="webworker" />
// Service worker: precache de la app (funciona sin conexión) + notificaciones push de la dueña.
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA: cualquier navegación sirve index.html (excepto API y archivos)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/uploads\//, /^\/socket\.io\//] }));

// Catálogo de la tablet y menú público: red primero, caché si no hay conexión
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/tablet/catalog') || url.pathname.includes('/api/public/') && url.pathname.endsWith('/menu'),
  new NetworkFirst({ cacheName: 'rh-api-catalog', networkTimeoutSeconds: 4 }),
);
// Imágenes de insumos y platillos
registerRoute(({ url }) => url.pathname.startsWith('/uploads/'), new StaleWhileRevalidate({ cacheName: 'rh-images' }));

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: 'Restaurante Hub', body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Restaurante Hub', {
      body: data.body,
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url ?? '/admin' },
      requireInteraction: data.tag?.includes('URGENT') ?? false,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/admin';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          void (c as WindowClient).navigate(url);
          return (c as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
