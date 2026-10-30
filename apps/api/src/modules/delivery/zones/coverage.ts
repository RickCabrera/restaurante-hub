// Lógica pura de cobertura (ZON-01): punto en polígono / radio desde sucursal.
import { distance } from '@turf/distance';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import type { GeoPolygon } from '../../../db/schema';

export interface ZoneCandidate {
  id: string;
  name: string;
  kind: 'POLYGON' | 'RADIUS';
  polygon: GeoPolygon | null;
  radiusKm: number | null;
  feeCents: number;
  minOrderCents: number;
  freeFromCents: number | null;
  etaMinutes: number;
  priority: number;
  active: boolean;
  color?: string;
  branch: { id: string; name: string; lat: number | null; lng: number | null; active: boolean; acceptsDelivery: boolean };
}

export interface CoverageResult {
  zone: { id: string; name: string; color?: string; priority: number };
  branch: { id: string; name: string };
  branchId: string;
  feeCents: number;
  minOrderCents: number;
  freeFromCents: number | null;
  etaMinutes: number;
  distanceKm: number | null;
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  return distance(point([aLng, aLat]), point([bLng, bLat]), { units: 'kilometers' });
}

export function zoneContains(z: ZoneCandidate, lat: number, lng: number): boolean {
  if (z.kind === 'POLYGON') {
    const ring = z.polygon?.coordinates?.[0];
    if (!ring || ring.length < 4) return false;
    try {
      return booleanPointInPolygon(point([lng, lat]), polygon(z.polygon!.coordinates));
    } catch {
      return false;
    }
  }
  if (z.radiusKm == null || z.branch.lat == null || z.branch.lng == null) return false;
  return distanceKm(z.branch.lat, z.branch.lng, lat, lng) <= z.radiusKm;
}

/** Mejor zona: menor número de prioridad entre zonas activas de sucursales activas que aceptan domicilio. */
export function pickZone(zones: ZoneCandidate[], lat: number, lng: number): CoverageResult | null {
  const matches = zones
    .filter((z) => z.active && z.branch.active && z.branch.acceptsDelivery && zoneContains(z, lat, lng))
    .sort((a, b) => a.priority - b.priority || a.feeCents - b.feeCents);
  const z = matches[0];
  if (!z) return null;
  const d = z.branch.lat != null && z.branch.lng != null ? distanceKm(z.branch.lat, z.branch.lng, lat, lng) : null;
  return {
    zone: { id: z.id, name: z.name, color: z.color, priority: z.priority },
    branch: { id: z.branch.id, name: z.branch.name },
    branchId: z.branch.id,
    feeCents: z.feeCents,
    minOrderCents: z.minOrderCents,
    freeFromCents: z.freeFromCents,
    etaMinutes: z.etaMinutes,
    distanceKm: d == null ? null : Math.round(d * 100) / 100,
  };
}

/** Valida un polígono GeoJSON (anillo cerrado de ≥ 4 puntos [lng,lat]). */
export function validPolygon(p: GeoPolygon | null | undefined): boolean {
  const ring = p?.coordinates?.[0];
  if (!ring || ring.length < 4) return false;
  const [f, l] = [ring[0], ring[ring.length - 1]];
  return f[0] === l[0] && f[1] === l[1] && ring.every((c) => c.length >= 2 && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90);
}
