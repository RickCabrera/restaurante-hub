import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { RT } from '@rh/shared';
import { api } from '@/lib/api';
import { useAuth, useEffectiveRole, isManagerRole } from '@/lib/auth-store';
import { useRealtime } from '@/lib/socket';
import { setBadge } from './badges';

/** Mantiene los contadores del menú lateral en cualquier página del panel. */
export function useGlobalBadges() {
  const modules = useAuth((s) => s.business?.modules);
  const role = useEffectiveRole();
  const mgr = isManagerRole(role);
  const qc = useQueryClient();
  const reqOn = !!modules?.requisitions && mgr;
  const delOn = !!modules?.delivery && (mgr || role === 'CASHIER');

  const req = useQuery({
    queryKey: ['badges', 'requisitions'],
    queryFn: () => api.get<{ totals: { toReview: number } }>('/requisitions/stats/pending'),
    enabled: reqOn,
    refetchInterval: 120_000,
  });
  const chat = useQuery({
    queryKey: ['badges', 'chat'],
    queryFn: () => api.get<{ unread: number }>('/chat/unread'),
    enabled: reqOn,
    refetchInterval: 120_000,
  });
  const orders = useQuery({
    queryKey: ['badges', 'orders'],
    queryFn: () => api.get<{ total: number }>('/orders', { status: 'NUEVO', limit: 1 }),
    enabled: delOn,
    refetchInterval: 60_000,
  });
  const wa = useQuery({
    queryKey: ['badges', 'whatsapp'],
    queryFn: () => api.get<{ unreadCount: number }[] | { items: { unreadCount: number }[] }>('/whatsapp/conversations', { limit: 50 }),
    enabled: delOn,
    refetchInterval: 120_000,
  });

  useEffect(() => { if (req.data) setBadge('requisitions', req.data.totals?.toReview ?? 0); }, [req.data]);
  useEffect(() => { if (chat.data) setBadge('chat', chat.data.unread ?? 0); }, [chat.data]);
  useEffect(() => { if (orders.data) setBadge('orders', orders.data.total ?? 0); }, [orders.data]);
  useEffect(() => {
    if (wa.data) setBadge('whatsapp', (Array.isArray(wa.data) ? wa.data : wa.data.items ?? []).reduce((s, c) => s + (c.unreadCount ?? 0), 0));
  }, [wa.data]);

  const inv = (k: string) => () => void qc.invalidateQueries({ queryKey: ['badges', k] });
  useRealtime([RT.REQUISITION_CREATED, RT.REQUISITION_UPDATED], inv('requisitions'));
  useRealtime([RT.MESSAGE_CREATED, RT.MESSAGE_READ], inv('chat'));
  useRealtime([RT.ORDER_CREATED, RT.ORDER_UPDATED], inv('orders'));
  useRealtime(RT.WA_CONVERSATION, inv('whatsapp'));
}
