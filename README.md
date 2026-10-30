# Restaurante Hub

Sistema para restaurantes con tres módulos sobre un mismo núcleo:

| Módulo | Qué hace |
|---|---|
| **A. Requisiciones internas** | Tablets por área (cocina, barra, almacén) con **íconos grandes**: cada toque suma un kilo, un bote o una pieza del insumo. La requisición llega al instante a la dueña, que aprueba, compra (lista consolidada por proveedor) y marca surtido; el área confirma la recepción. Chat interno con mensajes rápidos. |
| **B. Delivery + WhatsApp** | Pedidos por **bot de WhatsApp**, menú web propio (`/pedir`) y captura por teléfono. Dirección o ubicación con zonas de reparto, promociones y cupones, monitor de pedidos en tiempo real, repartidores, seguimiento para el cliente y **comandas impresas por área**. |
| **C. Punto de venta (opcional)** | Mesas, cuentas, envío a cocina, descuentos, dividir cuenta, cobro con varios métodos, caja con corte X/Z. Se activa en Configuración → Módulos. |

Además: pantalla de cocina (KDS), notificaciones push al celular de la dueña, reportes, bitácora, y **todos los escenarios de impresión** (red, USB, impresora de Windows, serial, Bluetooth desde Android, navegador).

Entregables: **web (PWA)** · **app de escritorio Windows (.exe)** con agente de impresión integrado · **app Android (.apk)**.

---

## Estructura

```
apps/api           API NestJS + Drizzle (PostgreSQL) + Socket.IO + BullMQ (Redis)
apps/web           App web React (panel de la dueña, tablets, POS, KDS, repartidor, menú público)
apps/print-agent   Agente de impresión (PC / Raspberry) — también va dentro de la app de escritorio
apps/desktop       App de escritorio Electron (.exe)
apps/mobile        App Android Capacitor (.apk)
packages/shared    Tipos, enums, reglas de negocio compartidas
packages/printing  Plantillas de tickets y renderizado ESC/POS / HTML
docs/              Arquitectura, impresión, WhatsApp, apps, despliegue
BACKLOG.md         Backlog end-to-end del proyecto
```

## Desarrollo local

Requisitos: Node 22, pnpm 10, PostgreSQL 16 y Redis 7 (o `docker compose up -d postgres redis`).

```bash
pnpm install
cp .env.example apps/api/.env          # ajusta DATABASE_URL, JWT_SECRET, NODE_ENV=development
pnpm --filter @rh/shared build && pnpm --filter @rh/printing build
pnpm db:migrate                         # crea las tablas
pnpm db:seed                            # datos de demostración
pnpm dev                                # API :3000 + web :5173
```

Usuarios de demostración (contraseña `demo1234`): `duena@demo.mx` (dueña), `admin@demo.mx`, `caja@demo.mx` (PIN 4444), `mesero@demo.mx` (PIN 5555), `repartidor@demo.mx`. PIN de cocina: Chef Pedro `1234`, Ana `2222`; barra: Luis `3333`.

Tablet de prueba: en el panel → Equipo y tablets → Emparejar tablet → escribe el código en `/emparejar` desde otra ventana.

WhatsApp sin número conectado: Panel → WhatsApp → **Simulador**.

## Pruebas

```bash
pnpm --filter @rh/shared test
pnpm --filter @rh/printing test
pnpm --filter @rh/api test            # unitarias
pnpm --filter @rh/api test:e2e        # integración (requiere PostgreSQL)
```

## Despliegue

Railway con un solo servicio (Dockerfile de la raíz) + PostgreSQL + Redis. Guía: [`docs/DEPLOY.md`](docs/DEPLOY.md).
Conexión de servicios externos con Claude en Chrome: [`docs/PROMPT-CHROME-INTEGRACION.md`](docs/PROMPT-CHROME-INTEGRACION.md).

## Documentación

- [Arquitectura y convenciones](docs/ARQUITECTURA.md)
- [Impresión: todos los escenarios](docs/IMPRESION.md)
- [WhatsApp Cloud API y plantillas](docs/WHATSAPP.md)
- [Apps de escritorio y Android](docs/APPS.md)
- [Guía de uso para la dueña y el personal](docs/GUIA-USUARIO.md)
