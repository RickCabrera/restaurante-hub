import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import clsx from 'clsx';
import { Camera, CheckCheck, Check, Megaphone, Send } from 'lucide-react';
import { RT } from '@rh/shared';
import { api } from '@/lib/api';
import { emitAck, useRealtime } from '@/lib/socket';
import { assetUrl } from '@/lib/config';
import { fmtDate, fmtTime } from '@/lib/format';
import { sounds } from '@/lib/sound';
import { Spinner, toast } from '@/ui';
import type { ChatMessage, QuickMessage, Side } from './types';
import { QuickIcon, QUICK_TILE_COLORS } from './meta';

interface Page {
  items: ChatMessage[];
  hasMore: boolean;
  nextBefore: string | null;
}

export function useQuickMessages(all = false) {
  return useQuery({ queryKey: ['quick-messages', all], queryFn: () => api.get<QuickMessage[]>('/chat/quick-messages', all ? { all: 1 } : undefined), staleTime: 5 * 60_000 });
}

/** Indicador "escribiendo…" del otro lado de una conversación. */
function useTyping(conversationId: string) {
  const [who, setWho] = useState<string | null>(null);
  const timer = useRef<number>();
  useRealtime<{ conversationId: string; authorName: string; typing: boolean }>(RT.TYPING, (p) => {
    if (p.conversationId !== conversationId) return;
    window.clearTimeout(timer.current);
    if (p.typing) {
      setWho(p.authorName);
      timer.current = window.setTimeout(() => setWho(null), 5000);
    } else setWho(null);
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return who;
}

/**
 * Hilo de conversación reutilizable (tablet, panel de la dueña y detalle de requisición).
 *  - mySide: de qué lado escribe esta pantalla
 *  - big: estilo tablet (botones enormes, mensajes rápidos como tiles)
 */
export function ChatThread({
  conversationId,
  mySide,
  canWrite = true,
  big = false,
  showQuick = true,
  readOnlyHint,
  className,
  sendVia,
}: {
  conversationId: string;
  mySide: Side;
  canWrite?: boolean;
  big?: boolean;
  showQuick?: boolean;
  readOnlyHint?: string;
  className?: string;
  /** enviar por otra ruta (p.ej. /requisitions/:id/messages) */
  sendVia?: (body: { body?: string; imageUrl?: string; quickMessageId?: string }) => Promise<ChatMessage>;
}) {
  const qc = useQueryClient();
  const key = ['chat-messages', conversationId];
  const q = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.get<Page>(`/chat/conversations/${conversationId}/messages`, { before: pageParam, limit: 40 }),
    getNextPageParam: (p) => (p.hasMore ? p.nextBefore ?? undefined : undefined),
  });
  const quick = useQuickMessages();
  const typingWho = useTyping(conversationId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);
  const stickBottom = useRef(true);

  const markRead = () => {
    void api
      .post(`/chat/conversations/${conversationId}/read`)
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['chat-unread'] });
        void qc.invalidateQueries({ queryKey: ['conversations'] });
      })
      .catch(() => undefined);
  };
  useEffect(markRead, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const appendMessage = (m: ChatMessage) => {
    qc.setQueryData<InfiniteData<Page, string | undefined>>(key, (old) => {
      if (!old) return old;
      if (old.pages.some((p) => p.items.some((x) => x.id === m.id))) return old;
      const pages = [...old.pages];
      pages[0] = { ...pages[0], items: [...pages[0].items, m] };
      return { ...old, pages };
    });
  };

  useRealtime<ChatMessage>(RT.MESSAGE_CREATED, (m) => {
    if (m.conversationId !== conversationId) return;
    appendMessage(m);
    if (m.authorSide !== mySide) {
      sounds.message();
      markRead();
    }
  });
  useRealtime<{ conversationId: string; side: Side; readAt: string; messageIds: string[] }>(RT.MESSAGE_READ, (p) => {
    if (p.conversationId !== conversationId) return;
    qc.setQueryData<InfiniteData<Page, string | undefined>>(key, (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((pg) => ({
              ...pg,
              items: pg.items.map((m) => (p.messageIds?.includes(m.id) || (m.authorSide !== p.side && !m.readBy[p.side]) ? { ...m, readBy: { ...m.readBy, [p.side]: p.readAt } } : m)),
            })),
          }
        : old,
    );
  });

  // páginas: [0] = más recientes. Mostrar ascendente.
  const messages = (q.data?.pages ?? []).slice().reverse().flatMap((p) => p.items);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, typingWho]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 40 && q.hasNextPage && !q.isFetchingNextPage) {
      const prevH = el.scrollHeight;
      void q.fetchNextPage().then(() => requestAnimationFrame(() => (el.scrollTop = el.scrollHeight - prevH)));
    }
  };

  const send = async (payload: { body?: string; imageUrl?: string; quickMessageId?: string }) => {
    setSending(true);
    try {
      const m = sendVia ? await sendVia(payload) : await api.post<ChatMessage>('/chat/messages', { conversationId, ...payload });
      stickBottom.current = true;
      appendMessage(m);
      sounds.tap();
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      return true;
    } catch (e) {
      sounds.error();
      toast.fromError(e);
      return false;
    } finally {
      setSending(false);
    }
  };

  const onText = (v: string) => {
    setText(v);
    if (Date.now() - lastTyping.current > 2500 && v.trim()) {
      lastTyping.current = Date.now();
      emitAck('chat.typing', { conversationId, typing: true }).catch(() => undefined);
    }
  };

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    if (await send({ body })) {
      setText('');
      emitAck('chat.typing', { conversationId, typing: false }).catch(() => undefined);
    }
  };

  const onPhoto = async (f?: File) => {
    if (!f) return;
    setSending(true);
    try {
      const { url } = await api.upload(f, 'chat');
      await send({ imageUrl: url });
    } catch (e) {
      toast.fromError(e);
      setSending(false);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  let lastDay = '';
  return (
    <div className={clsx('flex min-h-0 flex-col', className)}>
      <div ref={scroller} onScroll={onScroll} className={clsx('flex-1 space-y-2 overflow-y-auto scroll-thin', big ? 'px-4 py-4' : 'px-3 py-3')}>
        {q.isLoading && (
          <div className="grid h-full place-items-center text-ink-mute">
            <Spinner />
          </div>
        )}
        {q.isFetchingNextPage && (
          <div className="flex justify-center py-2 text-ink-mute">
            <Spinner className="h-4 w-4" />
          </div>
        )}
        {!q.isLoading && messages.length === 0 && (
          <p className={clsx('py-10 text-center text-ink-mute', big ? 'text-lg' : 'text-sm')}>Aún no hay mensajes. ¡Escribe el primero!</p>
        )}
        {messages.map((m) => {
          const day = fmtDate(m.createdAt);
          const sep = day !== lastDay;
          lastDay = day;
          const mine = m.authorSide === mySide;
          const system = m.authorSide === 'SYSTEM';
          const other = mySide === 'AREA' ? 'MANAGER' : 'AREA';
          return (
            <div key={m.id}>
              {sep && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-surface-sunken px-3 py-0.5 text-xs font-medium text-ink-mute">{day}</span>
                </div>
              )}
              {system ? (
                <p className="mx-auto max-w-md rounded-xl bg-surface-sunken px-3 py-1.5 text-center text-xs text-ink-mute">{m.body}</p>
              ) : (
                <div className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={clsx(
                      'max-w-[82%] rounded-2xl px-3.5 py-2 shadow-sm',
                      mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md border border-line bg-surface-raised',
                      big && 'text-lg',
                    )}
                  >
                    {!mine && (
                      <p className={clsx('flex items-center gap-1 text-xs font-semibold', 'text-brand')}>
                        {m.isBroadcast && <Megaphone className="h-3 w-3" />}
                        {m.authorName}
                      </p>
                    )}
                    {m.imageUrl && (
                      <a href={assetUrl(m.imageUrl)} target="_blank" rel="noreferrer">
                        <img src={assetUrl(m.imageUrl)} alt="Foto" className="my-1 max-h-64 rounded-xl object-cover" />
                      </a>
                    )}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    <p className={clsx('mt-0.5 flex items-center justify-end gap-1 text-[11px]', mine ? 'text-white/75' : 'text-ink-mute')}>
                      {fmtTime(m.createdAt)}
                      {mine && (m.readBy?.[other] ? <CheckCheck className="h-3.5 w-3.5" aria-label="Leído" /> : <Check className="h-3.5 w-3.5" aria-label="Enviado" />)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {typingWho && (
          <div className="flex items-center gap-2 text-sm text-ink-mute">
            <span className="flex gap-1 rounded-2xl border border-line bg-surface-raised px-3 py-2.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-mute" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </span>
            {typingWho} está escribiendo…
          </div>
        )}
      </div>

      {canWrite ? (
        <div className="border-t border-line bg-surface-raised">
          {showQuick && !!quick.data?.length && (
            <div className={clsx('flex gap-2 overflow-x-auto scroll-thin', big ? 'px-3 pt-3' : 'px-3 pt-2')}>
              {quick.data.map((qm, i) => (
                <button
                  key={qm.id}
                  disabled={sending}
                  onClick={() => void send({ quickMessageId: qm.id })}
                  className={clsx(
                    'flex shrink-0 items-center gap-2 rounded-2xl font-semibold text-white shadow-sm transition active:scale-95 disabled:opacity-60 no-select',
                    big ? 'h-20 min-w-[150px] flex-col justify-center px-4 text-base' : 'h-9 px-3 text-sm',
                  )}
                  style={{ background: qm.urgent ? 'rgb(var(--danger))' : QUICK_TILE_COLORS[i % QUICK_TILE_COLORS.length] }}
                >
                  <QuickIcon icon={qm.icon} className={big ? 'h-7 w-7' : 'h-4 w-4'} />
                  <span className="whitespace-nowrap leading-tight">{qm.text}</span>
                </button>
              ))}
            </div>
          )}
          <form
            className={clsx('flex items-end gap-2 safe-bottom', big ? 'p-3' : 'p-2.5')}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={clsx('grid shrink-0 place-items-center rounded-2xl bg-surface-sunken text-ink-soft active:scale-95', big ? 'h-16 w-16' : 'h-11 w-11')}
              aria-label="Enviar foto"
            >
              <Camera className={big ? 'h-8 w-8' : 'h-5 w-5'} />
            </button>
            <textarea
              value={text}
              rows={1}
              onChange={(e) => onText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="Escribe un mensaje…"
              className={clsx('input flex-1 resize-none py-2.5', big ? 'h-16 text-lg' : 'h-11')}
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className={clsx('grid shrink-0 place-items-center rounded-2xl bg-brand text-white active:scale-95 disabled:opacity-50', big ? 'h-16 w-16' : 'h-11 w-11')}
              aria-label="Enviar"
            >
              {sending ? <Spinner className="h-5 w-5" /> : <Send className={big ? 'h-7 w-7' : 'h-5 w-5'} />}
            </button>
          </form>
        </div>
      ) : (
        readOnlyHint && <p className="border-t border-line bg-surface-sunken px-4 py-3 text-center text-sm text-ink-mute">{readOnlyHint}</p>
      )}
    </div>
  );
}
