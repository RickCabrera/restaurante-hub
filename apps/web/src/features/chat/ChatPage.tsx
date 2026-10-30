import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, ClipboardList, Megaphone, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Button, EmptyState, Modal, Skeleton, Textarea, toast } from '@/ui';
import { ChatThread } from '@/features/common-req/ChatThread';
import { AreaBadge, StatusPill } from '@/features/common-req/meta';
import { useManagerBadges } from '@/features/common-req/hooks';
import type { Conversation } from '@/features/common-req/types';

export function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  useManagerBadges();
  const q = useQuery({ queryKey: ['conversations'], queryFn: () => api.get<Conversation[]>('/chat/conversations') });
  const [filter, setFilter] = useState('');
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const convs = (q.data ?? [])
    .filter((c) => !filter || (c.title + (c.area?.name ?? '') + (c.requisition?.folio ?? '')).toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '') || (a.type === 'GENERAL' ? -1 : 1));
  const current = q.data?.find((c) => c.id === conversationId);

  const title = (c: Conversation) => (c.type === 'GENERAL' ? 'Todas las áreas' : c.type === 'REQUISITION' ? `${c.requisition?.folio ?? c.title}` : c.area?.name ?? c.title);

  return (
    <div className="-mx-3 -my-4 flex h-[calc(100dvh-3.5rem-60px)] sm:-mx-6 lg:h-[calc(100dvh-3.5rem)]">
      {/* lista */}
      <aside className={clsx('flex w-full flex-col border-r border-line bg-surface-raised md:w-80 lg:w-96', conversationId && 'max-md:hidden')}>
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex items-center justify-between">
            <h1 className="h-display text-2xl font-bold">Mensajes</h1>
            <Button size="sm" icon={<Megaphone className="h-4 w-4" />} onClick={() => setBroadcastOpen(true)}>
              Aviso a todos
            </Button>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <input className="input h-10 pl-9" placeholder="Buscar" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-2 scroll-thin">
          {q.isLoading ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : convs.length === 0 ? (
            <EmptyState title="Sin conversaciones" />
          ) : (
            convs.map((c) => (
              <Link
                key={c.id}
                to={`/admin/chat/${c.id}`}
                className={clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 transition', c.id === conversationId ? 'bg-brand-50' : 'hover:bg-surface-sunken')}
              >
                {c.type === 'GENERAL' ? (
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-white">
                    <Megaphone className="h-5 w-5" />
                  </span>
                ) : c.area ? (
                  <span className="relative">
                    <AreaBadge area={c.area} size={44} />
                    {c.type === 'REQUISITION' && (
                      <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-surface-raised bg-ink text-white">
                        <ClipboardList className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={clsx('flex-1 truncate', c.unread ? 'font-bold' : 'font-semibold')}>{title(c)}</span>
                    <span className="shrink-0 text-[11px] text-ink-mute">{c.lastMessageAt ? timeAgo(c.lastMessageAt) : ''}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={clsx('flex-1 truncate text-sm', c.unread ? 'text-ink' : 'text-ink-mute')}>
                      {c.lastMessage ? `${c.lastMessage.authorSide === 'MANAGER' ? 'Tú: ' : ''}${c.lastMessage.body ?? '📷 Foto'}` : c.type === 'REQUISITION' ? `Hilo de ${c.area?.name ?? ''}` : 'Sin mensajes'}
                    </span>
                    {c.unread > 0 && <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                  </span>
                </span>
              </Link>
            ))
          )}
        </div>
      </aside>

      {/* conversación */}
      <section className={clsx('flex min-w-0 flex-1 flex-col bg-surface', !conversationId && 'max-md:hidden')}>
        {current ? (
          <>
            <header className="flex items-center gap-3 border-b border-line bg-surface-raised px-3 py-2.5">
              <button className="grid h-10 w-10 place-items-center rounded-xl md:hidden" onClick={() => navigate('/admin/chat')} aria-label="Volver">
                <ArrowLeft className="h-5 w-5" />
              </button>
              {current.area ? <AreaBadge area={current.area} size={36} /> : <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white"><Megaphone className="h-4 w-4" /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-semibold">{title(current)}</p>
                <p className="truncate text-xs text-ink-mute">
                  {current.type === 'GENERAL' ? 'Lo ven todas las tablets' : current.type === 'REQUISITION' ? current.area?.name : 'Conversación con el área'}
                </p>
              </div>
              {current.requisition && (
                <Link to={`/admin/requisiciones/${current.requisition.id}`} className="flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface-sunken">
                  <StatusPill status={current.requisition.status} />
                  <span className="hidden sm:inline">Ver requisición</span>
                </Link>
              )}
            </header>
            <ChatThread key={current.id} conversationId={current.id} mySide="MANAGER" className="min-h-0 flex-1" />
          </>
        ) : conversationId && q.isLoading ? null : (
          <EmptyState className="h-full" title="Elige una conversación" description="Aquí platicas con cada área. Usa “Aviso a todos” para mandar un mensaje a todas las tablets." />
        )}
      </section>

      <BroadcastModal open={broadcastOpen} onClose={() => setBroadcastOpen(false)} onSent={(id) => navigate(`/admin/chat/${id}`)} />
    </div>
  );
}

function BroadcastModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (conversationId: string) => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const m = await api.post<{ conversationId: string }>('/chat/broadcast', { body: body.trim() });
      toast.success('Aviso enviado a todas las áreas');
      setBody('');
      onClose();
      onSent(m.conversationId);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Aviso a todas las áreas"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} disabled={!body.trim()} icon={<Megaphone className="h-4 w-4" />} onClick={send}>Enviar aviso</Button>
        </>
      }
    >
      <Textarea label="Mensaje" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ej. Hoy cerramos a las 9. Hagan su pedido antes de las 6." maxLength={2000} autoFocus />
      <p className="mt-2 text-xs text-ink-mute">Aparece en todas las tablets con sonido.</p>
    </Modal>
  );
}
