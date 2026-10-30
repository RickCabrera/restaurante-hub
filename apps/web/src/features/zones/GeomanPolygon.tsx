// Edición de polígonos con leaflet-geoman dentro de un <MapView>.
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { useMapInstance } from '@/features/delivery-common';

/** [lat,lng][] (anillo abierto) ⇄ GeoJSON [[lng,lat],...] cerrado */
export function ringToGeo(ring: [number, number][]): number[][][] {
  const pts = ring.map(([lat, lng]) => [lng, lat]);
  if (pts.length) pts.push(pts[0]);
  return [pts];
}
export function geoToRing(coords: number[][][] | undefined | null): [number, number][] {
  const r = coords?.[0] ?? [];
  const pts = r.map(([lng, lat]) => [lat, lng] as [number, number]);
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  return pts;
}

function latlngsOf(layer: L.Polygon): [number, number][] {
  const ll = layer.getLatLngs() as L.LatLng[][];
  return (ll[0] ?? []).map((p) => [p.lat, p.lng]);
}

/**
 * Si `ring` tiene puntos: muestra el polígono editable (arrastrar vértices).
 * Si está vacío y `drawing` es true: activa el modo dibujo; al cerrar el polígono llama onChange.
 */
export function GeomanPolygon({ ring, color, onChange, drawing }: { ring: [number, number][]; color: string; onChange: (r: [number, number][]) => void; drawing: boolean }) {
  const map = useMapInstance();
  const layerRef = useRef<L.Polygon | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  // Capa editable
  const key = ring.length ? 'has' : 'none';
  useEffect(() => {
    if (!ring.length) return;
    const layer = L.polygon(ring, { color, fillColor: color, fillOpacity: 0.2, weight: 3 }).addTo(map);
    layerRef.current = layer;
    layer.pm.enable({ allowSelfIntersection: false, snappable: true });
    const update = () => cb.current(latlngsOf(layer));
    layer.on('pm:edit', update);
    layer.on('pm:markerdragend', update);
    layer.on('pm:vertexremoved', update);
    layer.on('pm:vertexadded', update);
    return () => {
      layer.off();
      layer.pm.disable();
      layer.remove();
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  useEffect(() => {
    layerRef.current?.setStyle({ color, fillColor: color });
  }, [color]);

  useEffect(() => {
    try {
      map.pm.setLang('es');
    } catch {
      /* idioma no disponible */
    }
  }, [map]);

  // Modo dibujo
  useEffect(() => {
    if (!drawing || ring.length) return;
    const onCreate = (e: { layer: L.Layer }) => {
      const pts = latlngsOf(e.layer as L.Polygon);
      e.layer.remove();
      cb.current(pts);
    };
    map.on('pm:create', onCreate as unknown as L.LeafletEventHandlerFn);
    map.pm.enableDraw('Polygon', { snappable: true, allowSelfIntersection: false, templineStyle: { color }, hintlineStyle: { color, dashArray: '5,5' }, pathOptions: { color, fillColor: color } } as L.PM.DrawModeOptions);
    return () => {
      map.off('pm:create', onCreate as unknown as L.LeafletEventHandlerFn);
      map.pm.disableDraw();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, drawing, key]);

  return null;
}
