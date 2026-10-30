# Despliegue en Railway

Un solo servicio sirve la API y la app web (mismo dominio, sin CORS), más PostgreSQL y Redis administrados.

```
Railway project
├── restaurante-hub   (Dockerfile de la raíz)  → https://<app>.up.railway.app
├── Postgres
└── Redis
```

## 1. Crear el proyecto
1. Sube el repositorio a GitHub.
2. Railway → New Project → Deploy from GitHub repo → elige el repo. Railway usa `Dockerfile` y `railway.json` (healthcheck `/api/health`).
3. Agrega **PostgreSQL** y **Redis** al proyecto.

## 2. Variables del servicio

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | `node scripts/gen-secrets.mjs` |
| `APP_URL` / `API_URL` | la URL pública del servicio (Settings → Networking → Generate Domain) |
| `DEFAULT_BUSINESS_SLUG` | slug del negocio, p. ej. `lacocina` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | `node scripts/gen-vapid.mjs` |
| `BOOTSTRAP_*` | alta automática de la dueña en el primer arranque (ver abajo) |

Opcionales: WhatsApp (`WHATSAPP_*`), Google Maps (`GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`), imágenes en bucket (`S3_*`), respaldos (`BACKUP_S3_BUCKET`). Lista completa y descripción: [`.env.example`](../.env.example).

> Las variables `VITE_*` se leen al **compilar** la web: después de cambiarlas, redespliega.

## 3. Primer arranque
En cada deploy el contenedor ejecuta:
1. `node dist/db/migrate.js` — aplica migraciones pendientes.
2. `node dist/db/bootstrap.js` — si `BOOTSTRAP_OWNER_EMAIL` y `BOOTSTRAP_OWNER_PASSWORD` existen, crea el negocio (`BOOTSTRAP_BUSINESS_NAME`, `BOOTSTRAP_BUSINESS_SLUG`) y la cuenta de la dueña. Si ya existen, no hace nada.
3. `node dist/main.js` — API + web.

Entra a `https://<app>/login` con la cuenta de la dueña y **borra `BOOTSTRAP_OWNER_PASSWORD`** de las variables.

Para datos de demostración (solo pruebas): `pnpm db:seed` contra la base de datos de Railway (`railway run pnpm db:seed` desde tu computadora con el CLI de Railway).

## 4. Verificación
`GET https://<app>/api/health` responde algo como:

```json
{ "status": "ok", "database": "ok", "queue": "redis", "storage": "s3", "whatsapp": "conectado", "maps": "google", "push": "activo" }
```

Cada valor indica qué integración está activa; los valores alternos (`inline`, `local`, `simulador`, `openstreetmap`, `inactivo`) significan que el sistema funciona con su modo de respaldo.

## 5. Imágenes y respaldos
- Sin bucket, las imágenes se guardan en el disco del contenedor y **se pierden en cada deploy**. En producción configura un bucket S3 compatible (Cloudflare R2 recomendado) con `S3_*`, o agrega un **Volume** de Railway montado en `/app/apps/api/uploads`.
- Respaldos diarios: `BACKUP_S3_BUCKET` (bucket privado). Se guardan como `backups/AAAA-MM-DD-HH-MM-SS.sql.gz` y se conservan 30 días.

## 6. WhatsApp
Webhook: `https://<app>/api/whatsapp/webhook` con el token `WHATSAPP_VERIFY_TOKEN`. Pasos y plantillas en [WHATSAPP.md](WHATSAPP.md).

## 7. Apps
- Android (.apk) y Windows (.exe): GitHub → Actions → *Release Android* / *Release Desktop*. Ver [APPS.md](APPS.md).
- Agente de impresión para PC/Raspberry: [IMPRESION.md](IMPRESION.md).
