// Copia la build de la app web (apps/web/dist) a apps/mobile/www para empaquetarla en el APK.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', '..', 'web', 'dist');
const dest = path.resolve(here, '..', 'www');

if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error(`No existe ${src}/index.html. Compila primero la web: pnpm --filter @rh/web build`);
  process.exit(1);
}
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });

// El service worker de la PWA no aporta en la app nativa (los archivos ya están en el APK)
// y puede servir versiones viejas tras actualizar el APK: se desactiva.
for (const f of ['sw.js', 'service-worker.js']) {
  const p = path.join(dest, f);
  if (fs.existsSync(p)) fs.writeFileSync(p, "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.registration.unregister()));\n");
}
const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log(`Web copiada a ${dest} (${count(dest)} archivos)`);
