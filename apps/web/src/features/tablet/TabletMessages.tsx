import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ClipboardList, Megaphone, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { EmptyState, PageLoader } from '@/ui';
import { ChatThread } from '@/features/common-req/ChatThread';
import type { Conversation } from '@/features/common-req/types';

export function useConversations() {
  return useQuery({ queryKey: ['conversations'], queryFn: () => api.get<Conversation[]>('/chat/conversations'), refetchInterval: 90_000 });
}

export function TabletMessages({ accent }: { accent: string }) {
  const q = useConversations();
  const [sel, setSel] = useState<string | null>(null);
  const convs = q.data ?? [];
  const order = (c: Conversation) => (c.type === 'AREA_OWNER' ? 0 : c.type === 'GENERAL' ? 1 : 2);
  const sorted = [...convs].sort((a, b) => order(a) - order(b) || (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
  useEffect(() => {
    if (!sel && sorted.length) setSel(sorted[0].id);
  }, [sel, sorted]);

  if (q.isLoading) return <PageLoader />;
  if (!convs.length) return <EmptyState title="Sin conversaciones" />;
  const current = convs.find((c) => c.id === sel) ?? sorted[0];

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 shrink-0 space-y-2 overflow-y-auto border-r border-line bg-surface-raised p-3 scroll-thin max-md:w-56">
        {sorted.map((c) => {
          const Icon = c.type === 'GENERAL' ? Megaphone : c.type === 'REQUISITION' ? ClipboardList : MessageCircle;
          const title = c.type === 'AREA_OWNER' ? 'Con la dueña' : c.type === 'GENERAL' ? 'Avisos para todos' : c.requisition?.folio ?? c.title;
          const active = c.id === current?.id;
          return (
            <button
              key={c.id}
              onClick={() => setSel(c.id)}
              className={clsx('flex w-full items-center gap-3 rounded-2xl p-3 text-left transition active:scale-[0.98]', active ? 'text-white shadow-card' : 'bg-surface-sunken/70')}
              style={active ? { background: accent } : undefined}
            >
              <Icon className="h-7 w-7 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold leading-tight">{title}</span>
                <span className={clsx('block truncate text-sm', active ? 'text-white/80' : 'text-ink-mute')}>
                  {c.lastMessage ? `${c.lastMessage.body ?? '📷 Foto'} · ${timeAgo(c.lastMessage.createdAt)}` : 'Sin mensajes'}
                </span>
              </span>
              {c.unread > 0 && <span className="grid h-8 min-w-[2rem] place-items-center rounded-full bg-danger px-2 text-sm font-bold text-white">{c.unread}</span>}
            </button>
          );
        })}
      </aside>
      {current && (
        <ChatThread
          key={current.id}
          className="min-w-0 flex-1"
          conversationId={current.id}
          mySide="AREA"
          big
          canWrite={current.type !== 'GENERAL'}
          showQuick={current.type !== 'GENERAL'}
          readOnlyHint="Solo la dueña escribe en los avisos generales."
        />
      )}
    </div>
  );
}
