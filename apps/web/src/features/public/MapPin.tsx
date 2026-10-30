import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin as PinIcon } from 'lucide-react';

const pinIcon = L.divIcon({
  className: '',
  iconSize: [40, 48],
  iconAnchor: [20, 46],
  html: `<svg width="40" height="48" viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.3))"><path d="M20 2C10.6 2 3 9.4 3 18.6 3 31 20 46 20 46s17-15 17-27.4C37 9.4 29.4 2 20 2z" fill="rgb(var(--brand))" stroke="#fff" stroke-width="3"/><circle cx="20" cy="18" r="6.5" fill="#fff"/></svg>`,
});

/**
 * Mapa con pin arrastrable (Leaflet + OSM). Si las teselas no cargan (sin internet / bloqueadas),
 * se muestra un fondo cuadriculado con el pin y las coordenadas para que siga siendo usable.
 */
export function MapPin({ lat, lng, onMove, height = 200 }: { lat: number; lng: number; onMove?: (lat: number, lng: number) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const [tilesOk, setTilesOk] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    try {
      const m = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([lat, lng], 16);
      L.control.zoom({ position: 'bottomright' }).addTo(m);
      let loaded = 0;
      let errors = 0;
      const tl = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
      tl.on('tileload', () => {
        loaded++;
        setTilesOk(true);
      });
      tl.on('tileerror', () => {
        errors++;
        if (!loaded && errors >= 2) setTilesOk(false);
      });
      tl.addTo(m);
      // Si en 6 s no cargó ninguna tesela, damos el mapa por no disponible
      const t = setTimeout(() => !loaded && setTilesOk(false), 6000);
      const mk = L.marker([lat, lng], { icon: pinIcon, draggable: !!onMove, autoPan: true }).addTo(m);
      mk.on('dragend', () => {
        const p = mk.getLatLng();
        moveRef.current?.(p.lat, p.lng);
      });
      if (onMove)
        m.on('click', (e: L.LeafletMouseEvent) => {
          mk.setLatLng(e.latlng);
          moveRef.current?.(e.latlng.lat, e.latlng.lng);
        });
      map.current = m;
      marker.current = mk;
      return () => {
        clearTimeout(t);
        m.remove();
        map.current = null;
        marker.current = null;
      };
    } catch {
      setFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    const mk = marker.current;
    if (!m || !mk) return;
    const cur = mk.getLatLng();
    if (Math.abs(cur.lat - lat) > 1e-7 || Math.abs(cur.lng - lng) > 1e-7) {
      mk.setLatLng([lat, lng]);
      m.setView([lat, lng], Math.max(m.getZoom(), 15), { animate: true });
    }
  }, [lat, lng]);

  if (failed) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink-soft">
        <PinIcon className="h-4 w-4 text-brand" /> {lat.toFixed(5)}, {lng.toFixed(5)}
      </div>
    );
  }

  return (
    <div className="relative isolate z-0 overflow-hidden rounded-2xl border border-line" style={{ height }}>
      <div
        ref={el}
        className="h-full w-full"
        style={{
          // fondo visible mientras cargan (o si nunca cargan) las teselas
          backgroundColor: 'rgb(var(--surface-sunken))',
          backgroundImage:
            'linear-gradient(rgb(var(--line)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--line)) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
        aria-label="Mapa de tu ubicación"
      />
      {tilesOk === false && (
        <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] rounded-xl bg-surface-raised/90 px-3 py-1.5 text-xs text-ink-soft shadow-sm backdrop-blur">
          Mapa no disponible · {lat.toFixed(5)}, {lng.toFixed(5)}
          {onMove ? ' · puedes mover el pin' : ''}
        </div>
      )}
      {tilesOk !== false && onMove && (
        <div className="pointer-events-none absolute left-2 top-2 z-[500] rounded-full bg-surface-raised/90 px-3 py-1 text-xs font-medium text-ink-soft shadow-sm backdrop-blur">
          Arrastra el pin a tu puerta
        </div>
      )}
    </div>
  );
}
