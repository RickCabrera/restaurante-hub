# API — Módulo B: Delivery + WhatsApp (contrato para el frontend)

Código: `apps/api/src/modules/delivery/**`, `apps/api/src/modules/whatsapp/**`. Manager endpoints: `@RequiresModule('delivery')`. Públicos resuelven negocio por `:slug` (404 si delivery apagado). Slug por defecto del web: `getBusinessSlug()` de `@/lib/config` o `demo`.

## Sucursales (list/get: cualquier usuario; cambios: ADMIN; pausa: ADMIN/CASHIER)
- `GET /branches`, `GET /branches/:id` → fila + `status: {open, reason:'OPEN'|'PAUSED'|'CLOSED_DATE'|'OUTSIDE_HOURS'|'INACTIVE', message, pausedUntil, pauseReason, nextOpeningAt, nextOpeningText, hoursText}`
- `POST /branches`, `PATCH /branches/:id` body `{name, address?, phone?, lat?, lng?, hours:{"0".."6":[{open:"HH:MM",close:"HH:MM"}]}, closedDates:["YYYY-MM-DD"], acceptsDelivery, acceptsPickup, prepMinutes, active}` (0=domingo; nocturnos 18:00–02:00; 00:00–00:00 = 24 h). `DELETE` desactiva.
- `POST /branches/:id/pause {minutes?|until?, reason?}`, `POST /branches/:id/resume`

## Zonas
- `GET /zones`, `GET /zones/:id`, `GET /zones/coverage?lat&lng`; ADMIN `POST`, `PATCH`, `DELETE /zones/:id` body `{branchId, name, kind:'RADIUS'|'POLYGON', radiusKm?, polygon?:{type:'Polygon',coordinates:[[[lng,lat],...]]}, color, feeCents, minOrderCents, freeFromCents?, etaMinutes, priority, active}`

## Geo
- `GET /geo/geocode?q=&lat?&lng?`, `GET /geo/reverse?lat&lng`, `GET /geo/autocomplete?q=` (Google si hay llave; si no OpenStreetMap). Para mapas en el navegador usar Leaflet + tiles OSM (react-leaflet y leaflet-geoman instalados).

## Menú (lectura: cualquiera; escritura ADMIN; agotado rápido ADMIN/CASHIER/AREA_LEAD)
- `GET /menu?channel=web|whatsapp|qr|pos&branchId=` → `MenuCategory[]`
- Categorías: `GET|POST /menu/categories`, `PATCH|DELETE /menu/categories/:id`, `PUT /menu/categories/reorder {ids}` (body `{name, description?, imageUrl?, active}`)
- Productos: `GET /menu/products?categoryId=`, `GET /menu/products/:id` (+`modifierGroupIds[]`, `branchOverrides[{branchId,priceCents,available}]`), `POST`, `PATCH /menu/products/:id` body `{categoryId, productionAreaId?, name, description?, imageUrl?, priceCents, available, showInWeb, showInWhatsapp, showInQr, showInPos, active, modifierGroupIds[]}`, `DELETE`, `PUT /menu/products/reorder {ids}`, `PATCH /menu/products/:id/availability {available}`, `PUT /menu/products/:id/branches/:branchId {priceCents?, available?}`
- Grupos: `GET|POST /menu/modifier-groups` (POST acepta `modifiers[]`), `GET|PATCH|DELETE /menu/modifier-groups/:id` body `{name, minSelect, maxSelect}`, `PUT /menu/modifier-groups/reorder`
- Modificadores: `POST /menu/modifier-groups/:id/modifiers {name, priceCents, available}`, `PATCH|DELETE .../modifiers/:modifierId`, `PATCH .../modifiers/:modifierId/availability {available}`, `PUT .../modifiers/reorder {ids}`
- `MenuCategory = {id,name,description,imageUrl,sortOrder,products:[{id,categoryId,name,description,imageUrl,priceCents,available,productionAreaId,sortOrder,modifierGroups:[{id,name,minSelect,maxSelect,sortOrder,modifiers:[{id,name,priceCents,available,sortOrder}]}]}]}`

## Clientes (ADMIN/CASHIER)
- `GET /customers?q&limit&offset` → `{items,total}`; `GET /customers/by-phone/:phone` → detalle | null; `GET /customers/:id` → fila + `addresses[]`, `recentOrders[{id,folio,status,channel,type,totalCents,createdAt,paymentMethod}]`, `stats{ordersCount,deliveredCount,cancelledCount,totalSpentCents,avgTicketCents,firstOrderAt,lastOrderAt}`
- `PATCH /customers/:id {name?,notes?,tags?}`; direcciones `GET|POST /customers/:id/addresses`, `PATCH|DELETE /customers/:id/addresses/:addressId` (`{label?,text,references?,lat?,lng?}`)

## Cupones y promociones (ADMIN)
- `/coupons` CRUD `{code, description?, discountType:'PERCENT'|'AMOUNT', value (%, o centavos), maxDiscountCents?, minOrderCents, freeDelivery, startsAt?, endsAt?, maxUses?, maxUsesPerCustomer?, channels[], active}` (+`usesCount`)
- `/promotions` CRUD `{name, kind:'PERCENT_OFF'|'AMOUNT_OFF'|'BUY_X_GET_Y'|'FREE_DELIVERY', value, buyQty?, getQty?, minOrderCents, productIds[], categoryIds[], weekdays[0-6], timeFrom?, timeTo?, channels[], startsAt?, endsAt?, active}`

## Pedidos (ADMIN/CASHIER)
- `POST /orders/quote` (body cotización + `channel`), `POST /orders` captura manual (CreateOrderSchema de @rh/shared con `channel:'TELEFONO'|'MOSTRADOR'`)
- `GET /orders?status=CSV&active=1&channel&type&from&to&q&driverId&branchId&limit&offset` → `{items: OrderView[], total}`; `GET /orders/:id`
- `POST /orders/:id/accept {estimatedMinutes?}`, `/reject {reason}`, `/status {status: EN_PREPARACION|LISTO|EN_CAMINO|ENTREGADO|RECOGIDO}`, `/cancel {reason}`, `/assign-driver {driverId|null}`, `/reprint`, `PATCH /orders/:id/paid {paid}`. 409 si transición inválida.
- **OrderView**: columnas (id, folio `P-000123`, publicToken, channel, type, status, customerName, customerPhone, addressText, addressRefs, lat, lng, subtotalCents, discountCents, deliveryFeeCents, totalCents, couponCode, paymentMethod, cashGivenCents, paid, notes, estimatedMinutes, rejectReason, cancelReason, driverId, timestamps acceptedAt/preparingAt/readyAt/dispatchedAt/deliveredAt/cancelledAt, createdAt) + `items[{id,productId,productName,productionAreaId,unitPriceCents,quantity,totalCents,note,modifiers[{name,groupName,priceCents,quantity}],kdsDoneAt}]`, `driver{id,name,phone}|null`, `branchName`, `statusLabel`, `channelLabel`, `typeLabel`, `paymentLabel`, `changeCents`, `mapsUrl`, `trackingUrl`, `customerOrdersCount`

## Repartidores
- ADMIN/CASHIER: `GET /drivers` → `[{id,name,phone,active,avatarColor,activeOrders,onTheWay,unsettledCashCents}]`, `GET /drivers/:id/summary`, `POST /drivers/:id/settle` → `{driverName, ordersCount, totalCents, orders[], settledAt, cashSessionId, cashMovementId}`
- DRIVER: `GET /driver/orders` → OrderView[]; `GET /driver/summary` → `{date, deliveredCount, deliveredTotalCents, deliveryFeesCents, byMethod[], cashToSettleCents, unsettledOrders[], deliveries[]}`; `POST /driver/orders/:id/dispatch`, `POST /driver/orders/:id/delivered`

## Reportes (ADMIN)
- `GET /reports/sales?from&to&branchId` → `{from,to,timezone,totals{salesCents,ordersCount,avgTicketCents,discountCents,deliveryFeesCents,cancelledCount,rejectedCount}, byDay[{date,ordersCount,salesCents}], byChannel[{channel,label,ordersCount,salesCents}], byType[], byPaymentMethod[], topProducts[{productId,name,quantity,salesCents}], byZone[], customers{newCount,returningCount}, times{avgPrepMinutes,avgDeliveryMinutes,avgTotalMinutes}}`; `GET /reports/sales.csv`

## Públicos (sin sesión; `api.get(path, query, { anonymous: true })`)
- `GET /public/:slug/menu?channel=web|qr&branchId=` → `{business{name,slug,logoUrl,primaryColor,accentColor,phone,address,currency,timezone,paymentMethods,transferInfo,privacyNoticeUrl}, branches[{id,name,address,phone,lat,lng,acceptsDelivery,acceptsPickup,prepMinutes,isOpen,statusMessage,nextOpeningText,hoursText}], branchId, channel, categories: MenuCategory[]}` (agotados con `available:false`)
- `GET /public/:slug/geo/autocomplete?q=`, `/geo/geocode?q=`, `/geo/reverse?lat&lng`
- `GET /public/:slug/coverage?lat&lng` → `{covered:true, zone{id,name}, branchId, branchName, feeCents, minOrderCents, freeFromCents, etaMinutes}` | `{covered:false, message}`
- `POST /public/:slug/orders/quote` body `{branchId?, type:'DOMICILIO'|'PASAR_A_RECOGER', lines:[{productId,quantity,modifiers:[{modifierId,quantity}],note?}], address?:{text,references?,lat?,lng?}, couponCode?, customerPhone?}` → **Quote** `{lines[{productId,name,quantity,unitPriceCents,modifiers[],totalCents,note}], subtotalCents, discountCents, deliveryFeeCents, totalCents, appliedPromotions[{id,name,discountCents}], coupon{code,discountCents,freeDelivery}|null, zone{id,name,etaMinutes}|null, branchId, estimatedMinutes, warnings[], errors[{code,message,lineIndex?}], canOrder}` (códigos: EMPTY_CART, PRODUCT_UNAVAILABLE, MODIFIER_MIN/MAX, STORE_CLOSED, COUPON_INVALID, ADDRESS_REQUIRED, ADDRESS_NOT_FOUND, OUT_OF_ZONE, MIN_ORDER…)
- `POST /public/:slug/orders` body quote + `{customer:{phone,name}, paymentMethod:'EFECTIVO'|'TARJETA'|'TRANSFERENCIA', cashGivenCents?, notes?, acceptPrivacy?, sessionToken?}` → TrackingView (422 `{message,errors,quote}` si no se puede)
- `GET /public/:slug/orders/:publicToken` → **TrackingView** `{folio, publicToken, status, statusLabel, type, typeLabel, channel, createdAt, estimatedMinutes, etaAt, timeline[{status,label,at,done,current}], items[{name,quantity,modifiers:string[],note,totalCents}], subtotalCents, discountCents, deliveryFeeCents, totalCents, paymentMethod, paymentLabel, paid, driverName, rejectReason, cancelReason, business{name,phone,logoUrl,primaryColor,accentColor,slug}, branch{name,address,phone}|null, active}`
- Socket anónimo: `emitAck('order.watch', {publicToken})` → TrackingView; luego escuchar `order.updated` (TrackingView).
- `/pedir?s=<sessionToken>&tel=<phone>` viene del bot de WhatsApp: mandar `sessionToken` y prellenar teléfono.

## WhatsApp (ADMIN/CASHIER)
- `GET /whatsapp/status` → `{mode:'simulador'|'conectado', phoneNumberId, verifyTokenConfigured, appSecretConfigured, webhookUrl, templateLanguage}`
- `GET /whatsapp/conversations?humanMode=1|0&q&limit&offset` → `{items|...}` (ver controlador) de **Conversation** `{id,phone,profileName,customerId,customer{id,name,ordersCount,lastOrderAt}|null,displayName,state,humanMode,humanSince,unreadCount,lastInboundAt,lastMessageAt,windowOpen,windowExpiresAt,lastMessage{body,direction,kind,createdAt}|null}`
- `GET /whatsapp/conversations/:id`, `GET /whatsapp/conversations/:id/messages?before&limit` (antiguos primero) → **Message** `{id,conversationId,direction:'IN'|'OUT',kind,body,payload,status,sentByUserId,error,createdAt}` (payload OUT = OutgoingWa: text | buttons{body,buttons[{id,title}]} | list{body,buttonText,sections[{title,rows[{id,title,description}]}]} | location_request | image | cta_url{body,buttonText,url} | template)
- `POST /whatsapp/conversations/:id/reply {text}` (409 fuera de ventana 24 h), `POST /whatsapp/conversations/:id/human {on}`, `POST /whatsapp/conversations/:id/read`
- **Simulador**: `POST /whatsapp/simulator/inbound {phone, name?, text? | buttonId?+title? | listId?+title? | location?{lat,lng,address?,name?}}` → `{conversationId, state, humanMode, replies: OutgoingWa[], phone}` (síncrono). Además `emitAck('wasim.join', {phone})` y escuchar `wa.sim.out` `{id,to,msg:OutgoingWa,at}`.

## Tiempo real
| Evento | Salas | Payload |
|---|---|---|
| `order.created` | managers, pos | OrderView |
| `order.updated` | managers, pos, `user:{driverId}` | OrderView (o `{driverSettlement}`) |
| `order.updated` | `order:{token}` | TrackingView |
| `store.status` | business | `{branchId, ...StoreStatus}` o `{zonesChanged:true}` |
| `menu.changed` | business | `{what,id,at}` |
| `whatsapp.conversation` | managers | `{conversation, message|null}` |
| `notification` | user | ORDER_NEW (link `/admin/pedidos/<id>`), HUMAN_HANDOFF (link `/admin/whatsapp/<convId>`), DAILY_SUMMARY |
