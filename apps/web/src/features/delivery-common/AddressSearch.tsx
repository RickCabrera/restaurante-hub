/**
 * delivery-common/AddressSearch — Campo de dirección con autocompletado (GET /geo/autocomplete) y
 * geocodificación (GET /geo/geocode). Requiere sesión de ADMIN/CASHIER (usa endpoints autenticados);
 * para páginas públicas pasar `basePath="/public/<slug>/geo"` y `anonymous`.
 *
 * Exporta:
 * - `<AddressSearch value onChange onPick placeholder? label? basePath? anonymous? bias? />`
 *     value: texto; onChange(text); onPick({ text, lat, lng }) al elegir sugerencia o geocodificar.
 * - `geocodeText(q, opts?)` → Promise<GeoResult | null>
 */
import { useEffect, useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner, toast } from '@/ui';
import type { GeoResult, GeoSuggestion } from './types';

export async function geocodeText(q: string, opts: { basePath?: string; anonymous?: boolean; bias?: { lat: number; lng: number } } = {}): Promise<GeoResult | null> {
  const base = opts.basePath ?? '/geo';
  const r = await api.get<{ result: GeoResult | null } | GeoResult | null>(`${base}/geocode`, { q, lat: opts.bias?.lat, lng: opts.bias?.lng }, { anonymous: opts.anonymous });
  if (r && 'result' in r) return r.result;
  return (r as GeoResult | null) ?? null;
}

export function AddressSearch({
  value,
  onChange,
  onPick,
  placeholder = 'Calle, número, colonia…',
  label,
  basePath = '/geo',
  anonymous,
  bias,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: { text: string; lat: number; lng: number }) => void;
  placeholder?: string;
  label?: string;
  basePath?: string;
  anonymous?: boolean;
  bias?: { lat: number; lng: number };
}) {
  const [sugs, setSugs] = useState<GeoSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 4) {
      setSugs([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ suggestions: GeoSuggestion[] }>(`${basePath}/autocomplete`, { q, lat: bias?.lat, lng: bias?.lng }, { anonymous });
        setSugs(r.suggestions ?? []);
        setOpen(true);
      } catch {
        setSugs([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [value, basePath, anonymous, bias?.lat, bias?.lng]);

  const pick = async (s: GeoSuggestion) => {
    setOpen(false);
    skip.current = true;
    onChange(s.description);
    if (s.lat != null && s.lng != null) return onPick({ text: s.description, lat: s.lat, lng: s.lng });
    await locate(s.description);
  };

  const locate = async (q = value) => {
    if (q.trim().length < 3) return;
    setLoading(true);
    try {
      const r = await geocodeText(q, { basePath, anonymous, bias });
      if (!r) toast.error('No encontramos esa dirección', 'Revisa calle y colonia, o marca el punto en el mapa');
      else onPick({ text: q, lat: r.lat, lng: r.lng });
    } catch (e) {
      toast.fromError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      {label && <span className="label">{label}</span>}
      <div className="flex gap-2">
        <input
          className="input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => sugs.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setOpen(false);
              void locate();
            }
          }}
          aria-label={label ?? 'Dirección'}
        />
        <button type="button" onClick={() => locate()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-surface-raised hover:bg-surface-sunken" aria-label="Buscar en el mapa" title="Buscar en el mapa">
          {loading ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
        </button>
      </div>
      {open && sugs.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-[1000] mt-1 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-lift">
          {sugs.map((s, i) => (
            <li key={s.placeId ?? i}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)} className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-surface-sunken">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                {s.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
