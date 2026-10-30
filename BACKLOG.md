# BACKLOG — Plataforma de Requisiciones Internas + Delivery

> **Versión:** 0.2 (aprobado — decisiones confirmadas, ver §5) · **Fecha:** 29-oct-2026
> **Objetivo:** describir el sistema end-to-end en tarjetas de código ordenadas, para construirlo completo y dejar pendiente únicamente la conexión de servicios externos (Railway, WhatsApp Cloud API, etc.).

---

## 0. Contexto y alcance

### 0.1 Origen (notas del cliente)
**Bloque 1 — "Soft punto de venta / toda la idea del delivery" ($19,000):**
- Integración de WhatsApp bot
- Poder pedir desde WhatsApp
- Dirigir impresiones a cocina
- Dirección o ubicación del cliente

**Bloque 2 — "Programa para pedidos para c/área":**
- Tablets en cada área, en soporte
- Requisiciones (cada área pide insumos y manda mensajes internos; el pedido le llega directo a la dueña)

### 0.2 Referencia analizada: Soft Restaurant® e-Delivery
Lo que se tomó como referencia (página pública + ficha técnica; no tiene demo pública ni código abierto que inspeccionar — es un sitio de marketing):
- Plataforma web propia de **servicio a domicilio y "pasar a recoger"**, sin depender de terceros.
- **Personalizable:** logo, paleta de colores, URL.
- **Negocio configurable:** horarios de atención, **zonas de reparto y cobertura**, métodos de pago (efectivo/tarjeta), múltiples sucursales.
- **Menú, promociones y cupones**; registro de clientes y fidelización.
- **Usuarios con perfiles y permisos** específicos.
- **Impresión de comandas en áreas de producción** y monitor de cocina.
- **Reportes de ventas** por tipo de servicio desde panel web.
- Complemento **e-Menu QR**: menú digital por QR con logo/colores, selección de platillos visibles.

> Diferencia clave vs. Soft Restaurant: **ellos no traen bot de WhatsApp conversacional**; nosotros sí, y además el módulo de **requisiciones internas por área** (que ellos no tienen).

### 0.3 Alcance del producto (2 módulos sobre un núcleo común)
| Módulo | Qué resuelve | Prioridad |
|---|---|---|
| **Núcleo** | Auth, roles, áreas, dispositivos, notificaciones, tiempo real, auditoría | P0 |
| **A. Requisiciones internas** | Tablets por área con íconos grandes; tocar = +1 presentación (kg, bote, pieza…); chat interno; todo llega a la dueña para aprobar/surtir | **P0 (MVP)** |
| **B. Delivery + WhatsApp** | Pedidos por WhatsApp bot y web, dirección/ubicación, zonas de reparto, impresión de comandas por área, repartidores, reportes | P1 |

| **C. Punto de venta (OPCIONAL)** | Mesas, cuentas, envío a cocina, cobro, dividir cuenta, caja y corte. Se activa/desactiva con un interruptor del negocio; apagado no aparece en ninguna pantalla | P2 |

### 0.4 Fuera de alcance (por ahora)
- Facturación CFDI.
- GPS de repartidores en tiempo real (otra línea de la nota: "GPS").
- Rockola ("Toca disco"), encuestas, portal cautivo Wi-Fi (son otros proyectos de la misma nota).
- Pagos en línea (queda preparado el modelo; se activa en fase posterior si se decide).

---

## 1. Arquitectura y stack

```
┌───────────────────────── Railway ─────────────────────────┐
│  api (NestJS)  ──  PostgreSQL  ──  Redis (colas/BullMQ)    │
│     │  REST + WebSocket (Socket.IO)                        │
│     │  Webhook WhatsApp Cloud API                          │
│  web (React PWA, servido por Railway)                      │
│     ├─ /tablet   → App de área (kiosco, íconos grandes)    │
│     ├─ /admin    → Panel de la dueña                       │
│     ├─ /pedir    → Menú web de delivery (cliente final)    │
│     └─ /repartidor → Vista de repartidor                   │
└────────────────────────────────────────────────────────────┘
        ▲ WebSocket saliente
┌───────┴──────── Red local del restaurante ────────┐
│  print-agent (Node, en una PC/Raspberry)          │
│   → impresoras térmicas ESC/POS por área (LAN/USB)│
└───────────────────────────────────────────────────┘
```

| Capa | Tecnología | Por qué |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Un repo, tipos compartidos |
| Backend | NestJS + TypeScript | Módulos claros, guards de roles, WebSockets nativos |
| ORM / DB | Prisma + PostgreSQL | Migraciones, tipado; Postgres nativo en Railway |
| Colas | BullMQ + Redis | Envío de WhatsApp, impresión, reintentos |
| Tiempo real | Socket.IO | Pedidos/requisiciones/chat al instante |
| Frontend | React + Vite + TypeScript + Tailwind + PWA (vite-plugin-pwa) | Una sola app instalable en tablets y celular de la dueña |
| Estado/datos | TanStack Query + Zustand | Caché + carrito offline |
| Offline | IndexedDB (Dexie) + Service Worker | Tablets siguen funcionando si cae el Wi-Fi |
| Push | Web Push (VAPID) | Notificación al celular de la dueña sin app nativa |
| WhatsApp | Meta WhatsApp Cloud API | Oficial, gratis en ventana de 24 h |
| Mapas | Google Maps (Geocoding + Places + Maps JS) | Dirección ↔ ubicación, zonas de reparto |
| Imágenes | Almacenamiento S3-compatible (Cloudflare R2) | Íconos de insumos y fotos de platillos |
| Impresión | node-thermal-printer (ESC/POS) en print-agent local | La nube no ve impresoras de la LAN |
| Tests | Vitest + Supertest + Playwright | Unit, integración y E2E |
| CI | GitHub Actions | Lint, tests, build en cada PR |

---

## 2. Convenciones del backlog

- **ID:** `EPIC-NN` (ej. `REQ-07`). Orden = orden sugerido de construcción.
- **Pts:** 1, 2, 3, 5, 8 (complejidad relativa).
- **Dep:** tarjetas que deben estar terminadas antes.
- **🔌** = la tarjeta deja todo el código listo pero requiere credenciales externas para probar en real (se conecta en la Fase Final).

### Definition of Done (aplica a todas)
1. Código en TypeScript estricto, lint sin errores.
2. Tests unitarios de la lógica de negocio; endpoints con test de integración.
3. Validación de entrada (class-validator / zod) y permisos por rol.
4. UI responsive (tablet 10" horizontal y celular), en español.
5. Documentado en el README del paquete si agrega variables de entorno.

---

## 3. Fases

| Fase | Épicas | Resultado |
|---|---|---|
| **F0 Cimientos** | SETUP, CORE | Monorepo, DB, auth, roles, tiempo real |
| **F1 Requisiciones (MVP)** | CAT, REQ, TAB, ADM, MSG, NOT | Tablets pidiendo insumos y dueña recibiendo/aprobando |
| **F2 Delivery** | MENU, CLI, ZON, ORD, PRN, WAB, WEB, DRV | Pedidos por WhatsApp y web, comandas impresas por área |
| **F3 Valor agregado** | RPT, PRM, CFG | Reportes, promociones, personalización |
| **F3b POS opcional** | POS | Mesas, cuentas, cobro y corte de caja (feature flag) |
| **F3c Apps nativas** | APP | Escritorio Windows (.exe) y Android (.apk) |
| **F4 Calidad y despliegue** | QA, OPS | E2E, seeds, Dockerfiles, config Railway lista |
| **F5 Integración externa** | EXT | *(Prompt para Claude en Chrome)* conectar Railway, Meta, Google, R2 |

---

## F0 — CIMIENTOS

### Épica SETUP — Estructura del proyecto

**SETUP-01 · Monorepo base** · 2 pts
Crear monorepo pnpm + Turborepo con `apps/api`, `apps/web`, `apps/print-agent`, `packages/shared` (tipos, enums, esquemas zod), `packages/config` (eslint, tsconfig, prettier).
- [ ] `pnpm dev` levanta api y web en paralelo
- [ ] `pnpm build`, `pnpm lint`, `pnpm test` funcionan desde la raíz

**SETUP-02 · API NestJS base** · 2 pts · Dep: SETUP-01
Estructura modular, config por `.env` validada con zod (`ConfigModule`), logger estructurado (pino), manejo global de errores, healthcheck `GET /health` (DB + Redis), CORS, Helmet, rate-limit.
- [ ] Arranca falla-rápido si falta una variable obligatoria
- [ ] `/health` responde estado de DB y Redis

**SETUP-03 · Prisma + PostgreSQL** · 2 pts · Dep: SETUP-02
Prisma configurado, `docker-compose.yml` local con Postgres y Redis, scripts `db:migrate`, `db:seed`, `db:studio`.
- [ ] Migración inicial corre en local con docker-compose

**SETUP-04 · Web React PWA base** · 3 pts · Dep: SETUP-01
Vite + React + TS + Tailwind + React Router + TanStack Query + vite-plugin-pwa. Layouts por sección (`/tablet`, `/admin`, `/pedir`, `/repartidor`), tema con variables CSS (colores de marca configurables), cliente HTTP con interceptores de token y refresh.
- [ ] Instalable como PWA, manifiesto con íconos
- [ ] Rutas protegidas por rol

**SETUP-05 · Paquete shared** · 1 pt · Dep: SETUP-01
Enums (roles, estados de requisición, estados de pedido, unidades), esquemas zod de DTOs reutilizados por api y web.

**SETUP-06 · CI GitHub Actions** · 1 pt · Dep: SETUP-01
Workflow: install con caché, lint, typecheck, test, build. Servicio Postgres en CI para tests de integración.

### Épica CORE — Núcleo común

**CORE-01 · Modelo de datos núcleo** · 3 pts · Dep: SETUP-03
Tablas: `Business` (nombre, logo, colores, zona horaria), `Branch` (sucursal), `Area` (Cocina, Barra, Almacén… con color e ícono), `User` (nombre, teléfono, email, hash, rol, activo), `Device` (tablet: nombre, área fija, token, último ping), `AuditLog`.
Roles: `OWNER` (dueña), `ADMIN`, `AREA_LEAD` (encargado de área), `STAFF`, `DRIVER` (repartidor).

**CORE-02 · Autenticación usuarios** · 3 pts · Dep: CORE-01
Login email/teléfono + contraseña, JWT access (15 min) + refresh (rotativo, en DB), logout, cambio de contraseña, bloqueo tras 5 intentos.
- [ ] Refresh token revocable
- [ ] Tests de login, refresh y bloqueo

**CORE-03 · Emparejamiento de tablets (modo kiosco)** · 5 pts · Dep: CORE-02
La dueña genera un **código de emparejamiento de 6 dígitos** (expira 10 min) para un área. La tablet lo captura una vez y queda ligada al área con un token de dispositivo de larga duración. En la tablet, cada persona se identifica con **PIN de 4 dígitos** (opcional según configuración) para saber quién pidió.
- [ ] Revocar dispositivo desde admin lo desconecta al instante
- [ ] Tablet muestra nombre y color del área siempre

**CORE-04 · Autorización por rol y por área** · 2 pts · Dep: CORE-02
Guards de NestJS: `@Roles()`, y scope por área (un `AREA_LEAD` solo ve su área). Tests de matriz de permisos.

**CORE-05 · Gateway de tiempo real** · 3 pts · Dep: CORE-02
Socket.IO con auth por JWT/token de dispositivo. Salas: `business:{id}`, `area:{id}`, `owner`, `user:{id}`. Servicio `RealtimeService.emit(evento, sala, payload)` reutilizable. Reconexión con re-sincronización (el cliente pide cambios desde `lastSeenAt`).

**CORE-06 · Auditoría** · 1 pt · Dep: CORE-01
Interceptor que registra acciones de escritura (quién, qué, cuándo, antes/después) en `AuditLog`. Vista básica en admin (ADM).

**CORE-07 · Gestión de usuarios (API)** · 2 pts · Dep: CORE-04
CRUD de usuarios, asignación de rol y área(s), reseteo de PIN/contraseña, activar/desactivar.

**CORE-08 · Subida de imágenes** · 2 pts 🔌 · Dep: SETUP-02
Endpoint de URL prefirmada S3-compatible (R2), validación de tipo/tamaño, redimensionado a 512 px (sharp) para íconos. **Fallback local** (disco) para desarrollo.

---

## F1 — MÓDULO A: REQUISICIONES INTERNAS (MVP)

### Épica CAT — Catálogo de insumos

**CAT-01 · Modelo de insumos** · 3 pts · Dep: CORE-01
- `SupplyCategory` (Carnes, Lácteos, Verdura, Abarrotes, Bebidas, Desechables, Limpieza, Gas/servicios…; orden, ícono).
- `Unit` / presentación: `KG`, `G`, `L`, `ML`, `PIEZA`, `BOTE`, `CAJA`, `BOLSA`, `PAQUETE`, `GARRAFÓN`, `TANQUE`, configurable.
- `Supply`: nombre, categoría, imagen/ícono, unidad de presentación, **incremento por toque** (ej. 1 kg, 0.5 kg, 1 bote), cantidad máxima por pedido, proveedor sugerido, activo, orden.
- `SupplyArea` (qué áreas pueden pedir cada insumo, con orden propio por área).
- `Supplier`: nombre, teléfono WhatsApp, días de entrega, notas.

**CAT-02 · API de catálogo** · 3 pts · Dep: CAT-01, CORE-04
CRUD de categorías, insumos, unidades y proveedores; asignación masiva de insumos a áreas; reordenar (drag & drop → endpoint de orden); endpoint optimizado `GET /tablet/catalog` (solo lo del área, con ETag para caché).

**CAT-03 · Biblioteca de íconos predefinidos** · 3 pts · Dep: CAT-01
Set incluido de ~120 íconos SVG grandes y claros (tomate, cebolla, aguacate, limón, pollo, res, queso, leche, tortillas, aceite, hielo, refresco, cerveza, servilletas, gas, etc.) para que la dueña elija sin subir fotos. Selector con búsqueda en admin.

**CAT-04 · Importación masiva por CSV/Excel** · 2 pts · Dep: CAT-02
Plantilla descargable; importa insumos con categoría, unidad, incremento y áreas. Reporte de errores por fila.

### Épica REQ — Requisiciones (lógica de negocio)

**REQ-01 · Modelo de requisiciones** · 3 pts · Dep: CAT-01
- `Requisition`: folio consecutivo por negocio (`REQ-000123`), área, dispositivo, creado por (PIN), prioridad (`NORMAL` / `URGENTE`), nota general, fecha requerida (hoy / mañana / fecha), estado, timestamps por estado.
- `RequisitionItem`: insumo, unidad (copiada al momento), cantidad solicitada, aprobada, surtida, recibida, nota por renglón.
- Estados: `BORRADOR → ENVIADA → VISTA → APROBADA | APROBADA_PARCIAL | RECHAZADA → EN_COMPRA → SURTIDA → RECIBIDA` (+ `CANCELADA`).

**REQ-02 · Máquina de estados** · 3 pts · Dep: REQ-01
Servicio con transiciones válidas por rol (el área envía/cancela/confirma recepción; la dueña ve/aprueba/edita/rechaza/surte). Transición inválida → 409. Cada transición emite evento tiempo real + notificación + auditoría.
- [ ] Tests de todas las transiciones válidas e inválidas

**REQ-03 · Crear y enviar requisición** · 3 pts · Dep: REQ-02
`POST /requisitions` desde tablet con items; **idempotencia** con `clientRequestId` (para reintentos offline sin duplicar). Agrupa automáticamente si el área ya tiene una requisición `ENVIADA` no vista en los últimos N minutos (configurable: agrupar o crear nueva).

**REQ-04 · Aprobación y edición por la dueña** · 3 pts · Dep: REQ-02
Aprobar todo, aprobar parcial (editar cantidades por renglón), rechazar renglón o requisición con motivo, agregar comentario. El área ve los cambios en tiempo real.

**REQ-05 · Surtido y recepción** · 2 pts · Dep: REQ-04
Dueña marca "en compra" y "surtida" (cantidades surtidas). El área confirma recepción en tablet (cantidades recibidas); diferencias quedan registradas como incidencia.

**REQ-06 · Lista de compras consolidada** · 5 pts · Dep: REQ-04
Vista/endpoint que **suma todas las requisiciones aprobadas pendientes** por insumo y las agrupa por **proveedor** (ej. "Verdulería: 12 kg tomate, 5 kg cebolla"). Marcar como comprado afecta a todas las requisiciones de origen. Exportar a PDF y **compartir por WhatsApp** (link `wa.me` con texto prellenado — sin API, funciona desde el día 1).

**REQ-07 · Pedidos frecuentes / plantillas** · 2 pts · Dep: REQ-03
El área puede guardar "pedido de lunes" y cargarlo con un toque. Sugerencia: "repetir último pedido".

**REQ-08 · Recordatorios de horario de pedido** · 2 pts · Dep: REQ-03, NOT-01
Configurar ventanas de pedido por área (ej. cocina pide antes de 6 pm). Aviso en tablet 30 min antes del cierre; requisición fuera de horario se marca "tarde".

**REQ-09 · Historial y búsqueda** · 2 pts · Dep: REQ-01
Filtros por área, estado, fecha, insumo, prioridad; paginación por cursor.

### Épica TAB — App de tablet por área (UX de íconos grandes)

**TAB-01 · Pantalla de emparejamiento y PIN** · 2 pts · Dep: CORE-03, SETUP-04
Captura de código de 6 dígitos con teclado numérico grande; pantalla de PIN con avatares del personal del área; auto-bloqueo tras X min de inactividad.

**TAB-02 · Cuadrícula de insumos con íconos grandes** · 5 pts · Dep: CAT-02, TAB-01
- Tarjetas de mínimo 140×140 px con ícono, nombre y unidad ("Tomate · kg").
- **Toque = + incremento** (ej. +1 kg) con animación y vibración; **badge** con la cantidad acumulada.
- **Botón "−"** visible al tener cantidad; **mantener presionado** abre teclado numérico para cantidad exacta y nota.
- Pestañas por categoría arriba (con íconos), buscador, sección "Frecuentes".
- Diseño de alto contraste, legible a 1 m, colores del área.
- [ ] Usable con dedos mojados/guantes (zonas táctiles amplias, sin gestos finos)

**TAB-03 · Barra de carrito y envío** · 3 pts · Dep: TAB-02, REQ-03
Barra fija inferior: "7 insumos · Ver pedido". Resumen editable, selector de prioridad (Normal / **Urgente** en rojo), nota general por voz-a-texto (Web Speech API cuando esté disponible) o teclado, botón **ENVIAR A [Dueña]** grande. Confirmación visual clara con folio.

**TAB-04 · Seguimiento de mis requisiciones** · 3 pts · Dep: REQ-02, CORE-05
Lista de requisiciones del área con estado en colores (Enviada → Vista ✓ → Aprobada ✓✓ → Surtida 📦). Ver cambios que hizo la dueña resaltados. Botón "Confirmar recepción".

**TAB-05 · Modo offline** · 5 pts · Dep: TAB-03
Catálogo cacheado (Service Worker + IndexedDB). Si no hay red, la requisición se guarda en cola local y se envía al reconectar (idempotente). Indicador visible "Sin conexión — se enviará al reconectar".

**TAB-06 · Modo kiosco** · 2 pts · Dep: TAB-01
Pantalla completa, **Screen Wake Lock** (pantalla siempre encendida), bloqueo de navegación fuera de `/tablet`, recarga automática ante errores, ping de salud cada 60 s (admin ve si la tablet está en línea). Guía en README para fijar la PWA en Android (Fully Kiosk / anclar pantalla).

**TAB-07 · Sonidos y alertas en tablet** · 1 pt · Dep: CORE-05
Sonido al recibir mensaje o cambio de estado; parpadeo del ícono de chat.

### Épica MSG — Mensajería interna

**MSG-01 · Modelo de chat** · 2 pts · Dep: CORE-01
`Conversation` (tipo: `AREA_OWNER` — cada área con la dueña; `GENERAL` — todos; `REQUISITION` — hilo de una requisición), `Message` (texto, autor, dispositivo/área, adjunto imagen, mensaje rápido, leído por), `QuickMessage` (plantillas configurables).

**MSG-02 · API + tiempo real de chat** · 3 pts · Dep: MSG-01, CORE-05
Enviar, listar paginado, marcar leído, contadores de no leídos, indicador "escribiendo". Hilo por requisición para dudas ("¿tomate saladet o bola?").

**MSG-03 · Chat en tablet** · 3 pts · Dep: MSG-02, TAB-01
Botón de chat grande con contador. **Mensajes rápidos** de un toque ("Se acabó el gas", "Falta hielo", "Urge", "Llegó el proveedor", "Equipo descompuesto"), texto libre, foto con cámara de la tablet (ej. producto en mal estado).

**MSG-04 · Chat en panel de la dueña** · 2 pts · Dep: MSG-02, ADM-01
Bandeja unificada por área con no leídos, responder desde el celular, enviar aviso a todas las áreas (difusión).

### Épica NOT — Notificaciones a la dueña

**NOT-01 · Motor de notificaciones** · 3 pts · Dep: CORE-05, SETUP-03
`Notification` + preferencias por usuario y por tipo (requisición nueva, urgente, mensaje, recepción con diferencias, tablet desconectada). Canales: en app, Web Push, WhatsApp. Procesado en cola BullMQ con reintentos. Horario de silencio configurable (urgentes siempre pasan).

**NOT-02 · Web Push** · 3 pts · Dep: NOT-01
Suscripción VAPID desde el panel (PWA instalada en el celular de la dueña), envío con `web-push`, limpieza de suscripciones vencidas. Clic en la notificación abre la requisición. (Las llaves VAPID se generan con script, no requieren servicio externo.)

**NOT-03 · Notificación por WhatsApp a la dueña** · 2 pts 🔌 · Dep: NOT-01, WAB-01
Plantilla de WhatsApp aprobada: "Nueva requisición {{folio}} de {{área}} ({{n}} insumos, {{prioridad}}). Ver: {{link}}". Configurable on/off.

**NOT-04 · Escalamiento de urgentes** · 1 pt · Dep: NOT-01
Requisición urgente no vista en 10 min → re-notifica y avisa a `ADMIN` secundario si existe.

### Épica ADM — Panel de la dueña (admin)

**ADM-01 · Layout y dashboard** · 3 pts · Dep: SETUP-04, CORE-04
Menú lateral (desktop) / inferior (celular). Dashboard: requisiciones pendientes por área (tarjetas en tiempo real), urgentes arriba en rojo, mensajes no leídos, estado de tablets (en línea/fuera), y en F2: pedidos de delivery activos.

**ADM-02 · Bandeja de requisiciones** · 5 pts · Dep: REQ-04, ADM-01
Lista en tiempo real con sonido al llegar nueva; detalle con renglones editables (aprobar/ajustar/rechazar), botones grandes "Aprobar todo", "Rechazar", "Marcar surtida". Optimizado para celular (una mano).

**ADM-03 · Lista de compras** · 3 pts · Dep: REQ-06, ADM-01
UI de la lista consolidada por proveedor, palomear comprado, exportar PDF, botón "Enviar a proveedor por WhatsApp".

**ADM-04 · Administración del catálogo** · 5 pts · Dep: CAT-02, CAT-03, CORE-08
CRUD de insumos con selector de ícono o foto, unidad e incremento, áreas permitidas; reordenar con drag & drop; vista previa "así se ve en la tablet de Cocina"; importador CSV.

**ADM-05 · Áreas, dispositivos y personal** · 3 pts · Dep: CORE-03, CORE-07
CRUD de áreas (nombre, color, ícono, horario de pedido), generar código de emparejamiento, ver/revocar tablets, alta de personal con PIN.

**ADM-06 · Proveedores** · 2 pts · Dep: CAT-02
CRUD de proveedores, insumos que surte cada uno, días de entrega.

**ADM-07 · Bitácora** · 1 pt · Dep: CORE-06
Vista de auditoría filtrable.

---

## F2 — MÓDULO B: DELIVERY + WHATSAPP

### Épica MENU — Menú de venta

**MENU-01 · Modelo de menú** · 3 pts · Dep: CORE-01
`MenuCategory`, `Product` (nombre, descripción, foto, precio, disponible, visible en web/WhatsApp/QR, **área de producción** para impresión), `ModifierGroup` (ej. "Término", "Extras", min/max selecciones), `Modifier` (precio extra), `ProductModifierGroup`. Productos compuestos (combos).

**MENU-02 · API de menú** · 3 pts · Dep: MENU-01
CRUD, reordenar, **"agotado" rápido** (toggle que se refleja al instante en WhatsApp y web), endpoint público cacheado del menú por sucursal.

**MENU-03 · Admin de menú** · 5 pts · Dep: MENU-02, ADM-01, CORE-08
UI de categorías, productos con foto, modificadores, asignación de área de producción, toggle agotado desde el celular.

### Épica CLI — Clientes y direcciones

**CLI-01 · Modelo de clientes** · 2 pts · Dep: CORE-01
`Customer` (teléfono WhatsApp único, nombre, notas, etiquetas, aceptó aviso de privacidad, total pedidos, último pedido), `Address` (texto, referencias, lat/lng, colonia, CP, alias "Casa/Oficina", validada).

**CLI-02 · Geocodificación** · 3 pts 🔌 · Dep: CLI-01
Servicio `GeoService` con interfaz abstracta: geocodificar texto → lat/lng, geocodificación inversa (ubicación de WhatsApp → dirección legible), autocompletado de Places para la web. Implementación Google Maps + **implementación mock** para desarrollo/tests.

**CLI-03 · Admin de clientes** · 2 pts · Dep: CLI-01, ADM-01
Lista, búsqueda por teléfono/nombre, historial de pedidos, direcciones en mapa.

### Épica ZON — Zonas de reparto y horarios

**ZON-01 · Zonas de cobertura** · 5 pts · Dep: CLI-02
`DeliveryZone`: polígono (GeoJSON) o radio en km desde sucursal, costo de envío, pedido mínimo, tiempo estimado. Servicio "¿esta ubicación tiene cobertura y cuánto cuesta?" (punto en polígono con turf.js).

**ZON-02 · Editor de zonas en mapa** · 3 pts 🔌 · Dep: ZON-01, ADM-01
Dibujar/editar polígonos sobre el mapa en admin, colores por zona.

**ZON-03 · Horarios y estado de tienda** · 2 pts · Dep: CORE-01
Horario semanal por sucursal, días festivos, botón "Cerrar pedidos ahora" (pausa temporal). Servicio `isOpen()` usado por bot y web.

### Épica ORD — Pedidos de delivery

**ORD-01 · Modelo de pedidos** · 3 pts · Dep: MENU-01, CLI-01
`Order`: folio, canal (`WHATSAPP`, `WEB`, `TELEFONO`, `MOSTRADOR`), tipo (`DOMICILIO`, `PASAR_A_RECOGER`), cliente, dirección (copiada), subtotal, envío, descuento, total, método de pago (`EFECTIVO` con "paga con $", `TARJETA_A_LA_ENTREGA`, `TRANSFERENCIA`), notas, tiempo estimado, repartidor. `OrderItem` + `OrderItemModifier` con precios congelados.
Estados: `NUEVO → ACEPTADO → EN_PREPARACION → LISTO → EN_CAMINO → ENTREGADO` (+ `RECHAZADO`, `CANCELADO`; pick-up: `LISTO → RECOGIDO`).

**ORD-02 · Servicio de cálculo de pedido** · 3 pts · Dep: ORD-01, ZON-01
Calcula totales en servidor (nunca confía en el cliente): precios, modificadores, envío por zona, mínimos, cupones, disponibilidad y horario. Tests exhaustivos.

**ORD-03 · API de pedidos y máquina de estados** · 3 pts · Dep: ORD-02, CORE-05
Crear (desde bot, web o captura manual), transiciones con permisos, eventos tiempo real, disparo de impresión al aceptar y de mensajes al cliente en cada cambio.

**ORD-04 · Monitor de pedidos (admin)** · 5 pts · Dep: ORD-03, ADM-01
Tablero tipo Kanban en tiempo real (Nuevos / En preparación / Listos / En camino), sonido persistente con pedido nuevo hasta aceptarlo, aceptar con tiempo estimado (15/30/45 min), rechazar con motivo, reimprimir, asignar repartidor, ver ubicación en mapa.

**ORD-05 · Captura manual de pedido** · 3 pts · Dep: ORD-03, MENU-02
Para pedidos por teléfono/mostrador: buscar cliente por teléfono, elegir dirección, armar pedido con el menú.

**ORD-06 · Monitor de cocina en pantalla (KDS)** · 3 pts · Dep: ORD-03, CORE-03
Vista para tablet de área (reutiliza emparejamiento): muestra solo los productos de su área de producción, con temporizador y botón "Listo". Alternativa/complemento a la impresión.

### Épica PRN — Impresión de comandas por área

**PRN-01 · Modelo de impresoras y rutas** · 2 pts · Dep: CORE-01, MENU-01
`Printer` (nombre, área, **conexión seleccionable**, ancho 58/80 mm, juego de caracteres, corte automático, cajón de dinero, copias, activa). Conexiones soportadas (todas configurables desde el admin):
| Conexión | Cómo imprime | Dónde |
|---|---|---|
| `NETWORK` | ESC/POS crudo por TCP (IP:9100) | Print agent / app de escritorio |
| `USB_DEVICE` | Escritura directa al dispositivo (`/dev/usb/lp0`, Linux/Raspberry) | Print agent |
| `WINDOWS_PRINTER` | Impresora instalada en Windows por nombre (cola RAW del spooler) | App de escritorio / print agent en Windows |
| `SERIAL` | Puerto COM/serial | Print agent |
| `BLUETOOTH` | ESC/POS por Bluetooth desde la tablet/celular | App Android |
| `BROWSER` | Ticket HTML 58/80 mm con diálogo de impresión del navegador (sin agente) | Cualquier navegador |
| `KDS` | No imprime: se muestra en pantalla de cocina | Tablet |

Dialecto: `ESC_POS` (Epson y compatibles) o `STAR`., `PrintJob` (pedido, impresora, contenido, estado, intentos). Regla: cada `OrderItem` se enruta a la impresora del área de producción del producto; ticket completo a caja/barra.

**PRN-02 · Generación de comandas** · 3 pts · Dep: PRN-01, ORD-03
Plantillas ESC/POS: comanda de cocina (folio grande, hora, tipo, productos + modificadores + notas, sin precios), ticket de cliente/repartidor (dirección, referencias, teléfono, total, método de pago, "paga con", QR de Google Maps a la ubicación). Encola un `PrintJob` por impresora.

**PRN-03 · Print Agent local** · 5 pts · Dep: PRN-02
App Node (`apps/print-agent`) que corre en una PC/Raspberry en el restaurante: se autentica con token de agente, mantiene WebSocket saliente con la API (no requiere abrir puertos), recibe trabajos, imprime con `node-thermal-printer`, confirma o reporta error, reintenta. Empaquetado como servicio (pm2/Windows service) con instrucciones.
- [ ] Si el agente está desconectado, los trabajos se acumulan y se imprimen al reconectar
- [ ] Admin ve estado de agente e impresoras

**PRN-04 · Admin de impresoras** · 2 pts · Dep: PRN-03, ADM-01
CRUD de impresoras, asignar área, botón "Imprimir prueba", ver cola y errores, reimprimir.

### Épica WAB — Bot de WhatsApp

**WAB-01 · Cliente WhatsApp Cloud API** · 3 pts 🔌 · Dep: SETUP-02
Módulo `WhatsappService`: enviar texto, botones de respuesta (hasta 3), listas interactivas (hasta 10 filas por sección), imágenes, plantillas, solicitud de ubicación; webhook `GET` (verificación) y `POST` (mensajes) con **validación de firma `X-Hub-Signature-256`**; envío vía cola con reintentos y respeto de límites. **Modo simulador** para desarrollo (ver WAB-07).

**WAB-02 · Motor de conversación (máquina de estados)** · 8 pts · Dep: WAB-01, ORD-02
`ChatSession` por teléfono (estado, carrito temporal, expira a 2 h). Flujo:
1. Saludo con nombre del negocio + botones: **Hacer pedido** / Ver menú / Hablar con alguien.
2. Si la tienda está cerrada: horario y opción de dejar pedido programado (configurable).
3. **Tipo:** Domicilio / Pasar a recoger.
4. **Menú:** lista interactiva por categoría → producto → modificadores (listas/botones) → cantidad → "¿Agregar algo más?".
5. Alternativa: botón **"Pedir en la web"** que manda link `/pedir?s={token}` ya ligado a la sesión (para menús grandes, el carrito vuelve al chat).
6. **Dirección:** reutilizar una guardada (botones) o **compartir ubicación 📍** o escribir dirección → geocodificar → confirmar → validar cobertura y costo de envío → pedir referencias.
7. **Pago:** efectivo (¿con cuánto pagas?) / tarjeta a la entrega / transferencia (muestra datos).
8. **Resumen** con totales → Confirmar / Editar / Cancelar.
9. Crea `Order`, responde folio y tiempo estimado.
- [ ] Entiende texto libre básico en cada paso ("cancelar", "menú", "humano", números de opción)
- [ ] Tests de flujo completo con el simulador

**WAB-03 · Notificaciones de estado al cliente** · 2 pts 🔌 · Dep: WAB-01, ORD-03
Mensajes automáticos: aceptado (con tiempo estimado), en preparación, en camino (nombre del repartidor), entregado, rechazado (motivo). Plantillas para mensajes fuera de la ventana de 24 h.

**WAB-04 · Traspaso a humano (bandeja de WhatsApp)** · 5 pts · Dep: WAB-01, ADM-01
"Hablar con alguien" pausa el bot para ese cliente; la conversación aparece en una bandeja del admin donde la dueña/personal responde desde el panel; botón "Regresar al bot". Historial de mensajes guardado.

**WAB-05 · Recompra rápida** · 2 pts · Dep: WAB-02
Cliente recurrente: "¿Repetimos tu último pedido? (resumen)" con un botón.

**WAB-06 · Textos del bot configurables** · 2 pts · Dep: WAB-02
Admin edita saludos, mensajes de cerrado, datos de transferencia, sin tocar código.

**WAB-07 · Simulador de WhatsApp (dev)** · 3 pts · Dep: WAB-01
Página interna `/dev/whatsapp` que imita un chat (burbujas, botones, listas, envío de ubicación con mapa) y habla con el mismo motor, para probar todo el bot **sin credenciales de Meta**.

### Épica WEB — Menú web para clientes (estilo e-Delivery / e-Menu QR)

**WEB-01 · Menú web público** · 5 pts · Dep: MENU-02, ZON-03
`/pedir`: portada con logo y colores del negocio, estado abierto/cerrado, selector Domicilio / Pasar a recoger, categorías con scroll, tarjetas con foto y precio, modal de producto con modificadores, carrito persistente.

**WEB-02 · Checkout web** · 5 pts · Dep: WEB-01, ORD-02, CLI-02
Teléfono (+ verificación por código de WhatsApp 🔌, opcional), nombre, dirección con autocompletado y pin arrastrable en mapa, validación de cobertura en vivo, referencias, método de pago, resumen, confirmación con folio.

**WEB-03 · Seguimiento del pedido** · 2 pts · Dep: WEB-02, CORE-05
`/pedido/{token}`: estado en tiempo real con línea de tiempo.

**WEB-04 · Menú QR (solo consulta)** · 2 pts · Dep: WEB-01
Modo "solo ver menú" para mesas, generador de QR imprimible en admin.

**WEB-05 · SEO y compartir** · 1 pt · Dep: WEB-01
Meta tags/OG con logo y nombre para que el link se vea bien al compartirlo.

### Épica DRV — Repartidores

**DRV-01 · Vista de repartidor** · 3 pts · Dep: ORD-03, CORE-02
`/repartidor` (celular): pedidos asignados, dirección con botón "Abrir en Google Maps/Waze", llamar/WhatsApp al cliente, monto a cobrar y cambio, botones "Salí" (→ EN_CAMINO) y "Entregado".

**DRV-02 · Asignación y control** · 2 pts · Dep: DRV-01, ORD-04
Asignar desde el monitor, ver carga de cada repartidor, corte de efectivo por repartidor al final del turno.

---

## F3 — VALOR AGREGADO

### Épica RPT — Reportes

**RPT-01 · Reportes de requisiciones** · 3 pts · Dep: REQ-05
Consumo por insumo/área/periodo, requisiciones por estado, tiempos de respuesta de la dueña, diferencias en recepción, top insumos. Gráficas (Recharts) + exportar CSV.

**RPT-02 · Reportes de ventas delivery** · 3 pts · Dep: ORD-03
Ventas por día/canal/tipo de servicio/método de pago, ticket promedio, productos más vendidos, pedidos por zona, clientes nuevos vs recurrentes, tiempos de preparación y entrega.

**RPT-03 · Resumen diario por WhatsApp/Push** · 2 pts 🔌 · Dep: RPT-01, RPT-02, NOT-01
Job programado (BullMQ repeatable) que manda a la dueña el resumen del día al cierre.

### Épica PRM — Promociones y fidelización

**PRM-01 · Cupones** · 3 pts · Dep: ORD-02
Código, % o monto fijo, mínimo de compra, vigencia, usos máximos (total y por cliente), canales.

**PRM-02 · Promociones automáticas** · 3 pts · Dep: PRM-01
Por día/horario (2x1 martes), por producto o categoría, envío gratis sobre monto.

**PRM-03 · Fidelización simple** · 2 pts · Dep: CLI-01, PRM-01
Regla "cada N pedidos, cupón de X" generado y enviado por WhatsApp.

### Épica CFG — Configuración del negocio

**CFG-01 · Personalización de marca** · 2 pts · Dep: CORE-08
Logo, colores, nombre; se aplican en tablets, menú web, tickets y mensajes del bot.

**CFG-02 · Configuración general** · 2 pts · Dep: CORE-01
Zona horaria, moneda, datos de transferencia, aviso de privacidad (requerido para datos de clientes — LFPDPPP), políticas de agrupación de requisiciones, PIN obligatorio sí/no.

**CFG-03 · Multi-sucursal** · 3 pts · Dep: CORE-01
Sucursal en áreas, menú/precios/zonas por sucursal, selector de sucursal en admin, bot asigna sucursal por cobertura.

---

## F3b — MÓDULO C: PUNTO DE VENTA (OPCIONAL)

> Todo integrado con el mismo menú, impresión, clientes y reportes. Se activa con `modules.pos = true` en Configuración. Apagado: sin rutas, sin menú, endpoints responden 404.

**POS-01 · Feature flag de módulos** · 1 pt · Dep: CFG-02
`Business.settings.modules` (`requisitions`, `delivery`, `pos`); guard `@RequiresModule('pos')` en API y ocultamiento en UI.

**POS-02 · Mesas y salones** · 3 pts · Dep: POS-01
`DiningArea` (salón, terraza), `Table` (número, capacidad, posición x/y para plano), estado (libre, ocupada, por cobrar). Editor de plano con arrastrar.

**POS-03 · Cuentas (tickets abiertos)** · 5 pts · Dep: POS-02, MENU-01
`Ticket` (mesa o "para llevar"/"mostrador", mesero, comensales, estado `ABIERTA → POR_COBRAR → PAGADA | CANCELADA`), renglones con modificadores y notas, **enviar a cocina** (genera comandas por área igual que delivery, solo lo no enviado), cancelar renglón con motivo y permiso.

**POS-04 · Descuentos, cortesías y propinas** · 2 pts · Dep: POS-03
Descuento por renglón o cuenta (% o monto, con permiso), cortesía, propina sugerida 10/15/20 %.

**POS-05 · Dividir, juntar y cambiar de mesa** · 3 pts · Dep: POS-03
Dividir por renglones o en partes iguales, juntar cuentas, mover cuenta de mesa.

**POS-06 · Cobro** · 3 pts · Dep: POS-03
Pagos múltiples por cuenta (efectivo con cambio, tarjeta con referencia, transferencia), imprimir ticket de cuenta y de pago, abrir cajón.

**POS-07 · Caja y corte** · 5 pts · Dep: POS-06
`CashSession` (apertura con fondo, cajero), entradas/salidas de efectivo con motivo, **corte X** (parcial) y **corte Z** (cierre: esperado vs contado por método, diferencia), impresión del corte. Los pedidos de delivery cobrados en efectivo y los cortes de repartidor se integran a la caja.

**POS-08 · Pantallas POS** · 8 pts · Dep: POS-02..07
Plano de mesas, pantalla de cuenta tipo comandero (categorías + productos grandes), cobro, caja. Optimizado para tablet y PC con pantalla táctil.

**POS-09 · Reportes POS** · 2 pts · Dep: POS-07, RPT-02
Ventas por mesero, por mesa, propinas, cancelaciones, cortes históricos. Se suman a los reportes de ventas por canal (`MESA`).

---

## F3c — APPS NATIVAS (además de la web)

**APP-01 · App de escritorio Windows (.exe)** · 5 pts · Dep: PRN-03
Electron que carga el sistema (URL del servidor configurable en primer arranque) e **integra el print agent**: imprime a impresoras de red, USB/instaladas en Windows y COM sin instalar nada más. Se inicia con Windows, ícono en bandeja, auto-actualización. Instalador NSIS generado en CI (GitHub Actions, runner Windows).

**APP-02 · App Android (.apk)** · 5 pts · Dep: SETUP-04
Capacitor envolviendo la misma app web: modo kiosco para tablets, mantener pantalla encendida, **impresión Bluetooth ESC/POS** desde la tablet, notificaciones. URL del servidor configurable. APK generado en CI (GitHub Actions con Android SDK).

**APP-03 · Detección de plataforma** · 1 pt · Dep: APP-01, APP-02
La web detecta si corre en escritorio, Android o navegador y ofrece solo las conexiones de impresora posibles en ese entorno.

---

## F4 — CALIDAD Y DESPLIEGUE

### Épica QA

**QA-01 · Seeds de demo** · 2 pts · Dep: CAT-03, MENU-01
Negocio demo con áreas (Cocina, Barra, Almacén), 60 insumos con íconos, menú de ejemplo con modificadores, zonas, usuarios de cada rol.

**QA-02 · Tests E2E críticos (Playwright)** · 5 pts · Dep: F1, F2
1) Tablet empareja → pide 3 insumos → dueña recibe (tiempo real) → aprueba parcial → tablet ve cambio → confirma recepción.
2) Modo offline: pedir sin red → reconectar → llega una sola vez.
3) Bot (simulador): pedido completo con ubicación → aparece en monitor → se genera comanda por área.
4) Pedido web con cupón → seguimiento en vivo.

**QA-03 · Pruebas de carga ligeras** · 1 pt · Dep: QA-02
Script k6: 20 tablets + 50 pedidos/hora simultáneos sin degradación.

**QA-04 · Revisión de seguridad** · 2 pts · Dep: F2
Checklist: validación de firma de webhook, rate limits en endpoints públicos, sin datos sensibles en logs, tokens de dispositivo revocables, CORS restringido, headers de seguridad, dependencias auditadas.

### Épica OPS — Preparación para Railway

**OPS-01 · Dockerfiles y build de producción** · 2 pts · Dep: SETUP-02, SETUP-04
Dockerfile multi-stage para `api` y `web` (web servido por un servidor estático ligero o desde la api), `railway.json` / `nixpacks` por servicio, comando de migración en pre-deploy (`prisma migrate deploy`).

**OPS-02 · Variables de entorno documentadas** · 1 pt · Dep: todas las 🔌
`.env.example` completo y tabla en README: qué es cada variable, de dónde sale, si es obligatoria.
Previstas: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `APP_URL`, `API_URL`, `CORS_ORIGINS`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `GOOGLE_MAPS_API_KEY` (server), `VITE_GOOGLE_MAPS_API_KEY` (browser, restringida por dominio), `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL`, `PRINT_AGENT_TOKEN`.

**OPS-03 · Scripts de utilidad** · 1 pt · Dep: OPS-02
`pnpm gen:vapid`, `pnpm gen:secrets`, `pnpm create:owner` (crea la cuenta de la dueña en producción).

**OPS-04 · Observabilidad básica** · 1 pt · Dep: SETUP-02
Logs JSON, request-id, endpoint de métricas simples, alertas de jobs fallidos visibles en admin.

**OPS-05 · Respaldos** · 1 pt · Dep: OPS-01
Job diario de `pg_dump` comprimido al bucket S3 con retención de 30 días.

**OPS-06 · Manuales** · 2 pts · Dep: F1, F2
README técnico (correr en local, arquitectura, despliegue) + guía de usuario corta para la dueña y para el personal (emparejar tablet, pedir, aprobar), + guía de instalación del print-agent.

---

## F5 — INTEGRACIÓN DE SERVICIOS EXTERNOS (no es código)

> Se hace al final con un **prompt para Claude en Chrome** que te entregaré cuando todo el código esté terminado. Lista preliminar:

| # | Servicio | Qué se configura |
|---|---|---|
| EXT-01 | **GitHub** | Repo, subir código, conectar a Railway |
| EXT-02 | **Railway** | Proyecto, servicios `api` y `web`, PostgreSQL, Redis, variables, dominios, deploy |
| EXT-03 | **Meta (WhatsApp Cloud API)** | App de Meta, número de WhatsApp Business, token permanente (System User), webhook apuntando a Railway, suscripción a `messages`, plantillas (notificación a dueña, estados de pedido, resumen diario) |
| EXT-04 | **Google Cloud** | Proyecto, habilitar Maps JS, Geocoding y Places; dos API keys (servidor y navegador restringida por dominio) |
| EXT-05 | **Cloudflare R2** (o bucket de Railway) | Bucket para imágenes, credenciales, URL pública |
| EXT-06 | **Dominio** (opcional) | DNS hacia Railway (ej. `pedidos.turestaurante.com`) |
| EXT-07 | **Físico (lo hace una persona en sitio)** | Instalar print-agent en PC del restaurante, emparejar tablets, instalar PWA en celular de la dueña |

---

## 4. Resumen de esfuerzo

| Fase | Tarjetas | Pts aprox. |
|---|---|---|
| F0 Cimientos | 14 | 32 |
| F1 Requisiciones (MVP) | 34 | 90 |
| F2 Delivery + WhatsApp | 33 | 108 |
| F3 Valor agregado | 9 | 23 |
| F3b POS opcional | 9 | 32 |
| F3c Apps nativas | 3 | 11 |
| F4 Calidad y despliegue | 10 | 18 |
| **Total código** | **112** | **~314** |
| F5 Integración externa | 7 | — |

---

## 5. Decisiones confirmadas (29-oct-2026)

1. **Alcance:** ambos módulos completos (Requisiciones + Delivery/WhatsApp).
2. **Punto de venta:** se construye completo (mesas, cobro, caja y corte) como **módulo opcional** activable (F3b).
3. **Impresoras y tablets:** todos los escenarios configurables — red, USB, impresora de Windows, serial, Bluetooth, navegador y pantalla de cocina; tablets Android, iPad o PC.
4. **WhatsApp:** aún no hay número. Todo el código, webhook y endpoints quedan listos con simulador; se conecta en la Fase Final.
5. **Aprobación de requisiciones:** por defecto la dueña aprueba; configurable por insumo (`autoApprove`).
6. **Pagos:** efectivo, tarjeta a la entrega y transferencia. Pagos en línea quedan fuera.
7. **Entregables:** web (PWA) + app de escritorio Windows (.exe) + app Android (.apk), generados por CI.

---

## 6. Estado de construcción (30-oct-2026)

**Todo el código de F0 a F4 está construido.** Solo queda la Fase F5 (integración de servicios externos) → [`docs/PROMPT-CHROME-INTEGRACION.md`](docs/PROMPT-CHROME-INTEGRACION.md).

| Fase | Estado | Notas |
|---|---|---|
| F0 Cimientos | ✅ | Drizzle ORM en lugar de Prisma (sin binarios externos; migraciones en JS puro) |
| F1 Requisiciones | ✅ | API + tablet + panel; cola offline; PIN; chat; lista de compras PDF/WhatsApp/impresa |
| F2 Delivery + WhatsApp | ✅ | Bot completo con simulador; sitio `/pedir`; seguimiento; repartidor; zonas con mapa |
| F3 Valor agregado | ✅ | Reportes, promociones, cupones, fidelización, marca, multi-sucursal |
| F3b POS opcional | ✅ | Mesas, cuentas, cobro, división, caja y cortes X/Z; se activa en Configuración |
| F3c Apps nativas | ✅ | `.exe` (Electron + agente) y `.apk` (Capacitor + Bluetooth) generados por GitHub Actions |
| F4 Calidad y despliegue | ✅ | 144 pruebas unitarias API + 36 E2E + 58 de paquetes; Dockerfile único; Railway; respaldos |
| F5 Integración externa | ⏳ | Railway, Meta WhatsApp, Google Maps (opcional), Cloudflare R2 |

**Pendiente de validar con hardware/servicios reales:** impresoras físicas (red/USB/Windows/Bluetooth), app de escritorio en Windows, APK en Android, WhatsApp Cloud API real, Google Maps real.

**Fuera de alcance confirmado:** facturación CFDI, GPS en vivo del repartidor, pagos en línea, verificación del teléfono por código en la web, pedidos programados con la tienda cerrada.
