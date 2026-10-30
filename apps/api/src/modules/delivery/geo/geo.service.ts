import { Logger } from '@nestjs/common';
import { loadEnv } from '../../../config/env';

export interface GeoPoint { lat: number; lng: number }

export interface GeoResult {
  lat: number;
  lng: number;
  /** dirección legible */
  formatted: string;
  neighborhood?: string | null;
  postalCode?: string | null;
  city?: string | null;
  placeId?: string | null;
}

export interface GeoSuggestion {
  /** texto a mostrar */
  description: string;
  placeId?: string | null;
  /** algunas implementaciones devuelven coordenadas directamente */
  lat?: number | null;
  lng?: number | null;
}

/**
 * CLI-02 — Geocodificación. Clase abstracta usada como token de inyección:
 * Google (GOOGLE_MAPS_API_KEY) → Nominatim (OpenStreetMap) → MockGeo (pruebas).
 */
export abstract class GeoService {
  abstract readonly provider: 'google' | 'nominatim' | 'mock';
  abstract geocode(text: string, bias?: GeoPoint): Promise<GeoResult | null>;
  abstract reverse(lat: number, lng: number): Promise<GeoResult | null>;
  abstract autocomplete(text: string, bias?: GeoPoint): Promise<GeoSuggestion[]>;
}

async function fetchJson(url: string, headers: Record<string, string> = {}, timeoutMs = 6000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ------------------------------------------------------------------ Google
export class GoogleGeo extends GeoService {
  readonly provider = 'google' as const;
  private readonly log = new Logger('GoogleGeo');
  constructor(private readonly key: string) {
    super();
  }

  private parse(r: any): GeoResult {
    const comp = (type: string) => r.address_components?.find((c: any) => c.types?.includes(type))?.long_name ?? null;
    return {
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formatted: r.formatted_address,
      neighborhood: comp('sublocality') ?? comp('neighborhood'),
      postalCode: comp('postal_code'),
      city: comp('locality'),
      placeId: r.place_id ?? null,
    };
  }

  async geocode(text: string, bias?: GeoPoint) {
    const p = new URLSearchParams({ address: text, key: this.key, language: 'es', region: 'mx', components: 'country:MX' });
    if (bias) p.set('bounds', `${bias.lat - 0.2},${bias.lng - 0.2}|${bias.lat + 0.2},${bias.lng + 0.2}`);
    try {
      const j = await fetchJson(`https://maps.googleapis.com/maps/api/geocode/json?${p}`);
      return j.results?.[0] ? this.parse(j.results[0]) : null;
    } catch (e) {
      this.log.warn(`geocode: ${(e as Error).message}`);
      return null;
    }
  }

  async reverse(lat: number, lng: number) {
    const p = new URLSearchParams({ latlng: `${lat},${lng}`, key: this.key, language: 'es' });
    try {
      const j = await fetchJson(`https://maps.googleapis.com/maps/api/geocode/json?${p}`);
      return j.results?.[0] ? { ...this.parse(j.results[0]), lat, lng } : null;
    } catch (e) {
      this.log.warn(`reverse: ${(e as Error).message}`);
      return null;
    }
  }

  async autocomplete(text: string, bias?: GeoPoint) {
    const p = new URLSearchParams({ input: text, key: this.key, language: 'es', components: 'country:mx' });
    if (bias) {
      p.set('location', `${bias.lat},${bias.lng}`);
      p.set('radius', '20000');
    }
    try {
      const j = await fetchJson(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${p}`);
      return (j.predictions ?? []).slice(0, 6).map((x: any) => ({ description: x.description, placeId: x.place_id }));
    } catch (e) {
      this.log.warn(`autocomplete: ${(e as Error).message}`);
      return [];
    }
  }
}

// ------------------------------------------------------------------ Nominatim
/** OpenStreetMap Nominatim: política de uso → User-Agent identificable y máx. 1 solicitud/segundo. */
export class NominatimGeo extends GeoService {
  readonly provider = 'nominatim' as const;
  private readonly log = new Logger('NominatimGeo');
  private chain: Promise<unknown> = Promise.resolve();
  private last = 0;
  private readonly ua: string;

  constructor(private readonly base = 'https://nominatim.openstreetmap.org', appUrl = loadEnv().APP_URL) {
    super();
    this.ua = `RestauranteHub/1.0 (+${appUrl})`;
  }

  /** Serializa y espacia las llamadas (≥ 1 s). */
  private throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = this.last + 1100 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      return fn();
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  private parse(r: any): GeoResult {
    const a = r.address ?? {};
    return {
      lat: Number(r.lat),
      lng: Number(r.lon),
      formatted: r.display_name,
      neighborhood: a.neighbourhood ?? a.suburb ?? a.quarter ?? null,
      postalCode: a.postcode ?? null,
      city: a.city ?? a.town ?? a.village ?? a.municipality ?? null,
      placeId: r.place_id ? String(r.place_id) : null,
    };
  }

  private search(text: string, limit: number, bias?: GeoPoint) {
    const p = new URLSearchParams({ q: text, format: 'jsonv2', addressdetails: '1', countrycodes: 'mx', limit: String(limit), 'accept-language': 'es' });
    if (bias) p.set('viewbox', `${bias.lng - 0.3},${bias.lat + 0.3},${bias.lng + 0.3},${bias.lat - 0.3}`);
    return this.throttled(() => fetchJson(`${this.base}/search?${p}`, { 'User-Agent': this.ua, Accept: 'application/json' }));
  }

  async geocode(text: string, bias?: GeoPoint) {
    try {
      const j = await this.search(text, 1, bias);
      return Array.isArray(j) && j[0] ? this.parse(j[0]) : null;
    } catch (e) {
      this.log.warn(`geocode: ${(e as Error).message}`);
      return null;
    }
  }

  async reverse(lat: number, lng: number) {
    const p = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', addressdetails: '1', 'accept-language': 'es' });
    try {
      const j = await this.throttled(() => fetchJson(`${this.base}/reverse?${p}`, { 'User-Agent': this.ua, Accept: 'application/json' }));
      return j && !j.error ? { ...this.parse(j), lat, lng } : null;
    } catch (e) {
      this.log.warn(`reverse: ${(e as Error).message}`);
      return null;
    }
  }

  async autocomplete(text: string, bias?: GeoPoint) {
    try {
      const j = await this.search(text, 5, bias);
      return (Array.isArray(j) ? j : []).map((r: any) => ({ description: r.display_name, placeId: String(r.place_id), lat: Number(r.lat), lng: Number(r.lon) }));
    } catch (e) {
      this.log.warn(`autocomplete: ${(e as Error).message}`);
      return [];
    }
  }
}

// ------------------------------------------------------------------ Mock
/**
 * Geocodificador determinista para pruebas/desarrollo sin internet.
 * Direcciones conocidas por palabra clave; el resto cae cerca del centro de CDMX.
 * Texto que contiene "lejos" o "fuera" devuelve un punto fuera de cobertura; "nada" → null.
 */
export class MockGeo extends GeoService {
  readonly provider = 'mock' as const;
  static readonly CENTER: GeoPoint = { lat: 19.4326, lng: -99.1332 };
  readonly known: Record<string, GeoResult> = {
    reforma: { lat: 19.4270, lng: -99.1677, formatted: 'Paseo de la Reforma 222, Juárez, CDMX', neighborhood: 'Juárez', postalCode: '06600', city: 'Ciudad de México' },
    madero: { lat: 19.4342, lng: -99.1386, formatted: 'Av. Francisco I. Madero 1, Centro, CDMX', neighborhood: 'Centro', postalCode: '06000', city: 'Ciudad de México' },
    coyoacan: { lat: 19.3500, lng: -99.1620, formatted: 'Jardín Centenario, Coyoacán, CDMX', neighborhood: 'Coyoacán', postalCode: '04000', city: 'Ciudad de México' },
  };

  async geocode(text: string) {
    const t = text.toLowerCase();
    if (t.includes('nada')) return null;
    for (const [k, v] of Object.entries(this.known)) if (t.includes(k)) return { ...v };
    if (t.includes('lejos') || t.includes('fuera')) return { lat: 19.6, lng: -99.0, formatted: `${text} (Ecatepec)`, neighborhood: null, postalCode: null, city: 'Ecatepec' };
    return { lat: 19.4350, lng: -99.1400, formatted: `${text}, Centro, CDMX`, neighborhood: 'Centro', postalCode: '06000', city: 'Ciudad de México' };
  }

  async reverse(lat: number, lng: number) {
    return { lat, lng, formatted: `Ubicación ${lat.toFixed(5)}, ${lng.toFixed(5)}, CDMX`, neighborhood: null, postalCode: null, city: 'Ciudad de México' };
  }

  async autocomplete(text: string) {
    const r = await this.geocode(text);
    return r ? [{ description: r.formatted, placeId: `mock:${r.lat},${r.lng}`, lat: r.lat, lng: r.lng }] : [];
  }
}

/** Selección de proveedor según entorno. Las pruebas sobreescriben el provider con MockGeo. */
export function geoFactory(): GeoService {
  const env = loadEnv();
  if (process.env.GEO_PROVIDER === 'mock' || env.NODE_ENV === 'test') return new MockGeo();
  if (env.GOOGLE_MAPS_API_KEY) return new GoogleGeo(env.GOOGLE_MAPS_API_KEY);
  return new NominatimGeo(process.env.NOMINATIM_URL || undefined);
}
