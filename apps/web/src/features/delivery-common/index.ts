/**
 * features/delivery-common — Piezas compartidas de Delivery (lectura para otros módulos; API estable).
 * Ver el encabezado de cada archivo para el detalle de cada export.
 *
 * - types.ts        Tipos del contrato (OrderView, MenuCategory, Branch, Zone, Quote, CartLine, …)
 * - format.ts       pesosToCentsInput, centsToPesosInput, elapsedTone, fmtElapsed, waLink, telLink, fmtPhone, etiquetas
 * - status.tsx      STATUS_META, OrderStatusBadge, ChannelIcon, ChannelBadge, TypeBadge, PURPLE
 * - map.tsx         MapView, PinPicker, pinIcon, DEFAULT_CENTER (Leaflet + OSM)
 * - ProductModal    ProductModal (modificadores con min/max), groupRuleText, validateSelection, lineUnitCents
 * - AddressSearch   AddressSearch (autocompletar + geocodificar), geocodeText
 * - queries.ts      dk (query keys), useBranches, useDrivers, useAreas, useMenu, useZones, useOrderRealtime, upsertOrderInCaches
 * - Money.tsx       MoneyInput (pesos ⇄ centavos)
 */
export * from './types';
export * from './format';
export * from './status';
export * from './map';
export * from './ProductModal';
export * from './AddressSearch';
export * from './queries';
export * from './Money';
