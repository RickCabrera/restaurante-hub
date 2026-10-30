# Arquitectura y convenciones

Guía para desarrollar en este monorepo. Léela completa antes de escribir código.

## Estructura

```
packages/shared     Enums, máquinas de estado, dinero, esquemas zod, íconos, protocolo de impresión (CJS, compilar con `npx tsc -p packages/shared/tsconfig.json`)
packages/printing   Modelo de documento de impresión, plantillas de tickets, renderizadores ESC/POS y HTML
apps/api            NestJS 10 + Drizzle ORM (PostgreSQL) + Socket.IO + BullMQ
apps/web            React 18 + Vite + Tailwind + TanStack Query + Zustand (PWA)
apps/print-agent    Agente de impresión Node (también usado como librería por apps/desktop)
apps/desktop        Electron (.exe) con agente de impresión integrado
apps/mobile         Capacitor (Android .apk) que envuelve apps/web
```

## API (apps/api)

### Base de datos — Drizzle ORM
- Esquema: `src/db/schema/*.ts` (exportado en `src/db/schema/index.ts`). Columnas camelCase en TS, snake_case en BD (`casing: 'snake_case'`).
- Inyección: `constructor(@InjectDb() private readonly db: Db) {}` (import desde `src/db/db.module`).
- Consultas relacionales: `this.db.query.<tabla>.findMany({ where, with, orderBy, limit })` (las relaciones están en `relations.ts`).
- Escrituras: `this.db.insert(t).values(..).returning()`, `this.db.update(t).set(..).where(..).returning()`.
- Transacciones: `await this.db.transaction(async (tx) => { ... })`; usar `tx` dentro. Tipo para funciones que aceptan ambos: `DbOrTx`.
- Operadores: `import { and, eq, inArray, desc, asc, gte, lte, isNull, sql, ilike, or } from 'drizzle-orm'`.
- **Si cambias el esquema**: `cd apps/api && npx drizzle-kit generate --name <cambio>` y revisa el SQL generado en `apps/api/drizzle/`. Nunca edites migraciones ya generadas.
- Dinero siempre en centavos (`integer`). Cantidades de insumos `doublePrecision` (usar `roundQty` de @rh/shared).
- Todas las consultas de negocio deben filtrar por `businessId` del actor (multi-negocio).

### Autenticación y autorización
- Guard global (`src/common/guards/auth.guard.ts`). Por defecto todo endpoint exige sesión.
- Decoradores (`src/common/decorators`):
  - `@Public()` sin sesión (el actor se adjunta si viene token).
  - `@Roles('ADMIN', 'CASHIER', ...)` — OWNER siempre pasa. En dispositivos aplica al personal identificado con PIN.
  - `@AllowDevice('AREA' | 'KDS' | 'POS')` permite tablets emparejadas.
  - `@AllowAgent()` permite agentes de impresión.
  - `@RequiresModule('pos' | 'delivery' | 'requisitions')` → 404 si el módulo está apagado.
  - `@Audit('accion.verbo', 'entidad')` → registra en bitácora automáticamente.
  - `@CurrentActor() actor: Actor` → `{kind:'user'|'device'|'agent', businessId, ...}` (ver `src/common/actor.ts`; helpers `actorName`, `actorUserId`, `isManager`, `effectiveRole`).
- Validación: `@Body(zbody(MiSchemaZod)) dto` (pipe en `src/common/pipes/zod.pipe.ts`). Reutiliza esquemas de `@rh/shared` cuando existan.

### Servicios globales (CoreModule, inyectables en cualquier módulo sin importarlos)
| Servicio | Uso |
|---|---|
| `SettingsService` | `getBusiness(bid)`, `getSettings(bid)` (con defaults), `getBySlug(slug?)`, `isModuleEnabled`, `nextFolio(txOrDb, bid, 'REQ')` → `REQ-000001` |
| `RealtimeService` | `emit(room, event, payload)`, `toManagers(bid, ev, p)`, `toBusiness`, `handle(event, fn)` (mensajes cliente→servidor con ack), `onConnect/onDisconnect`, `roomSize(room)`. Salas en `Rooms` (`src/realtime/realtime.service.ts`). Nombres de eventos en `RT` de `@rh/shared`. |
| `NotificationsService` | `notifyManagers(bid, {type,title,body,link,data,urgent})`, `notifyUsers(bid, userIds, {...})` — in-app + Web Push + WhatsApp a la dueña |
| `JobsService` | `register(name, handler)` en `onModuleInit`, `add(name, data, {delayMs, attempts, jobId})` — BullMQ con Redis o inline sin Redis |
| `AuditService` | `record(actor, {businessId, action, entity, entityId, data})` |
| `StorageService` | `saveImage(file, {folder})` → `{url}` (S3 o disco) |
| `WhatsappClient` | `send(bid, to, OutgoingWa)` (Cloud API o simulador), `verifySignature`, `markRead`, `simulated` |
| `TokenService` | resolución de tokens (rara vez se usa directo) |

Cron: `@Cron('*/1 * * * *')` de `@nestjs/schedule` (ya registrado en AppModule).

### Módulos de negocio
Cada módulo vive en `src/modules/<nombre>/` con su `<nombre>.module.ts` ya registrado en `src/feature-modules.ts`.
Estructura sugerida: `*.controller.ts`, `*.service.ts`, `*.spec.ts` (Jest), `dto.ts` (esquemas zod locales).
Rutas REST en español solo en textos; paths en inglés/kebab: `/api/requisitions`, `/api/menu/products`, `/api/public/:slug/menu`.

### Errores
Usa excepciones de Nest con mensajes en español para el usuario final: `BadRequestException('El insumo no existe')`, `ConflictException` para transiciones inválidas (409), `NotFoundException`.

### Tiempo real
Emite eventos después de confirmar la escritura (fuera de la transacción). Payload = entidad completa que la UI necesita para actualizar su caché sin volver a consultar.

### Pruebas
- Unitarias: Jest, `*.spec.ts` junto al código (`pnpm --filter @rh/api test`). Prueba la lógica pura (cálculos, máquinas de estado, parseo del bot).
- Integración/E2E: `apps/api/test/*.e2e-spec.ts` con Supertest contra BD `restaurante_hub_test`.

## Entorno local
- PostgreSQL en `localhost:5432` (usuario `postgres`, sin contraseña), BD `restaurante_hub` y `restaurante_hub_test`. Redis en `localhost:6379`.
- `apps/api/.env` ya existe. Migrar: `cd apps/api && set -a && . ./.env && set +a && npx ts-node --transpile-only src/db/migrate.ts`
- Seed: `SEED_RESET=1 npx ts-node --transpile-only src/db/seed.ts` (usuarios demo: `duena@demo.mx / demo1234`).
- Typecheck API: `cd apps/api && npx tsc -p tsconfig.json --noEmit`.
- Build API: `npx nest build`; correr: `node dist/main.js` (puerto 3000, prefijo `/api`).

## Textos
Toda la UI y mensajes al usuario en **español de México**. Código, nombres de variables y commits en inglés o español, consistente con el archivo.
