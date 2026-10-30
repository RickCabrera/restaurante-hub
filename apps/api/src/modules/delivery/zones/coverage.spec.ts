import { distanceKm, pickZone, validPolygon, ZoneCandidate, zoneContains } from './coverage';

const CENTER = { lat: 19.4326, lng: -99.1332 };
const branch = { id: 'b1', name: 'Centro', lat: CENTER.lat, lng: CENTER.lng, active: true, acceptsDelivery: true };
const zone = (o: Partial<ZoneCandidate>): ZoneCandidate => ({
  id: 'z', name: 'Z', kind: 'RADIUS', polygon: null, radiusKm: 3, feeCents: 2500, minOrderCents: 10000, freeFromCents: null,
  etaMinutes: 35, priority: 1, active: true, branch, ...o,
});
// Cuadro alrededor del Zócalo (~1 km)
const square = { type: 'Polygon' as const, coordinates: [[[-99.14, 19.425], [-99.125, 19.425], [-99.125, 19.44], [-99.14, 19.44], [-99.14, 19.425]]] };

describe('coverage', () => {
  it('distancia haversine razonable', () => {
    // Zócalo → Ángel de la Independencia ≈ 3.6 km
    expect(distanceKm(CENTER.lat, CENTER.lng, 19.4270, -99.1677)).toBeGreaterThan(3.4);
    expect(distanceKm(CENTER.lat, CENTER.lng, 19.4270, -99.1677)).toBeLessThan(3.8);
  });

  it('radio desde la sucursal', () => {
    const z = zone({ radiusKm: 3 });
    expect(zoneContains(z, 19.44, -99.14)).toBe(true);
    expect(zoneContains(z, 19.4270, -99.1677)).toBe(false);
    expect(zoneContains(zone({ branch: { ...branch, lat: null, lng: null } }), 19.44, -99.14)).toBe(false);
  });

  it('punto en polígono', () => {
    const z = zone({ kind: 'POLYGON', polygon: square, radiusKm: null });
    expect(zoneContains(z, 19.43, -99.13)).toBe(true);
    expect(zoneContains(z, 19.45, -99.13)).toBe(false);
    expect(zoneContains(zone({ kind: 'POLYGON', polygon: null }), 19.43, -99.13)).toBe(false);
  });

  it('elige la zona de menor prioridad entre las que coinciden', () => {
    const z1 = zone({ id: 'z1', name: '3 km', radiusKm: 3, priority: 1, feeCents: 2500 });
    const z2 = zone({ id: 'z2', name: '6 km', radiusKm: 6, priority: 2, feeCents: 4500, freeFromCents: 50000 });
    expect(pickZone([z2, z1], 19.44, -99.14)?.zone.id).toBe('z1');
    const far = pickZone([z1, z2], 19.4270, -99.1677);
    expect(far).toMatchObject({ zone: { id: 'z2' }, feeCents: 4500, freeFromCents: 50000, branchId: 'b1' });
    expect(far!.distanceKm).toBeGreaterThan(3);
    expect(pickZone([z1, z2], 19.6, -99.0)).toBeNull();
  });

  it('ignora zonas inactivas y sucursales inactivas o sin domicilio', () => {
    expect(pickZone([zone({ active: false })], 19.44, -99.14)).toBeNull();
    expect(pickZone([zone({ branch: { ...branch, active: false } })], 19.44, -99.14)).toBeNull();
    expect(pickZone([zone({ branch: { ...branch, acceptsDelivery: false } })], 19.44, -99.14)).toBeNull();
  });

  it('valida polígonos', () => {
    expect(validPolygon(square)).toBe(true);
    expect(validPolygon({ type: 'Polygon', coordinates: [[[-99.14, 19.425], [-99.125, 19.425], [-99.125, 19.44]]] })).toBe(false);
    expect(validPolygon({ type: 'Polygon', coordinates: [[[-99.14, 19.425], [-99.125, 19.425], [-99.125, 19.44], [-99.1, 19.4]]] })).toBe(false);
  });
});
