import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getBusinessSlug } from '@/lib/config';
import type { CartLine, PubBranch, PubModifierGroup } from './types';

/** Slug del negocio: ?n=<slug> > configuración > 'demo'. */
export function resolveSlug(params?: URLSearchParams): string {
  const q = (params ?? new URLSearchParams(location.search)).get('n')?.trim();
  return q || getBusinessSlug() || 'demo';
}

export function useSlug(): string {
  const [params] = useSearchParams();
  return useMemo(() => resolveSlug(params), [params]);
}

export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  },
  del(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nada */
    }
  },
};

export function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function setMeta(attr: 'name' | 'property', key: string, content?: string | null) {
  if (!content) return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** SEO básico y vista previa al compartir (WEB-05). */
export function setSeo({ title, description, image, url }: { title: string; description?: string; image?: string | null; url?: string }) {
  document.title = title;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:url', url ?? location.href);
  setMeta('property', 'og:image', image ? new URL(image, location.origin).href : null);
  setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
}

/** "Elige 1", "Opcional · hasta 3", "Elige de 1 a 3" */
export function groupRule(g: Pick<PubModifierGroup, 'minSelect' | 'maxSelect'>): { text: string; required: boolean } {
  const { minSelect: min, maxSelect: max } = g;
  if (min <= 0) return { text: max <= 1 ? 'Opcional' : `Opcional · hasta ${max}`, required: false };
  if (min === max) return { text: `Elige ${min}`, required: true };
  return { text: `Elige de ${min} a ${max}`, required: true };
}

export const unitPrice = (l: Pick<CartLine, 'basePriceCents' | 'modifiers'>) => l.basePriceCents + l.modifiers.reduce((s, m) => s + m.priceCents, 0);
export const lineTotal = (l: CartLine) => unitPrice(l) * l.quantity;

export function lineKey(productId: string, modifierIds: string[], note?: string) {
  return `${productId}|${[...modifierIds].sort().join(',')}|${(note ?? '').trim().toLowerCase()}`;
}

export const onlyDigits = (s: string) => s.replace(/\D/g, '');
/** 10 dígitos MX a partir de cualquier formato (+52 1 55…) */
export const mxPhone = (s: string) => onlyDigits(s).slice(-10);
export const fmtPhone = (s?: string | null) => {
  const d = mxPhone(s ?? '');
  return d.length === 10 ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}` : s ?? '';
};
export const telHref = (p?: string | null) => `tel:${onlyDigits(p ?? '')}`;
export const waHref = (p?: string | null, text?: string) => {
  const d = onlyDigits(p ?? '');
  const full = d.length === 10 ? `52${d}` : d;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

/** Hora y día local en la zona del negocio */
function nowInTz(tz: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd), minutes: h * 60 + m };
  } catch {
    const d = new Date();
    return { day: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() };
  }
}
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** "Abierto · cierra 23:00" / "Cerrado · abre hoy a las 09:00" */
export function branchStatusText(b: PubBranch | undefined, tz: string): { open: boolean; text: string } {
  if (!b) return { open: false, text: 'Sin sucursales disponibles' };
  if (!b.isOpen) {
    if (b.nextOpeningText) return { open: false, text: `Cerrado · abre ${b.nextOpeningText}` };
    return { open: false, text: b.statusMessage || 'Cerrado por ahora' };
  }
  const hours = b.hours;
  if (hours) {
    const { day, minutes } = nowInTz(tz);
    const today = hours[String(day)] ?? [];
    const yesterday = hours[String((day + 6) % 7)] ?? [];
    for (const r of today) {
      const o = toMin(r.open);
      const c = toMin(r.close);
      if (o === c) return { open: true, text: 'Abierto · 24 horas' };
      if (c > o ? minutes >= o && minutes < c : minutes >= o) return { open: true, text: `Abierto · cierra ${r.close}` };
    }
    for (const r of yesterday) {
      const o = toMin(r.open);
      const c = toMin(r.close);
      if (c < o && minutes < c) return { open: true, text: `Abierto · cierra ${r.close}` };
    }
  }
  return { open: true, text: 'Abierto ahora' };
}

export const paymentLabels: Record<string, string> = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta a la entrega', TRANSFERENCIA: 'Transferencia' };
