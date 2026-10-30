/**
 * delivery-common/map — Mapas Leaflet + OpenStreetMap (react-leaflet).
 *
 * Exporta:
 * - `DEFAULT_CENTER` ([lat, lng] CDMX)
 * - `pinIcon(color?, label?)` → L.DivIcon (no depende de imágenes de Leaflet)
 * - `<MapView center? zoom? height? className? markers? circles? polygons? onMapClick? fitToContent? children?>`
 *     markers: { id, lat, lng, color?, label?, popup? }[]
 *     circles: { id, lat, lng, radiusKm, color }[]
 *     polygons: { id, coordinates: [lat,lng][] , color }[]
 *     El contenedor siempre tiene altura explícita y `rounded-2xl overflow-hidden`; si los tiles
 *     no cargan (sin internet) se ve un fondo neutro con la cuadrícula.
 * - `<PinPicker value onChange height? />` mapa para elegir una ubicación (click o arrastrar el pin).
 * - `useMapInstance()` re-export de `useMap` para hijos personalizados.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { MapContainer, Marker, Polygon, Circle, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import clsx from 'clsx';

export const DEFAULT_CENTER: [number, number] = [19.4326, -99.1332];
export { useMap as useMapInstance };

export function pinIcon(color = 'rgb(var(--brand))', label?: string): L.DivIcon {
  const txt = label ? `<span style="position:absolute;inset:0;display:grid;place-items:center;transform:rotate(45deg);color:#fff;font:700 11px/1 Inter,system-ui">${label.slice(0, 2)}</span>` : '';
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
    html: `<span style="position:relative;display:block;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgb(0 0 0 / .35)">${txt}</span>`,
  });
}

export interface MapMarker { id: string; lat: number; lng: number; color?: string; label?: string; popup?: ReactNode }
export interface MapCircle { id: string; lat: number; lng: number; radiusKm: number; color: string; dashed?: boolean }
export interface MapPolygon { id: string; coordinates: [number, number][]; color: string; dashed?: boolean }

function ClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Fit({ points, center }: { points: [number, number][]; center?: [number, number] }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 16 });
    else if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 15));
    else if (center) map.setView(center);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

/** Corrige el tamaño cuando el mapa se monta dentro de un modal/tab oculto. */
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

export function MapView({
  center,
  zoom = 13,
  height = 320,
  className,
  markers = [],
  circles = [],
  polygons = [],
  onMapClick,
  fitToContent = true,
  children,
}: {
  center?: [number, number];
  zoom?: number;
  height?: number | string;
  className?: string;
  markers?: MapMarker[];
  circles?: MapCircle[];
  polygons?: MapPolygon[];
  onMapClick?: (lat: number, lng: number) => void;
  fitToContent?: boolean;
  children?: ReactNode;
}) {
  const c = center ?? (markers[0] ? [markers[0].lat, markers[0].lng] as [number, number] : DEFAULT_CENTER);
  const fitPoints = useMemo<[number, number][]>(() => {
    if (!fitToContent) return [];
    const pts: [number, number][] = markers.map((m) => [m.lat, m.lng]);
    for (const p of polygons) pts.push(...p.coordinates);
    for (const ci of circles) {
      const dLat = ci.radiusKm / 111;
      const dLng = ci.radiusKm / (111 * Math.cos((ci.lat * Math.PI) / 180));
      pts.push([ci.lat + dLat, ci.lng + dLng], [ci.lat - dLat, ci.lng - dLng]);
    }
    return pts;
  }, [markers, polygons, circles, fitToContent]);
  return (
    <div
      className={clsx('relative isolate z-0 overflow-hidden rounded-2xl border border-line bg-surface-sunken', className)}
      style={{ height, backgroundImage: 'linear-gradient(rgb(var(--line)/.6) 1px,transparent 1px),linear-gradient(90deg,rgb(var(--line)/.6) 1px,transparent 1px)', backgroundSize: '32px 32px' }}
    >
      <MapContainer center={c} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%', background: 'transparent' }} attributionControl>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        <InvalidateOnMount />
        {fitToContent && <Fit points={fitPoints} center={center} />}
        {onMapClick && <ClickHandler onClick={onMapClick} />}
        {circles.map((ci) => (
          <Circle key={ci.id} center={[ci.lat, ci.lng]} radius={ci.radiusKm * 1000} pathOptions={{ color: ci.color, fillColor: ci.color, fillOpacity: 0.15, weight: 2, dashArray: ci.dashed ? '6 6' : undefined }} />
        ))}
        {polygons.map((p) => (
          <Polygon key={p.id} positions={p.coordinates} pathOptions={{ color: p.color, fillColor: p.color, fillOpacity: 0.18, weight: 2, dashArray: p.dashed ? '6 6' : undefined }} />
        ))}
        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={pinIcon(m.color, m.label)}>
            {m.popup && <Popup>{m.popup}</Popup>}
          </Marker>
        ))}
        {children}
      </MapContainer>
    </div>
  );
}

/** Selector de ubicación: toca el mapa o arrastra el pin. */
export function PinPicker({
  value,
  onChange,
  height = 260,
  hint = 'Toca el mapa o arrastra el pin para ajustar la ubicación',
}: {
  value: { lat: number; lng: number } | null;
  onChange: (v: { lat: number; lng: number }) => void;
  height?: number;
  hint?: string;
}) {
  const center: [number, number] = value ? [value.lat, value.lng] : DEFAULT_CENTER;
  return (
    <div>
      <MapView center={center} zoom={value ? 16 : 12} height={height} onMapClick={(lat, lng) => onChange({ lat, lng })} fitToContent={false}>
        <Recenter center={value ? center : null} />
        {value && (
          <Marker
            position={center}
            draggable
            icon={pinIcon()}
            eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onChange({ lat: p.lat, lng: p.lng }); } }}
          />
        )}
      </MapView>
      <p className="mt-1.5 text-xs text-ink-mute">
        {hint}
        {value && <span className="ml-1 font-mono">({value.lat.toFixed(5)}, {value.lng.toFixed(5)})</span>}
      </p>
    </div>
  );
}

function Recenter({ center }: { center: [number, number] | null }) {
  const map = useMap();
  const key = center?.join(',');
  useEffect(() => {
    if (center) map.setView(center, Math.max(map.getZoom(), 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
