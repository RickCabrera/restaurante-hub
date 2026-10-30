# WhatsApp: bot de pedidos, bandeja y simulador

Esta guía explica cómo funciona el bot de WhatsApp de Restaurante Hub (Módulo B) y cómo conectarlo a Meta.
Si no hay credenciales, todo funciona en **modo simulador**: los mensajes no salen a internet y se ven en `/dev/whatsapp`.

## 1. Cómo funciona

```
Meta (WhatsApp Cloud API) ──POST /api/whatsapp/webhook──▶ verifica la firma ▶ cola 'wa.inbound' (deduplica por waMessageId)
                                                                               │
Simulador /dev/whatsapp ──POST /api/whatsapp/simulator/inbound (síncrono)──────┤
                                                                               ▼
                          BotService.processInbound ▶ motor (bot/engine.ts) ▶ WaSender ▶ WhatsappClient.send
                                                                                  │
                                       historial wa_message + evento 'whatsapp.conversation' a la bandeja
```

- **Conversación** (`wa_conversation`): una por teléfono normalizado (`52XXXXXXXXXX`). Guarda el estado del bot, su contexto (carrito y dirección), el modo humano, los mensajes no leídos y la ventana de 24 h.
- **Sesión**: dura 2 h desde el último mensaje. Si expira, el bot vuelve a saludar.
- **Modo humano**: el cliente escribe "humano", "asesor" o "persona", o toca "🙋 Hablar con alguien". El bot se pausa para ese cliente y la dueña recibe una notificación urgente `HUMAN_HANDOFF`. Desde la bandeja se responde, y con "Regresar al bot" (`POST /conversations/:id/human {on:false}`) la sesión se reinicia.
- **Avisos de estado del pedido** (WAB-03): el cliente recibe un aviso cuando su pedido se acepta, va en camino, está listo para recoger, se entrega, se rechaza o se cancela.
  - Si la ventana de 24 h está abierta, el aviso se manda como texto libre. En el simulador también, si el pedido vino de WhatsApp.
  - Fuera de la ventana se usa una **plantilla aprobada** (sección 4).
  - Los pedidos de mostrador no generan aviso cuando no hay conversación.
- **Pedir en la web**: con la opción "Ver menú" el bot manda un botón hacia `APP_URL/pedir?s=<sessionToken>&tel=<teléfono>`. Si la web envía ese `sessionToken` en `POST /api/public/:slug/orders`, el bot confirma el pedido en el mismo chat.
- **Fidelización**: si `settings.loyalty.enabled` está activo, cada N pedidos entregados se crea un cupón personal `FIEL-XXXX` de un solo uso. El cupón se manda por chat, o con la plantilla `cupon_lealtad` si la ventana está cerrada.

### Estados del bot
`IDLE → MAIN_MENU → (REPEAT_CONFIRM) → ORDER_TYPE → CATEGORY → PRODUCT → MODIFIERS → QUANTITY → CART → ADDRESS / ADDRESS_TEXT / ADDRESS_CONFIRM → REFERENCES → PAYMENT → CASH_AMOUNT → NAME → CONFIRM (→ EDIT) → IDLE`, más `HUMAN`.

Comandos que funcionan en cualquier estado:
- "hola", "menu" o "inicio": reinician la conversación.
- "cancelar": borra el pedido en curso.
- "humano", "asesor" o "persona": pasan la conversación a una persona.
- "cupón CÓDIGO": en el resumen, aplica un cupón.

También se acepta el número de la opción (por ejemplo, "2") o su texto.

Los textos se editan en Configuración → `settings.bot` (`greeting`, `closedMessage`, `handoffMessage`, `goodbye`). Admiten los marcadores `{negocio}` y `{horario}`.

## 2. Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `WHATSAPP_TOKEN` | para producción | Token **permanente** de un *System User* con permisos `whatsapp_business_messaging` y `whatsapp_business_management`. Vacío = simulador. |
| `WHATSAPP_PHONE_NUMBER_ID` | para producción | ID del número de teléfono (no es el número). Vacío = simulador. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | recomendado | ID de la cuenta de WhatsApp Business (WABA), para administrar plantillas. |
| `WHATSAPP_APP_SECRET` | **sí** en producción | *App Secret* de la app de Meta; con él se valida `X-Hub-Signature-256`. Si falta, con token configurado todos los webhooks se rechazan (403). |
| `WHATSAPP_VERIFY_TOKEN` | sí | Texto secreto que tú inventas; se pega en Meta al configurar el webhook. |
| `WHATSAPP_API_VERSION` | no | Por defecto `v21.0`. |
| `WHATSAPP_TEMPLATE_LANG` | no | Por defecto `es_MX`. |
| `APP_URL` | sí | URL pública de la web (ligas de seguimiento `/pedido/<token>` y `/pedir`). |
| `API_URL` | sí | URL pública de la API; el webhook es `${API_URL}/api/whatsapp/webhook`. |
| `DEFAULT_BUSINESS_SLUG` | sí | Negocio que recibe los mensajes (instalación de un solo restaurante). |
| `GOOGLE_MAPS_API_KEY` | no | Geocodificación con Google. Sin ella se usa OpenStreetMap/Nominatim (1 solicitud/s). `GEO_PROVIDER=mock` fuerza el geocodificador de pruebas. |

`GET /api/whatsapp/status` muestra el modo (`simulador` o `conectado`), el `phoneNumberId` y la URL del webhook que hay que pegar en Meta.

## 3. Conectar con Meta (paso a paso)

1. Entra a **developers.facebook.com** → *Mis apps* → **Crear app** → tipo **Empresa** → agrega el producto **WhatsApp**.
2. En *WhatsApp → Configuración de la API*, agrega y verifica el **número del restaurante**. El número no debe tener WhatsApp personal activo. Copia el **Phone number ID** a `WHATSAPP_PHONE_NUMBER_ID` y el **WhatsApp Business Account ID** a `WHATSAPP_BUSINESS_ACCOUNT_ID`.
3. Crea un **token permanente**:
   1. Ve a *business.facebook.com → Configuración del negocio → Usuarios del sistema → Agregar* (rol Administrador).
   2. Asígnale la app y la cuenta de WhatsApp con control total.
   3. Toca **Generar token** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`, y caducidad **Nunca**.
   4. Pon el token en `WHATSAPP_TOKEN`.
4. En la app, ve a *Configuración → Básica*, copia la **Clave secreta de la app** y ponla en `WHATSAPP_APP_SECRET`.
5. En *WhatsApp → Configuración → Webhook*, haz lo siguiente:
   - **URL de devolución de llamada**: `https://<tu-api>/api/whatsapp/webhook`. Es la URL que muestra `/api/whatsapp/status`.
   - **Token de verificación**: el mismo valor de `WHATSAPP_VERIFY_TOKEN`.
   - Toca *Verificar y guardar*. La API responde el `hub.challenge` si el token coincide.
   - En *Campos del webhook*, suscríbete a **`messages`**. Ese campo incluye los mensajes entrantes y los estados `sent`, `delivered`, `read` y `failed`.
6. Crea las **plantillas** de la sección 4 en *WhatsApp Manager → Plantillas de mensajes* y espera a que Meta las apruebe.
7. Reinicia la API. `GET /api/whatsapp/status` debe mostrar `"mode": "conectado"`.
8. Prueba: manda "hola" al número desde otro celular.

> **Ventana de 24 h:** WhatsApp solo permite mandar texto libre en las 24 h siguientes al último mensaje del cliente. Fuera de esa ventana solo se pueden mandar plantillas. Por eso la bandeja responde **409** con un mensaje claro cuando la ventana está cerrada, y los avisos de pedido usan plantillas automáticamente.

> **Varios negocios (futuro):** hoy todo mensaje entrante va al negocio `DEFAULT_BUSINESS_SLUG`. Para varios negocios hay que guardar `phone_number_id` en el negocio y resolverlo con `entry[].changes[].value.metadata.phone_number_id`. El parser ya extrae ese dato en `phoneNumberId`.

## 4. Plantillas a crear en Meta

Todas son de categoría **UTILITY** y de idioma **Español (México) — `es_MX`**. Los parámetros se envían en el orden indicado, como `{{1}}`, `{{2}}`, etcétera.

| Nombre | Cuándo se usa | Cuerpo (copiar tal cual) | Parámetros |
|---|---|---|---|
| `alerta_dueno` | Notificaciones a la dueña: requisición nueva o urgente, cliente pide humano, resumen diario, error de impresión (lo usa el núcleo, `NotificationsService`). | `🔔 {{1}}` | 1: texto completo de la alerta (título, detalle y liga) |
| `pedido_confirmado` | Pedido aceptado | `Hola {{1}}, ¡aceptamos tu pedido {{2}}! Estará listo en aproximadamente {{3}} minutos. Síguelo aquí: {{4}}` | 1 nombre, 2 folio, 3 minutos, 4 liga de seguimiento |
| `pedido_en_camino` | Repartidor salió | `Hola {{1}}, tu pedido {{2}} va en camino con {{3}}. Síguelo aquí: {{4}}` | 1 nombre, 2 folio, 3 repartidor, 4 liga |
| `pedido_listo` | Pedido para recoger listo | `Hola {{1}}, tu pedido {{2}} ya está listo para recoger en {{3}}. ¡Te esperamos!` | 1 nombre, 2 folio, 3 negocio |
| `pedido_entregado` | Entregado o recogido | `¡Gracias, {{1}}! Tu pedido {{2}} fue entregado. Esperamos que lo disfrutes. — {{3}}` | 1 nombre, 2 folio, 3 negocio |
| `pedido_cancelado` | Rechazado o cancelado | `Hola {{1}}, lamentamos informarte que tu pedido {{2}} fue cancelado. Motivo: {{3}}. Si tienes dudas, responde a este mensaje.` | 1 nombre, 2 folio, 3 motivo |
| `cupon_lealtad` | Cupón de fidelización | `¡Gracias por tu preferencia, {{1}}! Te regalamos {{2}}. Usa el cupón {{3}} en tu próximo pedido.` | 1 nombre, 2 descripción, 3 código |

Notas para que Meta apruebe las plantillas:
- Agrega un ejemplo para cada variable. Ejemplo: `Ana`, `P-000123`, `30`, `https://pedidos.turestaurante.com/pedido/abc`.
- El cuerpo no debe empezar ni terminar con una variable. `alerta_dueno` cumple porque empieza con el emoji 🔔.

## 5. Simulador (sin Meta)

- `POST /api/whatsapp/simulator/inbound` (rol ADMIN). Body: `{ phone, name?, text? | buttonId? (+title) | listId? (+title) | location?: {lat,lng,address?,name?} | image?: {caption?} }`. Entra al mismo pipeline que el webhook, pero de forma síncrona. Responde `{ duplicate, conversationId, state, humanMode, replies: OutgoingWa[], phone }`.
- Las respuestas también llegan por Socket.IO. Conéctate a `/rt` con el token de un administrador y emite `wasim.join` con `{ phone }` (con ack). Después escucha `wa.sim.out` → `{ id, to, msg: OutgoingWa, at }`.
- Para enviar una ubicación de prueba dentro de la zona del seed, usa `{ lat: 19.44, lng: -99.14 }`. La sucursal está en 19.4326,-99.1332, con zonas de 3 km y 6 km.

## 6. Seguridad

- El webhook valida `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo con `WHATSAPP_APP_SECRET`). Sin firma válida responde 403.
- Los mensajes se deduplican por `waMessageId`. Si Meta reintenta un webhook, el mensaje no se procesa dos veces.
- La API responde 200 de inmediato y procesa en la cola: con Redis usa BullMQ con reintentos, y sin Redis los procesa en el mismo proceso.
