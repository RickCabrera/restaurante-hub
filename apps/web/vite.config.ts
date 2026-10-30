import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// La app se sirve igual en web, dentro de la app de escritorio (Electron) y en Android (Capacitor).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg', 'sounds/*.mp3'],
      manifest: {
        name: 'Restaurante Hub',
        short_name: 'Restaurante',
        description: 'Requisiciones, pedidos y punto de venta para tu restaurante',
        theme_color: '#E85D04',
        background_color: '#FFF8F1',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        lang: 'es-MX',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,mp3,woff2}'], maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@rh/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@rh/printing': path.resolve(__dirname, '../../packages/printing/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
});
