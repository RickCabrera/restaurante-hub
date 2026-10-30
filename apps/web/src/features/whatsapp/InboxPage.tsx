import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  ArrowLeft, Bot, FlaskConical, Hand, Info, Lock, MessageCircle, Phone, Search, Send, ShoppingBag, UserRound, X,
} from 'lucide-react';
import { RT } from '@rh/shared';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/socket';
import { setBadge } from '@/app/badges';
import { fmtDateTime, timeAgo, fmtTime } from '@/lib/format';
import { sounds } from '@/lib/sound';
import { Avatar, Button, EmptyState, ErrorState, Skeleton, toast } from '@/ui';
import { WaThemeStyle } from './Bubble';
import { MessageBubble, dayLabel } from './msg';
import { STATE_LABEL, type WaConversation, type WaMessage, type WaStatus } from './types';

const fmtPhone = (p: string) => {
  const d = p.replace(/\D/g, '');
  const n = d.slice(-10);
  return n.length === 10 ? `+${d.slice(0, d.length - 10)} ${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}` : p;
};
const avatarColor = (s: string) => {
  const colors = ['#2A9D8F', '#E76F51', '#457B9D', '#8E7DBE', '#E9C46A', '#F4A261', '#06D6A0', '#EF476F'];
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
};

type ListResp = WaConversation[] | { items: WaConversation[] };
const asList = (r: ListResp | undefined): WaConversation[] => (Array.isArray(r) ? r : r?.items ?? []);

export function useWaStatus() {
  return useQuery({ queryKey: ['wa-status'], queryFn: () => api.get<WaStatus>('/whatsapp/status'), staleTime: 300_000, retry: false });
}

/** /admin/whatsapp y /admin/whatsapp/:id — bandeja con traspaso a humano (WAB-04). */
export function InboxPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [onlyHuman, setOnlyHuman] = useState(false);
  const status = useWaStatus();

  const listKey = ['wa-conversations'];
  const list = useQuery({
    queryKey: listKey,
    queryFn: () => api.get<ListResp>('/whatsapp/conversations', { limit: 200 }),
    select: asList,
    refetchInterval: 60_000,
  });
  const all = list.data ?? [];

  useEffect(() => {
    if (list.data) setBadge('whatsapp', all.reduce((s, c) => s + (c.unreadCount || 0), 0));
  }, [list.data, all]);

  useRealtime<{ conversation: WaConversation; message: WaMessage | null }>(RT.WA_CONVERSATION, ({ conversation, message }) => {
    if (!conversation) return;
    qc.setQueryData<ListResp>(listKey, (prev) => {
      const arr = asList(prev).filter((c) => c.id !== conversation.id);
      return [conversation, ...arr];
    });
    qc.setQueryData(['wa-conversation', conversation.id], conversation);
    if (message) {
      qc.setQueryData<WaMessage[]>(['wa-messages', conversation.id], (prev) => {
        if (!prev) return prev;
        const i = prev.findIndex((m) => m.id === message.id);
        if (i >= 0) {
          const copy = [...prev];
          copy[i] = message;
          return copy;
        }
        return [...prev, message];
      });
      if (message.direction === 'IN' && conversation.id !== id) sounds.message();
      if (message.direction === 'IN' && conversation.id === id) void api.post(`/whatsapp/conversations/${id}/read`).catch(() => undefined);
    }
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    return all
      .filter((c) => !onlyHuman || c.humanMode)
      .filter((c) => !t || c.displayName.toLowerCase().includes(t) || (digits.length >= 3 && c.phone.includes(digits)) || c.lastMessage?.body?.toLowerCase().includes(t))
      .sort((a, b) => Number(b.humanMode && b.unreadCount > 0) - Number(a.humanMode && a.unreadCount > 0) || (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
  }, [all, q, onlyHuman]);
  const humanCount = all.filter((c) => c.humanMode).length;
  const simulated = status.data?.mode === 'simulador';

  return (
    <div className="wa-theme -mx-3 -my-4 flex h-[calc(100dvh-56px-64px)] flex-col sm:-mx-6 lg:h-[calc(100dvh-56px)]">
      <WaThemeStyle />
      {status.data && (
        <div className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2 text-sm', simulated ? 'bg-info/10' : 'bg-ok/10', id && 'hidden lg:flex')}>
          {simulated ? (
            <>
              <FlaskConical className="h-4 w-4 text-info" />
              <span className="flex-1"><b>Modo simulador.</b> <span className="text-ink-soft">Aún no hay número de WhatsApp conectado; los mensajes no salen a internet. Prueba el bot en el simulador.</span></span>
              <Link to="/admin/whatsapp/simulador" className="font-semibold text-info">Abrir simulador →</Link>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-ok" />
              <span className="flex-1"><b>Conectado</b> <span className="text-ink-soft">· WhatsApp Business {status.data.phoneNumberId ? `(${status.data.phoneNumberId})` : ''}</span></span>
              <Link to="/admin/whatsapp/simulador" className="text-xs font-semibold text-ink-mute hover:text-ink">Simulador</Link>
            </>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Lista */}
        <aside className={clsx('flex w-full flex-col border-r border-line bg-surface-raised lg:w-[360px] lg:shrink-0', id && 'hidden lg:flex')}>
          <div className="space-y-2 border-b border-line p-3">
            <div className="flex items-center gap-2">
              <h1 className="h-display flex-1 text-xl font-bold">WhatsApp</h1>
            </div>
            <label className="flex items-center gap-2 rounded-xl bg-surface-sunken px-3">
              <Search className="h-4 w-4 text-ink-mute" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre o teléfono" className="h-10 flex-1 bg-transparent text-sm focus:outline-none" aria-label="Buscar conversación" />
              {q && <button onClick={() => setQ('')} aria-label="Limpiar"><X className="h-4 w-4 text-ink-mute" /></button>}
            </label>
            <div className="flex gap-1.5">
              <button onClick={() => setOnlyHuman(false)} className={clsx('chip h-7 px-3', !onlyHuman ? 'bg-ink text-surface' : 'bg-surface-sunken text-ink-soft')}>Todas</button>
              <button onClick={() => setOnlyHuman(true)} className={clsx('chip h-7 px-3', onlyHuman ? 'bg-warn text-white' : 'bg-surface-sunken text-ink-soft')}>
                <Hand className="h-3 w-3" /> Atención humana {humanCount > 0 && `(${humanCount})`}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scroll-thin">
            {list.isLoading ? (
              <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : list.error ? (
              <ErrorState error={list.error} onRetry={() => list.refetch()} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<MessageCircle className="h-7 w-7" />}
                title={all.length ? 'Sin resultados' : 'Sin conversaciones'}
                description={all.length ? 'Prueba con otro filtro.' : simulated ? 'Envía un mensaje desde el simulador para ver aquí la conversación.' : 'Cuando un cliente escriba a tu WhatsApp aparecerá aquí.'}
              />
            ) : (
              <ul>
                {filtered.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/admin/whatsapp/${c.id}`}
                      className={clsx('flex items-center gap-3 border-b border-line/60 px-3 py-3 transition hover:bg-surface-sunken/60', c.id === id && 'bg-surface-sunken')}
                    >
                      <Avatar name={c.displayName} color={avatarColor(c.phone)} size={46} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate font-semibold">{c.displayName}</p>
                          <span className={clsx('shrink-0 text-[11px]', c.unreadCount ? 'font-semibold text-[var(--wa-accent)]' : 'text-ink-mute')}>{c.lastMessageAt ? timeAgo(c.lastMessageAt) : ''}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm text-ink-mute">
                            {c.lastMessage?.direction === 'OUT' && <span className="text-ink-soft">Tú: </span>}
                            {c.lastMessage?.body ?? 'Sin mensajes'}
                          </p>
                          {c.humanMode && <span className="chip shrink-0 bg-warn/15 text-warn"><Hand className="h-3 w-3" /> Humano</span>}
                          {c.unreadCount > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--wa-accent)] px-1.5 text-[11px] font-bold text-white">{c.unreadCount}</span>}
                        </div>
                        {c.customer && c.customer.ordersCount > 0 && <p className="mt-0.5 text-[11px] text-ink-mute">{c.customer.ordersCount} {c.customer.ordersCount === 1 ? 'pedido' : 'pedidos'}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Conversación */}
        <section className={clsx('min-w-0 flex-1', !id && 'hidden lg:block')}>
          {id ? (
            <ConversationView key={id} id={id} simulated={simulated} onBack={() => nav('/admin/whatsapp')} />
          ) : (
            <div className="wa-wall grid h-full place-items-center p-8 text-center">
              <div className="max-w-sm rounded-3xl bg-surface-raised/90 p-8 shadow-card">
                <MessageCircle className="mx-auto h-10 w-10 text-[var(--wa-accent)]" />
                <p className="mt-3 font-semibold">Elige una conversación</p>
                <p className="mt-1 text-sm text-ink-mute">El bot atiende solo. Cuando un cliente pida “hablar con alguien” la verás marcada como <b>Atención humana</b>.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationView({ id, simulated, onBack }: { id: string; simulated: boolean; onBack: () => void }) {
  const qc = useQueryClient();
  const conv = useQuery({ queryKey: ['wa-conversation', id], queryFn: () => api.get<WaConversation>(`/whatsapp/conversations/${id}`) });
  const msgs = useQuery({ queryKey: ['wa-messages', id], queryFn: () => api.get<WaMessage[]>(`/whatsapp/conversations/${id}/messages`, { limit: 100 }) });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [panel, setPanel] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const c = conv.data;

  // marcar como leída al abrir
  useEffect(() => {
    api
      .post<WaConversation>(`/whatsapp/conversations/${id}/read`)
      .then(() => {
        qc.setQueryData<ListResp>(['wa-conversations'], (prev) => asList(prev).map((x) => (x.id === id ? { ...x, unreadCount: 0 } : x)));
      })
      .catch(() => undefined);
  }, [id, qc]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs.data?.length]);

  const canWrite = !!c && (c.windowOpen || simulated);

  const send = async () => {
    const t = text.trim();
    if (!t || !c) return;
    setSending(true);
    try {
      const m = await api.post<WaMessage>(`/whatsapp/conversations/${id}/reply`, { text: t });
      qc.setQueryData<WaMessage[]>(['wa-messages', id], (prev = []) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setText('');
    } catch (e) {
      toast.fromError(e, 'No se pudo enviar');
    } finally {
      setSending(false);
    }
  };

  const toggleHuman = async () => {
    if (!c) return;
    setToggling(true);
    try {
      const v = await api.post<WaConversation>(`/whatsapp/conversations/${id}/human`, { on: !c.humanMode });
      qc.setQueryData(['wa-conversation', id], v);
      qc.setQueryData<ListResp>(['wa-conversations'], (prev) => asList(prev).map((x) => (x.id === id ? v : x)));
      toast.success(v.humanMode ? 'Bot en pausa: tú atiendes esta conversación' : 'El bot vuelve a atender');
    } catch (e) {
      toast.fromError(e);
    } finally {
      setToggling(false);
    }
  };

  if (conv.error) return <ErrorState error={conv.error} onRetry={() => conv.refetch()} />;

  const list = msgs.data ?? [];
  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line bg-surface-raised px-2 py-2 sm:px-3">
          <button onClick={onBack} className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-sunken lg:hidden" aria-label="Regresar"><ArrowLeft className="h-5 w-5" /></button>
          {c ? (
            <button onClick={() => setPanel((v) => !v)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <Avatar name={c.displayName} color={avatarColor(c.phone)} size={40} />
              <div className="min-w-0">
                <p className="truncate font-semibold leading-tight">{c.displayName}</p>
                <p className="truncate text-xs text-ink-mute">
                  {fmtPhone(c.phone)} · {c.humanMode ? <span className="font-semibold text-warn">Atiendes tú</span> : <>Bot: {STATE_LABEL[c.state] ?? c.state}</>}
                </p>
              </div>
            </button>
          ) : (
            <Skeleton className="h-10 flex-1" />
          )}
          {c && (
            <Button
              size="sm"
              variant={c.humanMode ? 'outline' : 'primary'}
              loading={toggling}
              onClick={toggleHuman}
              icon={c.humanMode ? <Bot className="h-4 w-4" /> : <Hand className="h-4 w-4" />}
              className={clsx(!c.humanMode && '!bg-warn hover:!brightness-95')}
            >
              <span className="hidden sm:inline">{c.humanMode ? 'Regresar al bot' : 'Atender yo (pausar bot)'}</span>
              <span className="sm:hidden">{c.humanMode ? 'Al bot' : 'Atender'}</span>
            </Button>
          )}
          <button onClick={() => setPanel((v) => !v)} className="hidden h-10 w-10 place-items-center rounded-full hover:bg-surface-sunken xl:grid" aria-label="Datos del cliente"><Info className="h-5 w-5" /></button>
        </header>

        {c?.humanMode && (
          <div className="flex items-center gap-2 border-b border-warn/20 bg-warn/10 px-4 py-1.5 text-xs text-ink-soft">
            <Hand className="h-3.5 w-3.5 text-warn" /> El bot está en pausa{c.humanSince ? ` desde ${fmtTime(c.humanSince)}` : ''}. Responde tú; al terminar toca “Regresar al bot”.
          </div>
        )}

        <div className="wa-wall flex-1 overflow-y-auto px-3 py-4 sm:px-8 scroll-thin">
          {msgs.isLoading ? (
            <div className="space-y-3">{[60, 40, 70, 50].map((w, i) => <div key={i} className={clsx('flex', i % 2 ? 'justify-end' : '')}><Skeleton className="h-12" /></div>)}</div>
          ) : list.length === 0 ? (
            <p className="mx-auto mt-10 w-fit rounded-lg bg-surface-raised/90 px-3 py-1.5 text-xs text-ink-mute">Sin mensajes</p>
          ) : (
            <div className="mx-auto max-w-3xl space-y-1.5">
              {list.map((m, i) => {
                const newDay = i === 0 || new Date(list[i - 1].createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                return (
                  <Fragment key={m.id}>
                    {newDay && <p className="mx-auto my-3 w-fit rounded-lg bg-surface-raised/95 px-3 py-1 text-[11px] font-medium uppercase text-ink-mute shadow-sm">{dayLabel(m.createdAt)}</p>}
                    <MessageBubble m={m} />
                  </Fragment>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <footer className="border-t border-line bg-surface-raised px-2 py-2 sm:px-3">
          {c && !canWrite ? (
            <p className="flex items-start gap-2 px-2 py-2 text-sm text-ink-mute">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              Pasaron más de 24 h desde el último mensaje del cliente. WhatsApp solo permite responder con plantillas; espera a que el cliente vuelva a escribir.
            </p>
          ) : (
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder={c?.humanMode ? 'Escribe un mensaje' : 'Escribe para responder (el bot sigue activo)'}
                className="input max-h-32 min-h-[44px] flex-1 resize-none rounded-3xl py-2.5"
                aria-label="Mensaje"
                disabled={!c}
              />
              <button type="submit" disabled={!text.trim() || sending} aria-label="Enviar" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--wa-accent)] text-white disabled:opacity-40">
                <Send className="h-5 w-5" />
              </button>
            </form>
          )}
          {c && !c.humanMode && canWrite && <p className="px-3 pt-1 text-[11px] text-ink-mute">Tip: para que el bot no conteste mientras atiendes, toca “Atender yo”.</p>}
        </footer>
      </div>

      {c && panel && (
        <aside className="fixed inset-0 z-40 flex justify-end bg-black/30 xl:static xl:z-auto xl:block xl:bg-transparent" onClick={() => setPanel(false)}>
          <div className="h-full w-80 max-w-[85vw] overflow-y-auto border-l border-line bg-surface-raised p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end xl:hidden"><button onClick={() => setPanel(false)} aria-label="Cerrar"><X className="h-5 w-5" /></button></div>
            <div className="text-center">
              <Avatar name={c.displayName} color={avatarColor(c.phone)} size={72} className="mx-auto" />
              <p className="mt-3 text-lg font-bold">{c.customer?.name ?? c.profileName ?? 'Sin nombre'}</p>
              <p className="text-sm text-ink-mute">{fmtPhone(c.phone)}</p>
              {c.profileName && c.customer?.name && c.profileName !== c.customer.name && <p className="text-xs text-ink-mute">WhatsApp: {c.profileName}</p>}
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink-mute">Pedidos</dt><dd className="font-semibold">{c.customer?.ordersCount ?? 0}</dd></div>
              {c.customer?.lastOrderAt && <div className="flex justify-between"><dt className="text-ink-mute">Último pedido</dt><dd>{fmtDateTime(c.customer.lastOrderAt)}</dd></div>}
              <div className="flex justify-between"><dt className="text-ink-mute">Estado del bot</dt><dd>{STATE_LABEL[c.state] ?? c.state}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-mute">Ventana 24 h</dt><dd className={c.windowOpen ? 'text-ok' : 'text-ink-mute'}>{c.windowOpen ? `abierta hasta ${fmtTime(c.windowExpiresAt)}` : 'cerrada'}</dd></div>
            </dl>
            <div className="mt-5 grid gap-2">
              {c.customerId && (
                <Link to={`/admin/clientes/${c.customerId}`} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold hover:bg-surface-sunken">
                  <UserRound className="h-4 w-4" /> Ver cliente
                </Link>
              )}
              <Link to="/admin/pedidos" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold hover:bg-surface-sunken">
                <ShoppingBag className="h-4 w-4" /> Pedidos
              </Link>
              <a href={`tel:+${c.phone.replace(/\D/g, '')}`} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold hover:bg-surface-sunken">
                <Phone className="h-4 w-4" /> Llamar
              </a>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
