# Prompt para Claude en Chrome — Integración de servicios externos

> Copia TODO el bloque de abajo y pégalo en Claude (extensión de Chrome) con tu navegador ya conectado a GitHub, Railway, Meta for Developers, Google Cloud y Cloudflare (inicia sesión en cada uno antes de empezar).
> Reemplaza lo que está entre `<< >>`.

---

```
Eres mi asistente de despliegue. Vas a conectar los servicios externos de mi sistema "Restaurante Hub"
(requisiciones internas + delivery con bot de WhatsApp + punto de venta). El código ya está terminado;
NO modifiques código. Trabaja en mi navegador, paso a paso, y antes de cada acción irreversible
(crear recursos de pago, publicar, borrar) pídeme confirmación. No escribas contraseñas ni datos de tarjeta:
cuando un formulario los pida, detente y pídeme que yo los capture. Al final entrégame un resumen con
todas las URLs, IDs y variables configuradas (sin mostrar secretos completos).

DATOS
- Repositorio: <<URL del repo en GitHub, p. ej. https://github.com/miusuario/restaurante-hub>>
- Nombre del negocio: <<La Cocina de ...>>
- Slug del negocio (minúsculas, sin espacios): <<lacocina>>
- Correo de la dueña: <<correo>>
- Teléfono de la dueña para alertas por WhatsApp (con 52): <<52155...>>
- Número de WhatsApp para el bot (nuevo, sin usar en la app de WhatsApp): <<52...>>
- Dominio propio (opcional): <<pedidos.mirestaurante.com o "ninguno">>

PASO 1 — RAILWAY (proyecto, base de datos, Redis, app)
1. Entra a https://railway.com/new y crea un proyecto "Restaurante Hub" con "Deploy from GitHub repo",
   eligiendo el repositorio indicado (autoriza la app de Railway en GitHub si lo pide; pídeme confirmación).
   Railway detecta el Dockerfile y railway.json de la raíz: no cambies el builder.
2. En el mismo proyecto agrega "Database → PostgreSQL" y "Database → Redis".
3. En el servicio de la app → Variables, agrega (usa "Add Reference" para las de base de datos):
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   REDIS_URL = ${{Redis.REDIS_URL}}
   NODE_ENV = production
   SERVE_WEB = true
   DEFAULT_BUSINESS_SLUG = <<slug>>
   JWT_SECRET = (genera 64 caracteres aleatorios: usa la consola del navegador con
     crypto.getRandomValues y conviértelo a base64url; no me lo muestres completo)
   WHATSAPP_VERIFY_TOKEN = (genera 32 caracteres aleatorios y guárdalo para el Paso 3)
   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT = mailto:<<correo>>
     (si no puedes generarlas en el navegador, déjalas pendientes y avísame: las genero con
      `node scripts/gen-vapid.mjs` en mi computadora y te las paso)
4. Settings → Networking → "Generate Domain". Copia la URL pública (https://xxxx.up.railway.app) y agrega:
   APP_URL = <<esa URL>>
   API_URL = <<esa URL>>
   Si tengo dominio propio, agrégalo en "Custom Domain", muéstrame el registro CNAME que debo crear y usa ese dominio en APP_URL/API_URL.
5. Despliega (Deploy). Espera a que el healthcheck /api/health pase. Abre <<URL>>/api/health y confirma
   "status":"ok" y "database":"ok".
6. Crear la cuenta de la dueña (sin terminal): agrega en Variables
   BOOTSTRAP_BUSINESS_NAME = <<Nombre del negocio>>
   BOOTSTRAP_BUSINESS_SLUG = <<slug>>
   BOOTSTRAP_OWNER_NAME = <<Nombre de la dueña>>
   BOOTSTRAP_OWNER_EMAIL = <<correo>>
   BOOTSTRAP_OWNER_PASSWORD = (pídeme que la escriba yo en el campo; mínimo 8 caracteres)
   y redespliega: al arrancar, el sistema crea el negocio y la cuenta (si ya existen no hace nada).
   Después de confirmar que la dueña puede entrar, BORRA la variable BOOTSTRAP_OWNER_PASSWORD.
7. Abre <<URL>>/login y verifica que la dueña puede entrar.

PASO 2 — IMÁGENES Y RESPALDOS (Cloudflare R2)
1. En https://dash.cloudflare.com → R2, crea el bucket "rh-imagenes" (público) y "rh-respaldos" (privado).
2. En rh-imagenes habilita "Public access" (r2.dev) y copia la URL pública.
3. R2 → Manage API Tokens → crea un token con permiso "Object Read & Write" para ambos buckets.
   Copia Access Key ID, Secret Access Key y el endpoint S3 (https://<account>.r2.cloudflarestorage.com).
4. En Railway (Variables) agrega: S3_ENDPOINT, S3_REGION=auto, S3_BUCKET=rh-imagenes, S3_ACCESS_KEY,
   S3_SECRET_KEY, S3_PUBLIC_URL=<<URL pública r2.dev>>, BACKUP_S3_BUCKET=rh-respaldos.
5. Redespliega y confirma en /api/health que "storage":"s3".

PASO 3 — WHATSAPP CLOUD API (Meta)
1. https://developers.facebook.com/apps → "Crear app" → tipo "Empresa/Business" → agrega el producto "WhatsApp".
   Asóciala al portafolio comercial (Business Manager) del negocio (si no existe, guíame para crearlo).
2. WhatsApp → Configuración de la API: agrega el número del bot (<<número>>), verifícalo por SMS/llamada
   (yo te dicto el código). Copia el "Phone number ID" y el "WhatsApp Business Account ID".
3. Token permanente: Business Settings → Usuarios del sistema → crea "rh-bot" (Admin) → Asignar activos:
   la app y la cuenta de WhatsApp con control total → "Generar token" con permisos
   whatsapp_business_messaging y whatsapp_business_management, sin caducidad. Cópialo.
4. App → Configuración → Básica: copia la "Clave secreta de la app".
5. WhatsApp → Configuración → Webhook: URL de devolución = <<URL>>/api/whatsapp/webhook ;
   Token de verificación = el WHATSAPP_VERIFY_TOKEN del Paso 1. Verificar y guardar.
   Suscríbete al campo "messages".
6. En Railway agrega: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID,
   WHATSAPP_APP_SECRET. Redespliega. Confirma en /api/health que "whatsapp":"conectado".
7. Plantillas de mensaje (WhatsApp Manager → Plantillas), categoría UTILIDAD, idioma Español (MEX), créalas
   EXACTAMENTE como dice el archivo docs/WHATSAPP.md del repositorio (ábrelo en GitHub para copiar nombres,
   textos y variables): alerta_dueno, pedido_confirmado, pedido_en_camino, pedido_listo, pedido_entregado,
   pedido_cancelado. Envíalas a revisión.
8. Agrega un método de pago en la cuenta de WhatsApp si Meta lo exige (pídeme que yo capture la tarjeta).
9. Prueba: desde mi celular escribo "hola" al número del bot; verifica que responde con el menú.

PASO 4 — GOOGLE MAPS (opcional, mejora la búsqueda de direcciones)
1. https://console.cloud.google.com → crea el proyecto "restaurante-hub" (pídeme confirmar la cuenta de facturación).
2. Habilita "Geocoding API", "Places API" y "Maps JavaScript API".
3. Credenciales → crea 2 API keys:
   - "servidor": restricción por API (Geocoding, Places) → en Railway GOOGLE_MAPS_API_KEY.
   - "navegador": restricción por referente HTTP <<URL>>/* (y el dominio propio) → en Railway VITE_GOOGLE_MAPS_API_KEY.
4. Redespliega y confirma en /api/health "maps":"google".

PASO 5 — CONFIGURACIÓN DENTRO DEL SISTEMA (como la dueña)
1. Entra a <<URL>>/admin/configuracion: nombre, logo, colores, horario, datos de transferencia,
   WhatsApp de la dueña <<teléfono>> y activa "Avisarme por WhatsApp". Activa el módulo
   "Punto de venta" solo si lo van a usar.
2. Activa las notificaciones push en el celular de la dueña (botón "Activar notificaciones").
3. En Equipo y tablets crea las áreas (Cocina, Barra, Almacén), el personal con PIN y genera un
   código de emparejamiento por tablet.
4. En Impresoras crea un "agente" y anota el token para instalar la app de escritorio/agente en la PC del local.

PASO 6 — APPS (GitHub Actions)
1. En GitHub → Actions ejecuta "Release Android" y "Release Desktop" (Run workflow). Descarga los
   artefactos: el .apk para las tablets Android y el .exe para la PC de caja/cocina.
2. (Opcional) Para firmar el APK de producción agrega los secretos ANDROID_KEYSTORE_BASE64,
   ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD (pídeme los valores).

ENTREGA FINAL
Dame una tabla con: servicio, recurso creado, URL/ID, variable(s) configuradas, estado (✅/⚠️) y lo que
quedó pendiente para que yo lo haga.
```
