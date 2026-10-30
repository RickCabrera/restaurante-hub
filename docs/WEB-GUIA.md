# Guía para construir pantallas (apps/web)

## Stack y utilidades ya listas
- React 18 + React Router 6 + TanStack Query 5 + Zustand + Tailwind 3. Alias `@/` = `apps/web/src`. `@rh/shared` y `@rh/printing` se importan como fuente.
- **API**: `import { api, ApiError } from '@/lib/api'` → `api.get<T>(path, query?)`, `api.post<T>(path, body)`, `put`, `patch`, `del`, `api.upload(file, folder)` → `{url}`, `api.download(path, filename, query?)`. Paths SIN `/api` (ej. `api.get('/requisitions')`). Maneja tokens, refresh, `X-Staff-Token` (PIN) y errores (`ApiError.message` en español, `fieldErrors`).
- **Tiempo real**: `import { useRealtime, emitAck, getSocket, useSocketStatus } from '@/lib/socket'`. `useRealtime(RT.REQUISITION_CREATED, (payload) => …)`; nombres en `RT` de `@rh/shared`. Patrón: al recibir evento, actualizar la caché con `queryClient.setQueryData` o `invalidateQueries`.
- **Sesión**: `useAuth` (`session`, `staff`, `business`), `useEffectiveRole()`, `isManagerRole()` en `@/lib/auth-store`; `useModuleEnabled('pos')` en `@/app/session`.
- **Formato**: `money(cents)`, `qtyWithUnit(q, unit)`, `fmtDateTime`, `fmtTime`, `timeAgo`, `minutesSince`, `todayISO()` en `@/lib/format`. Dinero SIEMPRE en centavos.
- **Sonidos**: `sounds.tap/newOrder/message/urgent/success/error()`, `vibrate()` en `@/lib/sound`.
- **Contadores del menú**: `setBadge('requisitions'|'orders'|'chat'|'whatsapp', n)` en `@/app/badges`.
- **UI kit** (`@/ui`): `Button` (variant primary|secondary|ghost|outline|danger|success, size sm|md|lg|xl, loading, icon, block), `IconButton`, `Input`, `Textarea`, `Select` (options), `Toggle`, `Checkbox`, `Field`, `Modal` (title, footer, size, sheet), `toast.success/error/info/fromError`, `confirm({title, description, danger, input:{label, required}})` → `Promise<string|false>`, `Badge` (tone), `Avatar`, `PageHeader` (title, subtitle, actions), `Tabs`, `StatCard`, `NumberPad`, `Spinner`, `PageLoader`, `EmptyState`, `ErrorState`, `Skeleton`.
- **Componentes**: `StaffPin` (`@/components/StaffPin`) pantalla "¿Quién eres?" + PIN para tablets; `roleLabel(role)`.
- **Íconos de insumos**: `SupplyIcon`, `IconPicker` en `@/icons/supplies`. Íconos generales: `lucide-react`.
- **Plataforma/impresión**: `@/platform` (ver `apps/web/src/platform/index.ts`).
- Clases utilitarias propias: `card`, `input`, `label`, `chip`, `h-display` (títulos), `scroll-thin`, `safe-bottom`, `no-select`. Colores: `brand`, `brand-50/100/600/700`, `ink`, `ink-soft`, `ink-mute`, `surface`, `surface-raised`, `surface-sunken`, `line`, `ok`, `warn`, `danger`, `info`. Soportan modo oscuro automáticamente: NO uses `bg-white`, `text-gray-*` ni colores fijos de Tailwind para fondos/texto.

## Rutas
Cada módulo exporta sus rutas en `src/features/<modulo>/routes.tsx` (ya registradas en `src/app/routes.tsx`): `adminRoutes` (hijas de `/admin`, paths relativos sin `/`), `tabletRoutes` (`/tablet`), `kdsRoutes`, `posRoutes`, `driverRoutes`, `publicRoutes` (paths sin `/`, se montan en la raíz). Usa `{ index: true, element }` para la raíz de cada sección. Puedes usar `lazy` de React para páginas pesadas.
El menú lateral está en `src/app/nav.ts` (rutas ya definidas: no cambies los paths).

## Calidad
- Español de México, textos claros y cortos. Estados vacíos, de carga y de error en cada pantalla.
- Responsive: celular (la dueña usa el celular), tablet 10" horizontal y escritorio.
- Accesible: botones con texto o `aria-label`, contraste, foco visible.
- Optimistic UI cuando la acción es frecuente (toque de insumo, marcar listo).
- `cd apps/web && npx tsc -b --noEmit` sin errores.

## Probar con el backend
Cada ingeniero usa su propia base y puertos (ver su prompt). Ejemplo:
```bash
cd apps/api && set -a && . ./.env && set +a
DATABASE_URL=postgres://postgres@localhost:5432/<tu_db> PORT=<puerto_api> node dist/main.js   # tras `npx nest build`
cd apps/web && VITE_PROXY_TARGET=http://localhost:<puerto_api> npx vite --port <puerto_web>
```
Para ver las pantallas usa Playwright (devDependency de apps/web) con `chromium.launch({ executablePath: "/opt/google/chrome/chrome" })` (no descargues navegadores: no hay acceso) con capturas en el directorio scratchpad, y revisa las capturas con la herramienta Read.
