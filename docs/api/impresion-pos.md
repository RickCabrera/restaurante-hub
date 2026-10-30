# API — Impresión, KDS y Punto de venta (contrato para el frontend)

Código: `apps/api/src/modules/printing/**`, `apps/api/src/modules/pos/**` (esquemas en `dto.ts`).

## Impresión (ADMIN salvo nota)
- `GET /printing/connections?platform=web|desktop|android` (cualquiera) → `[{value,label,handler,requiresAgent,platforms,available?}]`
- Agentes: `GET /printing/agents?includeRevoked`; `POST /printing/agents {name, kind:'agent'|'desktop'|'android'}` y `POST /printing/agents/:id/rotate-token` → `{agent, apiUrl, token, configString:"RH_API_URL=…\nRH_AGENT_TOKEN=…", pairingString:"rh-agent:<base64url>"}` (token solo se muestra aquí); `DELETE /printing/agents/:id`
  - Agente: `{id,name,kind,online,lastSeenAt,version,hostname,platform,discovered[{name,type,path?}],revokedAt,createdAt,printers:[{id,name,connection,active}]}`
- Impresoras: `GET /printing/printers` (cualquier usuario/dispositivo), `POST`, `PATCH|PUT|DELETE /printing/printers/:id`, `POST /printing/printers/:id/test`
  - Body (PrinterSchema de @rh/shared): `{name, areaId?, connection, dialect, host?, port?, devicePath?, windowsName?, baudRate?, bluetoothAddress?, paperWidth:58|80, copies, cutPaper, openDrawer, printsCustomerTicket, agentId?, active}`
  - Respuesta: fila + `connectionLabel, areaName, agentName, agentOnline, clientsOnline`
  - Validación: NETWORK host (+port 9100); USB_DEVICE devicePath; WINDOWS_PRINTER windowsName; SERIAL devicePath (+baud 9600); BLUETOOTH address opcional; KDS requiere areaId. agentId obligatorio si hay varios agentes.
- Trabajos: `GET /printing/jobs?status&printerId&limit` → `[{id,printerId,printerName,agentId,kind,title,status,attempts,error,orderId,ticketId,createdAt,sentAt,printedAt}]`; `GET /printing/jobs/:id` (+document); `POST /printing/jobs/:id/retry|cancel` (ADMIN, CASHIER); `POST /printing/print {printerId, kind, document}`; `POST /printing/print-shopping-list {printerId, data}`
- **Este dispositivo imprime** (navegador/Android): usar `@/platform` (`startPrintClient`, `togglePrintClientPrinter(id,on)`, `getPrintClientPrinters`, `usePrintClient()`, `listBluetoothPrinters`, `setLocalBluetoothAddress`, `supportedConnections(getPlatform())`, `previewDocumentHtml(doc)`). Ver `apps/web/src/platform/index.ts`.

## KDS (pantalla de cocina)
Dispositivo KDS (su área) o ADMIN/AREA_LEAD con `?areaId` (CASHIER lee).
- `GET /kds/items?areaId&includeDone` → grupos `[{source:'ORDER'|'TICKET', id, folio, label, createdAt, elapsedMinutes, notes, items:[{id,name,quantity,modifiers:[{name,quantity}],note,doneAt}]}]`
- `POST /kds/items/done` y `/kds/items/undo {source, itemIds}`; `POST /kds/groups/:source/:id/done`
- Cuando todos los productos de un pedido están listos, el pedido pasa a LISTO.

## POS (módulo opcional; `@RequiresModule('pos')`)
Tablet POS: lecturas sin PIN; escrituras requieren PIN (`X-Staff-Token`) → si no, 403 "Identifícate con tu PIN".
- Personal (WAITER, CASHIER, ADMIN): `GET /pos/floor`, `/pos/menu`, `/pos/dining-areas`, `/pos/tables`, `/pos/tickets?status=open|today|paid|cancelled|all&tableId&mine`, `/pos/tickets/:id`; `POST /pos/tickets {tableId? | serviceType:'PARA_LLEVAR'|'MOSTRADOR', label?, guests}`; `PATCH /pos/tickets/:id`; `POST /pos/tickets/:id/lines {lines:[{productId,quantity,modifiers:[{modifierId,quantity}],note?}]}`; `PATCH .../lines/:lineId {quantity?, note?}` (sin enviar); `POST .../lines/:lineId/cancel {reason}`; `POST .../send`; `POST .../tip {percent?|amountCents?}`; `POST .../request-bill`; `POST .../split {mode:'lines', lineIds} | {mode:'equal', parts}`; `POST .../merge {sourceTicketId}`; `POST .../move {tableId}`; `POST .../print {kind:'bill'|'kitchen'}`
- CASHIER, ADMIN: `POST .../discount {type:'PERCENT'|'AMOUNT', value, reason}`, `POST .../lines/:lineId/discount` (también `{isCourtesy:true}`); >20% requiere ADMIN; `POST .../pay {payments:[{method, amountCents, receivedCents?, reference?, tipCents}]}` (409 "Abre la caja primero"); `POST .../cancel {reason}`
- Caja (CASHIER, ADMIN): `POST /pos/cash-sessions/open {openingCents, branchId?}`, `GET /pos/cash-sessions/current`, `GET /:id`, `POST /:id/movements {type:'ENTRADA'|'SALIDA', amountCents, reason}`, `GET /:id/summary`, `POST /:id/cut-x`, `POST /:id/close {countedCents, notes}`
- ADMIN: dining areas `POST`, `PUT /pos/dining-areas/reorder {ids}`, `PATCH|DELETE /:id`; mesas `POST {diningAreaId,name,capacity,shape}`, `PUT /pos/tables/layout [{id,posX,posY,shape}]`, `PATCH|DELETE /:id`; `GET /pos/cash-sessions?from&to`; `GET /pos/reports?from&to`

### Formas
- Floor: `[{...diningArea, tables:[{...table(status LIBRE|OCUPADA|POR_COBRAR, posX,posY,shape,capacity), ticket:{id,folio,status,totalCents,paidCents,guests,waiterId,waiterName,openedAt}|null}]}]`
- Ticket: fila (folio, status, subtotalCents, discountCents, tipCents, totalCents, paidCents, discountType/Value, tipPercent…) + `items[{id,productId,productName,quantity,unitPriceCents,modifiers[{name,priceCents,quantity}],note,discountCents,isCourtesy,totalCents,sentAt,cancelledAt}]`, `payments[]`, `table`, `waiter`, `tableLabel`, `waiterName`, `remainingCents`, `unsentCount`, `suggestedTips[{percent,amountCents}]`. `send` → +`{sentCount, printJobs, isAddition}`; `pay` → +`{paidNow, changeCents, isPaid}`; split lines → `{mode,ticket,newTicket}`; split equal → `{mode,totalCents,paidCents,remainingCents,parts[]}`
- Resumen de caja: `{openingCents, salesByMethod:[{method,label,amountCents,tipsCents,count}], salesCents, tipsCents, discountsCents, entradasCents, salidasCents, expectedCashCents, movements[], ticketsCount, cancelledCount, cancelledLinesCount, countedCents, differenceCents}`; close → `{session, printJobs, warnings, openTickets}`
- POS menu: categorías + productos (`showInPos`) con grupos de modificadores `{id,name,minSelect,maxSelect,modifiers[{id,name,priceCents,available}]}`.

## Tiempo real
- `print.job.updated` (job) y `agent.status` → managers
- `kds.updated` → `kds:{areaId}` + managers
- `order.updated` `{id,folio,status:'LISTO',...,source:'KDS'}` → managers + pos
- `pos.ticket.updated` (ticket completo), `pos.table.updated` (mesa o `{layoutChanged:true}`), `pos.cash.updated` → `pos:{bid}` + managers
