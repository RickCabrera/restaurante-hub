import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { RT } from '@rh/shared';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/socket';
import { setBadge } from '@/app/badges';
import type { Area, ChatMessage, Device, PendingStats, Requisition } from './types';

/** Guarda una requisición recibida (REST o tiempo real) en la caché del detalle e invalida listas. */
export function upsertRequisition(qc: QueryClient, r: Requisition) {
  qc.setQueryData(['requisition', r.id], r);
  void qc.invalidateQueries({ queryKey: ['requisitions'] });
  void qc.invalidateQueries({ queryKey: ['req-stats'] });
  void qc.invalidateQueries({ queryKey: ['shopping-list'] });
}

export function usePendingStats() {
  return useQuery({ queryKey: ['req-stats'], queryFn: () => api.get<PendingStats>('/requisitions/stats/pending'), refetchInterval: 60_000 });
}

export function useChatUnread() {
  return useQuery({ queryKey: ['chat-unread'], queryFn: () => api.get<{ unread: number }>('/chat/unread'), refetchInterval: 60_000 });
}

/**
 * Contadores del menú (requisiciones por revisar y mensajes sin leer) siempre al día.
 * Se monta en el dashboard, la bandeja y el chat de la dueña.
 */
export function useManagerBadges() {
  const qc = useQueryClient();
  const stats = usePendingStats();
  const unread = useChatUnread();
  useEffect(() => {
    if (stats.data) setBadge('requisitions', stats.data.totals.toReview);
  }, [stats.data]);
  useEffect(() => {
    if (unread.data) setBadge('chat', unread.data.unread);
  }, [unread.data]);
  useRealtime<Requisition>([RT.REQUISITION_CREATED, RT.REQUISITION_UPDATED], (r) => upsertRequisition(qc, r));
  useRealtime<ChatMessage>([RT.MESSAGE_CREATED, RT.MESSAGE_READ], () => {
    void qc.invalidateQueries({ queryKey: ['chat-unread'] });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  });
  return { stats, unread };
}

export function newClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** localStorage seguro */
export const store = {
  get<T>(k: string, fallback: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* lleno o bloqueado */
    }
  },
};

export function useAreas(all = false) {
  return useQuery({ queryKey: ['areas', all], queryFn: () => api.get<Area[]>('/areas', all ? { all: 1 } : undefined), staleTime: 60_000 });
}

export function useDevices() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['devices'], queryFn: () => api.get<Device[]>('/devices'), refetchInterval: 60_000 });
  useRealtime<{ id: string; online: boolean; lastSeenAt: string | null }>(RT.DEVICE_STATUS, (p) => {
    qc.setQueryData<Device[]>(['devices'], (old) => old?.map((d) => (d.id === p.id ? { ...d, online: p.online, lastSeenAt: p.lastSeenAt ?? d.lastSeenAt } : d)));
  });
  return q;
}
