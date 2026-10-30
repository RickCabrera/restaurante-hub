import { io, Socket } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';
import { getApiBase } from './config';
import { getAuthHeader, useAuth } from './auth-store';

let socket: Socket | null = null;
let currentKey = '';

function authKey() {
  const st = useAuth.getState();
  return `${getAuthHeader() ?? 'anon'}|${st.staff?.token ?? ''}|${getApiBase()}`;
}

/**
 * Socket.IO único de la app, conectado al namespace /rt con la credencial actual
 * (usuario, tablet o anónimo para seguimiento público). Se reconecta solo si cambia la sesión.
 */
export function getSocket(): Socket {
  const key = authKey();
  if (socket && key === currentKey) return socket;
  socket?.disconnect();
  currentKey = key;
  const st = useAuth.getState();
  socket = io(`${getApiBase()}/rt`, {
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: getAuthHeader() ?? undefined, staffToken: st.session?.kind === 'device' ? st.staff?.token : undefined }),
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  return socket;
}

// Reconecta cuando cambian credenciales (login, logout, PIN, token refrescado).
useAuth.subscribe(() => {
  if (socket && authKey() !== currentKey) {
    // El access token se refresca cada 15 min: no es necesario reconectar por eso si la conexión sigue viva.
    const prev = currentKey.split('|');
    const next = authKey().split('|');
    const onlyAccessRefreshed = prev[0].startsWith('Bearer') && next[0].startsWith('Bearer') && prev[1] === next[1] && prev[2] === next[2];
    if (onlyAccessRefreshed && socket.connected) {
      currentKey = authKey();
      return;
    }
    getSocket();
  }
});

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  currentKey = '';
}

/** Emite con ack y devuelve una promesa ({ ok, data, error }). */
export function emitAck<T = any>(event: string, payload?: unknown, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    s.timeout(timeoutMs).emit(event, payload ?? {}, (err: Error | null, res: { ok: boolean; data: T; error?: string }) => {
      if (err) return reject(new Error('Sin respuesta del servidor'));
      if (!res?.ok) return reject(new Error(res?.error ?? 'Error'));
      resolve(res.data);
    });
  });
}

/** Suscribe un manejador a un evento de tiempo real mientras el componente está montado. */
export function useRealtime<T = any>(event: string | string[], handler: (payload: T, event: string) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  const session = useAuth((s) => s.session);
  const staff = useAuth((s) => s.staff?.token);
  useEffect(() => {
    const s = getSocket();
    const events = Array.isArray(event) ? event : [event];
    const fns = events.map((ev) => {
      const fn = (p: T) => ref.current(p, ev);
      s.on(ev, fn);
      return [ev, fn] as const;
    });
    return () => {
      for (const [ev, fn] of fns) s.off(ev, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(event) ? event.join(',') : event, session, staff]);
}

/** Estado de conexión del socket (para indicadores "En línea / Sin conexión"). */
export function useSocketStatus(): boolean {
  const [connected, setConnected] = useState(() => getSocket().connected);
  const session = useAuth((s) => s.session);
  useEffect(() => {
    const s = getSocket();
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on('connect', on);
    s.on('disconnect', off);
    setConnected(s.connected);
    return () => {
      s.off('connect', on);
      s.off('disconnect', off);
    };
  }, [session]);
  return connected;
}
