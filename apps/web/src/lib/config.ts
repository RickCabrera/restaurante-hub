// Configuración en tiempo de ejecución.
// La misma compilación de la web se usa en el navegador, en la app de escritorio (.exe) y en Android (.apk):
// por eso la URL del servidor se puede definir sin recompilar.
//
// Prioridad: localStorage['rh.apiUrl'] (pantalla "Conectar servidor") > window.__RH_CONFIG__.apiUrl > VITE_API_URL > mismo origen.

declare global {
  interface Window {
    __RH_CONFIG__?: { apiUrl?: string; businessSlug?: string };
  }
}

const KEY = 'rh.apiUrl';

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function getApiBase(): string {
  const v =
    safeGet(KEY) ||
    window.__RH_CONFIG__?.apiUrl ||
    (import.meta.env.VITE_API_URL as string | undefined) ||
    '';
  return v.replace(/\/$/, '');
}

export function setApiBase(url: string | null) {
  try {
    if (url) localStorage.setItem(KEY, url.replace(/\/$/, ''));
    else localStorage.removeItem(KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

/** ¿Corre dentro de una app nativa sin servidor configurado? (Android empaquetado) */
export function needsServerSetup(): boolean {
  const isFileOrCap = location.protocol === 'capacitor:' || location.protocol === 'file:' || location.hostname === 'localhost' && !!(window as unknown as { Capacitor?: unknown }).Capacitor;
  return isFileOrCap && !getApiBase();
}

export function getBusinessSlug(): string | undefined {
  return window.__RH_CONFIG__?.businessSlug || (import.meta.env.VITE_BUSINESS_SLUG as string | undefined) || undefined;
}

export function apiUrl(path: string): string {
  return `${getApiBase()}/api${path.startsWith('/') ? path : `/${path}`}`;
}

/** URL absoluta para imágenes que el API devuelve como relativas. */
export function assetUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  if (/^(https?:|data:|blob:)/.test(u)) return u;
  return `${getApiBase()}${u.startsWith('/') ? u : `/${u}`}`;
}
