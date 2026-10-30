import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ChevronDown, MapPin, MessageCircle, Phone, RotateCcw, Wifi, WifiOff } from 'lucide-react';
import type { OrderStatus } from '@rh/shared';
import { api } from '@/lib/api';
import { emitAck, getSocket, useRealtime, useSocketStatus } from '@/lib/socket';
import { applyBrand } from '@/lib/theme';
import { fmtTime, money } from '@/lib/format';
import { sounds, vibrate } from '@/lib/sound';
import { setSeo, telHref, useSlug, waHref, fmtPhone } from './lib';
import { Monogram } from './ui';
import { PublicError } from './states';
import type { TrackingView } from './types';

const STATUS_UI: Record<OrderStatus, { emoji: string; title: (t: TrackingView) => string; text: (t: TrackingView) => string; tone: 'brand' | 'ok' | 'danger' }> = {
  NUEVO: { emoji: '📨', title: () => '¡Recibimos tu pedido!', text: () => 'El restaurante lo está revisando. Te confirmamos en unos minutos.', tone: 'brand' },
  ACEPTADO: { emoji: '👍', title: () => 'Pedido confirmado', text: (t) => `Ya está en la fila de la cocina.${t.estimatedMinutes ? ` Tiempo estimado: ${t.estimatedMinutes} min.` : ''}`, tone: 'brand' },
  EN_PREPARACION: { emoji: '👩‍🍳', title: () => 'Preparando tu pedido', text: () => 'La cocina ya está manos a la obra.', tone: 'brand' },
  LISTO: {
    emoji: '🛍️',
    title: (t) => (t.type === 'PASAR_A_RECOGER' ? '¡Listo para recoger!' : 'Tu pedido está listo'),
    text: (t) => (t.type === 'PASAR_A_RECOGER' ? `Pasa por él a ${t.branch?.name ?? t.business.name}.` : 'En un momento sale el repartidor.'),
    tone: 'ok',
  },
  EN_CAMINO: { emoji: '🛵', title: () => '¡Va en camino!', text: (t) => `${t.driverName ? `${t.driverName.split(' ')[0]} lleva` : 'Nuestro repartidor lleva'} tu pedido.`, tone: 'brand' },
  ENTREGADO: { emoji: '🎉', title: () => '¡Entregado!', text: () => 'Gracias por tu pedido. ¡Buen provecho!', tone: 'ok' },
  RECOGIDO: { emoji: '🎉', title: () => '¡Pedido recogido!', text: () => 'Gracias por tu pedido. ¡Buen provecho!', tone: 'ok' },
  RECHAZADO: { emoji: '😔', title: () => 'No pudimos tomar tu pedido', text: (t) => t.rejectReason ?? 'El restaurante no pudo atenderlo.', tone: 'danger' },
  CANCELADO: { emoji: '🚫', title: () => 'Pedido cancelado', text: (t) => t.cancelReason ?? 'El pedido fue cancelado.', tone: 'danger' },
};

function useCountdown(target: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return null;
  return Math.round((new Date(target).getTime() - now) / 60000);
}

/** /pedido/:token — seguimiento en tiempo real (WEB-03). */
export function TrackingPage() {
  const { token = '' } = useParams();
  const slug = useSlug();
  const qc = useQueryClient();
  const location = useLocation();
  const justPlaced = !!(location.state as { justPlaced?: boolean } | null)?.justPlaced;
  const key = ['public-tracking', slug, token];
  const connected = useSocketStatus();

  const q = useQuery({
    queryKey: key,
    queryFn: () => api.get<TrackingView>(`/public/${encodeURIComponent(slug)}/orders/${encodeURIComponent(token)}`, undefined, { anonymous: true }),
    // Respaldo: sondeo cada 20 s mientras el pedido esté activo
    refetchInterval: (query) => (query.state.data?.active === false ? false : 20_000),
    retry: 1,
  });
  const t = q.data;

  // Tiempo real: unirse a la sala del pedido (socket anónimo o con sesión)
  useEffect(() => {
    if (!token) return;
    const s = getSocket();
    const watch = () =>
      emitAck<TrackingView>('order.watch', { publicToken: token })
        .then((v) => v && qc.setQueryData(key, v))
        .catch(() => undefined);
    void watch();
    s.on('connect', watch);
    return () => {
      s.off('connect', watch);
      s.emit('order.unwatch', { publicToken: token });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useRealtime<TrackingView>('order.updated', (v) => {
    // las salas de gerentes reciben OrderView (sin timeline): solo aceptamos TrackingView
    if (!v || v.publicToken !== token || !Array.isArray(v.timeline)) return;
    const prev = qc.getQueryData<TrackingView>(key);
    qc.setQueryData(key, v);
    if (prev && prev.status !== v.status) {
      sounds.success();
      vibrate([60, 40, 60]);
    }
  });

  useEffect(() => {
    if (!t) return;
    applyBrand(t.business.primaryColor);
    setSeo({ title: `Pedido ${t.folio} · ${t.statusLabel} · ${t.business.name}`, description: `Sigue tu pedido de ${t.business.name} en tiempo real.`, image: t.business.logoUrl });
  }, [t]);

  const mins = useCountdown(t?.active ? t.etaAt : null);
  const [itemsOpen, setItemsOpen] = useState(false);

  if (q.isLoading)
    return (
      <div className="grid min-h-full place-items-center bg-surface">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-brand/30" />
          <p className="mt-3 text-sm text-ink-mute">Buscando tu pedido…</p>
        </div>
      </div>
    );
  if (q.error || !t) return <PublicError error={q.error} onRetry={() => q.refetch()} />;

  const ui = STATUS_UI[t.status];
  const phone = t.branch?.phone || t.business.phone;
  const orderAgain = `/pedir${t.business.slug && t.business.slug !== 'demo' ? `?n=${encodeURIComponent(t.business.slug)}` : ''}`;
  const toneBg = ui.tone === 'danger' ? 'bg-danger' : ui.tone === 'ok' ? 'bg-ok' : 'bg-brand';

  return (
    <div className="min-h-full bg-surface pb-12">
      <header className={clsx('relative overflow-hidden px-4 pb-20 pt-5 text-white transition-colors duration-700', toneBg)}>
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'radial-gradient(rgb(255 255 255) 1.2px, transparent 1.2px)', backgroundSize: '18px 18px' }} />
        <div className="relative mx-auto flex max-w-xl items-center gap-3">
          <Monogram name={t.business.name} logoUrl={t.business.logoUrl} size={40} className="!rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{t.business.name}</p>
            <p className="text-xs text-white/80">Pedido {t.folio} · {t.typeLabel}</p>
          </div>
          <span className={clsx('flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium', connected ? 'bg-white/20' : 'bg-black/25')} title={connected ? 'Actualización en vivo' : 'Reconectando…'}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />} {connected ? 'En vivo' : 'Reconectando'}
          </span>
        </div>
        <div className="relative mx-auto mt-6 max-w-xl text-center" aria-live="polite">
          <div key={t.status} className="mx-auto grid h-24 w-24 animate-pop place-items-center rounded-full bg-white/20 text-[56px] shadow-lift ring-8 ring-white/10">
            <span className={clsx(t.status === 'EN_CAMINO' && 'animate-[bounce_1.6s_ease-in-out_infinite]')}>{ui.emoji}</span>
          </div>
          <h1 className="h-display mt-4 text-3xl font-extrabold leading-tight">{ui.title(t)}</h1>
          <p className="mx-auto mt-1 max-w-sm text-white/90">{ui.text(t)}</p>
          {justPlaced && t.status === 'NUEVO' && <p className="mt-2 text-sm font-medium text-white/90">Guarda esta página para seguir tu pedido.</p>}
        </div>
      </header>

      <main className="relative mx-auto -mt-12 max-w-xl space-y-4 px-4">
        {t.active && (
          <div className="card flex items-center justify-between gap-3 p-4 shadow-lift">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-mute">{t.type === 'DOMICILIO' ? 'Llega aprox.' : 'Listo aprox.'}</p>
              <p className="h-display text-3xl font-extrabold tabular-nums">
                {t.etaAt ? fmtTime(t.etaAt) : '—'}
              </p>
            </div>
            <div className="text-right">
              {mins != null && (
                <p className={clsx('text-lg font-bold tabular-nums', mins < 0 ? 'text-warn' : 'text-brand')}>
                  {mins > 0 ? `en ${mins} min` : mins === 0 ? 'en un momento' : 'unos minutos más'}
                </p>
              )}
              {t.status === 'NUEVO' && <p className="text-xs text-ink-mute">Esperando confirmación</p>}
              {t.driverName && t.status === 'EN_CAMINO' && <p className="text-sm text-ink-soft">🛵 {t.driverName.split(' ')[0]}</p>}
            </div>
          </div>
        )}

        <section className="card p-5" aria-label="Progreso del pedido">
          <ol className="relative">
            {t.timeline.map((s, i) => {
              const last = i === t.timeline.length - 1;
              const bad = s.status === 'RECHAZADO' || s.status === 'CANCELADO';
              return (
                <li key={s.status} className="relative flex gap-4 pb-5 last:pb-0">
                  {!last && <span className={clsx('absolute left-[13px] top-7 h-[calc(100%-20px)] w-0.5', s.done && t.timeline[i + 1]?.done ? 'bg-brand' : 'bg-line')} />}
                  <span
                    className={clsx(
                      'relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition',
                      bad ? 'bg-danger text-white' : s.current ? 'bg-brand text-white ring-4 ring-brand/20' : s.done ? 'bg-brand text-white' : 'border-2 border-line bg-surface-raised text-ink-mute',
                    )}
                  >
                    {s.done && (!s.current || !t.active) && !bad ? <Check className="h-4 w-4" strokeWidth={3} /> : bad ? '✕' : s.current && t.active ? <span className="h-2.5 w-2.5 animate-ping rounded-full bg-white" /> : i + 1}
                  </span>
                  <div className="flex flex-1 items-baseline justify-between gap-2 pt-0.5">
                    <span className={clsx('text-[15px]', s.current ? 'font-bold' : s.done ? 'font-medium' : 'text-ink-mute')}>{s.label}</span>
                    {s.at && <span className="text-xs tabular-nums text-ink-mute">{fmtTime(s.at)}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="card overflow-hidden">
          <button onClick={() => setItemsOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 p-4 text-left" aria-expanded={itemsOpen}>
            <div>
              <p className="font-semibold">Resumen · {t.items.reduce((s, i) => s + i.quantity, 0)} productos</p>
              <p className="text-sm text-ink-mute">{t.paymentLabel}{t.paid ? ' · pagado' : ''}</p>
            </div>
            <span className="flex items-center gap-2 text-lg font-bold tabular-nums">
              {money(t.totalCents)}
              <ChevronDown className={clsx('h-5 w-5 text-ink-mute transition', itemsOpen && 'rotate-180')} />
            </span>
          </button>
          {itemsOpen && (
            <div className="border-t border-line px-4 pb-4 pt-3 text-sm">
              <ul className="space-y-2">
                {t.items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>
                      <b className="tabular-nums">{it.quantity}×</b> {it.name}
                      {it.modifiers.length > 0 && <span className="block text-xs text-ink-mute">{it.modifiers.join(' · ')}</span>}
                      {it.note && <span className="block text-xs italic text-ink-mute">“{it.note}”</span>}
                    </span>
                    <span className="tabular-nums">{money(it.totalCents)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-1 border-t border-line pt-3 text-ink-soft">
                <Row label="Subtotal" v={t.subtotalCents} />
                {t.discountCents > 0 && <Row label="Descuentos" v={-t.discountCents} className="text-ok" />}
                {t.type === 'DOMICILIO' && <Row label="Envío" v={t.deliveryFeeCents} />}
                <Row label="Total" v={t.totalCents} className="pt-1 text-base font-bold text-ink" />
              </div>
            </div>
          )}
        </section>

        {t.branch && t.type === 'PASAR_A_RECOGER' && (
          <section className="card flex items-start gap-3 p-4 text-sm">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div>
              <p className="font-semibold">{t.branch.name}</p>
              <p className="text-ink-soft">{t.branch.address}</p>
            </div>
          </section>
        )}

        {phone && (
          <div className="grid grid-cols-2 gap-3">
            <a href={telHref(phone)} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface-raised font-semibold">
              <Phone className="h-4 w-4" /> Llamar
            </a>
            <a href={waHref(phone, `Hola, sobre mi pedido ${t.folio}`)} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#25D366] font-semibold text-white">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </div>
        )}
        {phone && <p className="text-center text-xs text-ink-mute">¿Dudas? Llámanos al {fmtPhone(phone)}</p>}

        <Link to={orderAgain} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink font-semibold text-surface">
          <RotateCcw className="h-4 w-4" /> Hacer otro pedido
        </Link>
      </main>
    </div>
  );
}

function Row({ label, v, className }: { label: string; v: number; className?: string }) {
  return (
    <div className={clsx('flex justify-between', className)}>
      <span>{label}</span>
      <span className="tabular-nums">{v < 0 ? `−${money(-v)}` : money(v)}</span>
    </div>
  );
}

