# API — Módulo A: Requisiciones (contrato para el frontend)

Todo bajo `/api`, filtrado por negocio. "Tablet" = token de dispositivo AREA (solo su área). "Mgr" = OWNER/ADMIN. Endpoints de requisiciones/catálogo/tablet/chat/reportes → 404 si el módulo está apagado.
Código: `apps/api/src/modules/requisitions/**` (léelo si necesitas detalle exacto: `dto.ts` tiene los esquemas zod).

## Usuarios (Mgr)
- `GET /users?role=&areaId=&active=&q=`, `GET /users/:id`, `POST /users`, `PATCH /users/:id`
- `POST /users/:id/pin {pin|null}`, `POST /users/:id/reset-password {password}`, `POST /users/:id/activate|deactivate`
- Respuesta: `{id,name,email,phone,role,avatarColor,active,areaIds,hasPin,hasPassword,lockedUntil,lastLoginAt,createdAt}`
- Solo OWNER crea/modifica OWNER/ADMIN; no se puede desactivar a la última dueña ni a uno mismo.

## Áreas y dispositivos
- `GET /areas?all=1` (cualquier sesión/tablet), `GET /areas/:id` → área + `deviceCount`
- Mgr: `POST /areas`, `PATCH /areas/:id`, `DELETE /areas/:id` (desactiva si tiene requisiciones), `POST /areas/reorder {ids}`
- Campos área: name, color, icon, sortOrder, isProduction, canRequisition, orderWindow (`{"1":{"until":"18:00"}}` 0=domingo), branchId, active
- `GET /devices?areaId=&revoked=1` (Mgr) → `[{id,name,purpose,platform,areaId,area{id,name,color,icon},online,lastSeenAt,appVersion,revokedAt,createdAt}]`
- `PATCH /devices/:id {name?, areaId?}`
- (Ya existentes en auth) `POST /auth/pairing-codes {areaId?, purpose:'AREA'|'KDS'|'POS'}` → `{code, expiresAt, purpose, areaId}`; `POST /auth/devices/:id/revoke`

## Catálogo
- `GET /supply-categories` (Mgr o tablet); Mgr: POST, `PATCH /:id`, `DELETE /:id` (409 si tiene insumos), `POST /supply-categories/reorder {ids}`
- Proveedores (Mgr): `GET /suppliers` (+supplyCount), `GET /suppliers/:id` (+supplies[]), POST, PATCH, DELETE. Campos: name, contactName, phone, deliveryDays [0..6], notes, active
- Insumos (Mgr):
  - `GET /supplies?categoryId=&areaId=&supplierId=&active=&q=` → SupplyView = fila + `areaIds`, `category{id,name,icon}`, `supplier{id,name}`
  - `GET /supplies/icons`, `GET /supplies/:id`, POST, PATCH, DELETE (desactiva si se usó)
  - Body: `{name, categoryId, unit, step, maxPerOrder?, icon?, imageUrl?, supplierId?, autoApprove, active, areaIds}`
  - `POST /supplies/reorder {areaId, ids}`, `POST /supplies/bulk-assign {supplyIds, areaIds, mode:'add'|'remove'|'set'}`
- Importar CSV (Mgr): `GET /supplies/import/template` (CSV), `POST /supplies/import` multipart `file` o JSON `{csv, dryRun?}` → `{total, created, updated, createdCategories[], createdSuppliers[], errors:[{row,name,error}], dryRun}`
- **`GET /tablet/catalog`** (tablet; Mgr con `?areaId=`) → `{area:{id,name,color,icon,orderWindow}, categories:[{id,name,icon,sortOrder}], supplies:[{id,categoryId,name,unit,step,maxPerOrder,icon,imageUrl,autoApprove,sortOrder}]}`. ETag/304.

## Requisiciones
- `POST /requisitions` (tablet; Mgr manda `areaId`). Body: `{clientRequestId (8-64), priority:'NORMAL'|'URGENTE', note?, neededFor?, userId?, items:[{supplyId, quantity, note?}]}` → Requisition. 201 creada / 200 existente o fusionada; header `X-Requisition-Result: created|merged|existing`. 400 si `requirePin` y no hay PIN (manda `X-Staff-Token`).
- `GET /requisitions?areaId=&status=A,B&priority=&from=&to=&supplyId=&q=&open=1&late=&cursor=&limit=` → `{items, nextCursor}`
- `GET /requisitions/:id`
- `GET /requisitions/stats/pending` → `{byArea:[{area, counts{ENVIADA..SURTIDA}, total, urgent, toReview, oldestToReview}], totals:{byStatus,total,urgent,toReview}}`
- `GET /requisitions/last?areaId=` → `{requisition:{id,folio,createdAt,status}|null, items:[{supplyId,quantity,supplyName,unit,icon,imageUrl,available}]}`
- Transiciones (409 con mensaje si inválida):
  - Mgr: `POST /:id/seen`, `POST /:id/review {action:'APPROVE_ALL'|'APPROVE'|'REJECT', reason?, items?:[{id, approvedQty, note?}]}`, `POST /:id/purchasing`, `POST /:id/fulfill {items?:[{id, fulfilledQty}]}`
  - Tablet o Mgr: `POST /:id/receive {items?:[{id, receivedQty}], note?}`, `POST /:id/cancel {reason?}`
- Hilo: `POST /requisitions/:id/messages {body?, imageUrl?, quickMessageId?}`, `GET /requisitions/:id/conversation`
- **Objeto Requisition** (igual en respuestas y tiempo real):
```
{id,businessId,folio,areaId,deviceId,createdById,createdByName,clientRequestId,priority,status,note,neededFor,isLate,
 rejectReason,reviewNote,receptionNote,cancelReason,hasDifferences,seenAt,reviewedAt,reviewedById,purchasingAt,fulfilledAt,
 receivedAt,cancelledAt,escalatedAt,createdAt,updatedAt, area:{id,name,color,icon}, itemCount, conversationId|null,
 items:[{id,supplyId,supplyName,unit,icon,imageUrl,requestedQty,approvedQty,fulfilledQty,receivedQty,rejected,purchased,note,reviewNote}]}
```
- Lista de compras (Mgr): `GET /requisitions/shopping-list`, `GET /requisitions/shopping-list/print-data` (ShoppingListTicketData para `POST /printing/print-shopping-list {printerId, data}`), `GET /requisitions/shopping-list.pdf`, `POST /requisitions/shopping-list/purchased {supplyIds?, supplierId?|null}` → `{updatedItems, movedToPurchasing[], requisitions[]}`
```
{generatedAt, businessName, totalLines, requisitionCount,
 groups:[{supplierId|null, supplierName, phone, whatsappText, waLink|null,
   items:[{supplyId,supplyName,unit,unitLabel,quantity,quantityText,itemIds[],sources:[{requisitionId,folio,areaId,areaName,quantity}]}]}]}
```
- Plantillas (tablet: su área; Mgr): `GET /requisition-templates?areaId=`, `POST {name, areaId?, items:[{supplyId,quantity}]}`, `PATCH /:id`, `DELETE /:id` (items enriquecidos como `/last`)

## Chat (tablet y Mgr)
- `GET /chat/conversations` → `[{id,type:'AREA_OWNER'|'GENERAL'|'REQUISITION',title,areaId,area,requisitionId,requisition{id,folio,status}|null,lastMessageAt,lastMessage{id,body,imageUrl,authorName,authorSide,createdAt}|null,unread}]`
- `GET /chat/unread` → `{unread}`
- `GET /chat/conversations/:id/messages?before=&limit=` → `{items (ascendente), hasMore, nextBefore}`
- `POST /chat/messages {conversationId, body?, imageUrl?, quickMessageId?}` → Message `{id,conversationId,authorUserId,authorDeviceId,authorName,authorSide:'MANAGER'|'AREA'|'SYSTEM',body,imageUrl,quickMessageId,isBroadcast,readBy,createdAt}`. Las áreas no escriben en GENERAL.
- `POST /chat/conversations/:id/read`, `POST /chat/broadcast {body, imageUrl?}` (Mgr)
- Mensajes rápidos: `GET /chat/quick-messages` (`?all=1` Mgr); Mgr: POST `{text, icon, urgent, sortOrder, active}`, PATCH, DELETE, `POST /chat/quick-messages/reorder`

## Bitácora y reportes (Mgr)
- `GET /audit-logs?entity=&entityId=&actorId=&action=&from=&to=&cursor=&limit=` → `{items, nextCursor}`
- `GET /reports/requisitions?from=&to=&areaId=` → `{range, totals{requisitions,items,urgent}, byStatus, bySupply[{supplyId,name,unit,unitLabel,approvedQty,requestedQty,receivedQty,requisitions}], byArea[{areaId,name,color,count,items,urgent,late}], avgResponseMinutes, avgFulfillMinutes, differencesCount, lateCount, daily[{date,count}]}`
- `GET /reports/requisitions.csv`

## Tiempo real
| Evento | Salas | Payload |
|---|---|---|
| `requisition.created` / `requisition.updated` | managers + `area:{id}` | Requisition |
| `requisition.window_closing` | `area:{id}` | `{areaId, until, minutesLeft, message}` |
| `message.created` | managers + `area:{id}` (GENERAL → business) | Message + `conversation{id,type,areaId,requisitionId}` |
| `message.read` | igual | `{conversationId, side, readAt, readerName, messageIds}` |
| `chat.typing` | cliente→servidor (ack) `{conversationId, typing?}`; se reenvía al otro lado | `{conversationId, authorName, side, typing}` |
| `device.status` | managers | `{id, areaId, online, lastSeenAt}` |
| `catalog.changed` | business | `{kind: area|category|supply|quick_message, id|null}` |
| `area.updated` | `area:{id}` | área |
| `notification` | `user:{id}` | Notification |

Ajustes del negocio: `GET /settings`, `PATCH /settings` (ver `apps/api/src/settings/settings.controller.ts`). Notificaciones: `GET /notifications`, `POST /notifications/read {ids?}`, `GET /notifications/push/public-key`, `POST /notifications/push/subscribe {endpoint, keys:{p256dh,auth}}`. Subida de imágenes: `POST /uploads?folder=supplies|products|logos|chat|categories` multipart `file` → `{url}` (helper `api.upload(file, folder)`).
