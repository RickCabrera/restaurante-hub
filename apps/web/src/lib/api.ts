import { apiUrl } from './config';
import { getAuthHeader, useAuth } from './auth-store';

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
  /** Errores de validación por campo: { "items.0.quantity": "..." } */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of (this.data?.errors as { path: string; message: string }[]) ?? []) out[e.path] = e.message;
    return out;
  }
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const s = useAuth.getState().session;
  if (s?.kind !== 'user') return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: s.refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      useAuth.getState().updateTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** no adjuntar credenciales (endpoints públicos) */
  anonymous?: boolean;
  /** devolver Response cruda (descargas) */
  raw?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = apiUrl(path);
  if (!query) return url;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
}

export async function request<T = any>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (!opts.anonymous) {
    const auth = getAuthHeader();
    if (auth) headers['Authorization'] = auth;
    const staff = useAuth.getState().staff;
    if (staff && useAuth.getState().session?.kind === 'device') headers['X-Staff-Token'] = staff.token;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'Sin conexión con el servidor');
  }

  if (res.status === 401 && !opts.anonymous && !retried) {
    const s = useAuth.getState().session;
    if (s?.kind === 'user' && (await refreshSession())) return request<T>(path, opts, true);
    if (s?.kind === 'user') useAuth.getState().logout();
    if (s?.kind === 'device') {
      // Token de tablet revocado: volver a emparejar
      const body = await res.clone().json().catch(() => null);
      if (body?.message?.includes('Sesión')) useAuth.getState().logout();
    }
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = (data && (Array.isArray(data.message) ? data.message.join(', ') : data.message)) || `Error ${res.status}`;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export const api = {
  get: <T = any>(path: string, query?: RequestOptions['query'], o?: RequestOptions) => request<T>(path, { ...o, query }),
  post: <T = any>(path: string, body?: unknown, o?: RequestOptions) => request<T>(path, { ...o, method: 'POST', body: body ?? {} }),
  put: <T = any>(path: string, body?: unknown, o?: RequestOptions) => request<T>(path, { ...o, method: 'PUT', body: body ?? {} }),
  patch: <T = any>(path: string, body?: unknown, o?: RequestOptions) => request<T>(path, { ...o, method: 'PATCH', body: body ?? {} }),
  del: <T = any>(path: string, body?: unknown, o?: RequestOptions) => request<T>(path, { ...o, method: 'DELETE', body }),
  /** Subida de imagen (multipart). folder: supplies | products | logos | chat | categories | misc */
  upload: async (file: File | Blob, folder = 'misc'): Promise<{ url: string; key: string }> => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/uploads', { method: 'POST', body: fd, query: { folder } });
  },
  /** Descarga un archivo (CSV/PDF) con autenticación. */
  download: async (path: string, filename: string, query?: RequestOptions['query']) => {
    const res = await request<Response>(path, { raw: true, query });
    if (!res.ok) throw new ApiError(res.status, 'No se pudo descargar');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
};
