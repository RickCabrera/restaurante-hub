import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeft, ArrowRightLeft, Ban, Check, ChefHat, Combine, Gift, HandCoins, Lock, Minus, MoreHorizontal, Percent, Plus, Printer,
  Receipt, Split, Users, UtensilsCrossed,
} from 'lucide-react';
import { api } from '@/lib/api';
import { money, minutesSince } from '@/lib/format';
import { sounds } from '@/lib/sound';
import { Badge, Button, EmptyState, ErrorState, Modal, PageLoader, confirm, toast } from '@/ui';
import { TICKET_STATUS_LABEL, lineModsText, usePosRole, useSetTicket, useTicket, type PosProduct, type Ticket, type TicketLine } from './api';
import { MenuPanel } from './components/MenuPanel';
import { ProductModal, type CartLine } from './components/ProductModal';
import { PayModal } from './components/PayModal';
import { DiscountModal, LineSheet, MergeModal, MoveModal, SplitModal, TipModal } from './components/TicketActions';

type Dialog = null | 'pay' | 'discount' | 'tip' | 'split' | 'merge' | 'move' | 'more';

export function TicketPage() {
  const { id } = useParams();
  const q = useTicket(id);
  const navigate = useNavigate();
  const setTicket = useSetTicket();
  const { canCash } = usePosRole();
  const [product, setProduct] = useState<PosProduct | null>(null);
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [line, setLine] = useState<TicketLine | null>(null);
  const [discLine, setDiscLine] = useState<TicketLine | null>(null);
  const [preset, setPreset] = useState<number | undefined>();
  const [pane, setPane] = useState<'menu' | 'ticket'>('menu');

  if (q.isLoading) return <PageLoader label="Abriendo cuenta…" />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error('Cuenta no encontrada')} onRetry={() => q.refetch()} />;
  const t = q.data;
  const closed = t.status === 'PAGADA' || t.status === 'CANCELADA';
  const items = t.items ?? [];
  const active = items.filter((l) => !l.cancelledAt);
  const unsent = active.filter((l) => !l.sentAt);

  const addLines = async (lines: CartLine[]) => {
    setAdding(true);
    try {
      const r = await api.post<Ticket>(`/pos/tickets/${t.id}/lines`, { lines });
      setTicket(r);
      sounds.tap();
      setProduct(null);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setAdding(false);
    }
  };
  const pick = (p: PosProduct) => {
    if (p.modifierGroups.length) setProduct(p);
    else void addLines([{ productId: p.id, quantity: 1, modifiers: [] }]);
  };

  const send = async () => {
    setSending(true);
    try {
      const r = await api.post<Ticket & { sentCount: number; isAddition: boolean; printJobs: number }>(`/pos/tickets/${t.id}/send`);
      setTicket(r);
      sounds.success();
      toast.success(r.isAddition ? `Agregado enviado a cocina (${r.sentCount})` : `Enviado a cocina (${r.sentCount})`, r.printJobs ? `${r.printJobs} comanda(s) impresa(s)` : undefined);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSending(false);
    }
  };

  const action = async (fn: () => Promise<unknown>, ok?: string) => {
    setDialog(null);
    try {
      const r = (await fn()) as Ticket & { printJobs?: number };
      if (r && (r as Ticket).id) setTicket(r);
      if (ok) toast.success(ok, r?.printJobs !== undefined ? (r.printJobs ? 'Enviado a la impresora' : 'No hay impresora de cuentas configurada') : undefined);
    } catch (e) {
      toast.fromError(e);
    }
  };

  const requestBill = () => action(() => api.post(`/pos/tickets/${t.id}/request-bill`), 'Cuenta pedida');
  const print = () => action(() => api.post(`/pos/tickets/${t.id}/print`, { kind: 'bill' }), 'Imprimiendo cuenta');
  const cancelTicket = async () => {
    setDialog(null);
    const reason = await confirm({ title: `Cancelar cuenta ${t.folio}`, description: 'La mesa quedará libre. Esta acción no se puede deshacer.', danger: true, confirmText: 'Cancelar cuenta', cancelText: 'Volver', input: { label: 'Motivo', required: true } });
    if (!reason) return;
    try {
      const r = await api.post<Ticket>(`/pos/tickets/${t.id}/cancel`, { reason });
      setTicket(r);
      toast.success('Cuenta cancelada');
      navigate('/pos');
    } catch (e) {
      toast.fromError(e);
    }
  };
  const setGuests = async (g: number) => {
    if (g < 1 || closed) return;
    try {
      setTicket(await api.patch<Ticket>(`/pos/tickets/${t.id}`, { guests: g }));
    } catch (e) {
      toast.fromError(e);
    }
  };

  const more: { label: string; icon: typeof Receipt; onClick: () => void; locked?: boolean; danger?: boolean }[] = [
    { label: 'Pedir cuenta', icon: Receipt, onClick: requestBill },
    { label: 'Descuento', icon: Percent, onClick: () => setDialog('discount'), locked: !canCash },
    { label: 'Propina', icon: HandCoins, onClick: () => setDialog('tip') },
    { label: 'Dividir', icon: Split, onClick: () => setDialog('split') },
    { label: 'Juntar', icon: Combine, onClick: () => setDialog('merge') },
    { label: 'Cambiar de mesa', icon: ArrowRightLeft, onClick: () => setDialog('move') },
    { label: 'Imprimir', icon: Printer, onClick: print },
    { label: 'Cancelar cuenta', icon: Ban, onClick: cancelTicket, locked: !canCash, danger: true },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* Menú */}
      <section className={clsx('min-h-0 flex-1 border-line md:border-r', pane === 'ticket' && 'hidden md:block')}>
        {closed ? (
          <EmptyState className="h-full" icon={<Lock className="h-7 w-7" />} title={`Cuenta ${TICKET_STATUS_LABEL[t.status].toLowerCase()}`} description="Ya no se pueden agregar productos." action={<Button onClick={() => navigate('/pos')}>Ir a mesas</Button>} />
        ) : (
          <MenuPanel onPick={pick} disabled={adding} />
        )}
      </section>

      {/* Cuenta */}
      <aside className={clsx('flex min-h-0 w-full flex-col bg-surface-raised md:w-[380px] lg:w-[420px]', pane === 'menu' && 'hidden md:flex')}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <button onClick={() => navigate('/pos')} aria-label="Volver a mesas" className="grid h-12 w-12 place-items-center rounded-xl hover:bg-surface-sunken">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="h-display truncate text-xl font-bold leading-tight">{t.tableLabel}</p>
            <p className="truncate text-xs text-ink-mute">
              {t.folio} · {t.waiterName ?? 'Sin mesero'} · {minutesSince(t.openedAt)} min
            </p>
          </div>
          <Badge tone={t.status === 'POR_COBRAR' ? 'warn' : t.status === 'ABIERTA' ? 'brand' : t.status === 'PAGADA' ? 'ok' : 'danger'}>{TICKET_STATUS_LABEL[t.status]}</Badge>
        </div>
        {t.serviceType === 'MESA' && !closed && (
          <div className="flex items-center gap-2 border-b border-line px-4 py-1.5 text-sm text-ink-soft">
            <Users className="h-4 w-4" /> Personas
            <button aria-label="Menos personas" onClick={() => setGuests(t.guests - 1)} className="ml-auto grid h-9 w-9 place-items-center rounded-lg bg-surface-sunken"><Minus className="h-4 w-4" /></button>
            <span className="w-6 text-center font-bold">{t.guests}</span>
            <button aria-label="Más personas" onClick={() => setGuests(t.guests + 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-surface-sunken"><Plus className="h-4 w-4" /></button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          {items.length === 0 ? (
            <EmptyState icon={<UtensilsCrossed className="h-7 w-7" />} title="Cuenta vacía" description="Toca un producto del menú para agregarlo." />
          ) : (
            <ul className="divide-y divide-line">
              {items.map((l) => (
                <LineRow key={l.id} line={l} disabled={closed} onClick={() => setLine(l)} />
              ))}
            </ul>
          )}
        </div>

        <Totals t={t} />

        {!closed && (
          <div className="space-y-2 border-t border-line p-3 safe-bottom">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Button size="xl" className="!px-3" icon={<ChefHat className="h-6 w-6" />} disabled={!unsent.length} loading={sending} onClick={send}>
                Enviar{unsent.length ? ` (${unsent.length})` : ''}
              </Button>
              <Button
                size="xl"
                variant="success"
                className="!px-3"
                icon={canCash ? undefined : <Lock className="h-5 w-5" />}
                disabled={!canCash || !active.length || t.remainingCents <= 0}
                onClick={() => { setPreset(undefined); setDialog('pay'); }}
              >
                Cobrar
              </Button>
              <Button size="xl" variant="secondary" className="!px-4" aria-label="Más acciones" onClick={() => setDialog('more')}>
                <MoreHorizontal className="h-6 w-6" />
              </Button>
            </div>
            <div className="hidden grid-cols-4 gap-1.5 lg:grid">
              {more.slice(0, 4).map((m) => (
                <QuickAction key={m.label} {...m} />
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Cambiar panel en pantallas angostas */}
      <div className="flex shrink-0 border-t border-line bg-surface-raised md:hidden">
        {(['menu', 'ticket'] as const).map((p) => (
          <button key={p} onClick={() => setPane(p)} className={clsx('h-14 flex-1 font-semibold', pane === p ? 'text-brand' : 'text-ink-mute')}>
            {p === 'menu' ? 'Menú' : `Cuenta · ${money(t.totalCents)}`}
          </button>
        ))}
      </div>

      <ProductModal product={product} busy={adding} onClose={() => setProduct(null)} onAdd={(l) => addLines([l])} />
      <LineSheet ticket={t} line={line} canCash={canCash} onClose={() => setLine(null)} onDiscount={(l) => setDiscLine(l)} />
      <PayModal ticket={t} open={dialog === 'pay'} presetCents={preset} onClose={() => setDialog(null)} />
      <DiscountModal ticket={t} open={dialog === 'discount' || !!discLine} line={discLine} onClose={() => { setDialog(null); setDiscLine(null); }} />
      <TipModal ticket={t} open={dialog === 'tip'} onClose={() => setDialog(null)} />
      <SplitModal ticket={t} open={dialog === 'split'} onClose={() => setDialog(null)} onPayPart={(c) => { setPreset(c); setDialog('pay'); }} />
      <MergeModal ticket={t} open={dialog === 'merge'} onClose={() => setDialog(null)} />
      <MoveModal ticket={t} open={dialog === 'move'} onClose={() => setDialog(null)} />
      <Modal open={dialog === 'more'} onClose={() => setDialog(null)} title="Acciones de la cuenta" size="md">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {more.map((m) => (
            <QuickAction key={m.label} {...m} big />
          ))}
        </div>
      </Modal>
    </div>
  );
}

function QuickAction({ label, icon: Icon, onClick, locked, danger, big }: { label: string; icon: typeof Receipt; onClick: () => void; locked?: boolean; danger?: boolean; big?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={clsx(
        'relative flex flex-col items-center justify-center gap-1 rounded-xl bg-surface-sunken font-semibold transition active:scale-95 disabled:opacity-45',
        big ? 'h-20 text-sm' : 'h-14 text-[11px]',
        danger && 'text-danger',
      )}
    >
      <Icon className={big ? 'h-6 w-6' : 'h-5 w-5'} />
      {label}
      {locked && <Lock className="absolute right-1.5 top-1.5 h-3 w-3 text-ink-mute" />}
    </button>
  );
}

function LineRow({ line: l, onClick, disabled }: { line: TicketLine; onClick: () => void; disabled?: boolean }) {
  const cancelled = !!l.cancelledAt;
  const sent = !!l.sentAt;
  const mods = lineModsText(l);
  return (
    <li>
      <button disabled={disabled || cancelled} onClick={onClick} className={clsx('flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-sunken', cancelled && 'opacity-50')}>
        <span className={clsx('h-display grid h-9 min-w-[36px] place-items-center rounded-lg text-lg font-bold', sent ? 'bg-surface-sunken' : 'bg-brand/15 text-brand')}>{l.quantity}</span>
        <span className="min-w-0 flex-1">
          <span className={clsx('block font-semibold leading-tight', cancelled && 'line-through')}>{l.productName}</span>
          {mods && <span className="block text-xs text-ink-mute">{mods}</span>}
          {l.note && <span className="block text-xs font-medium text-warn">“{l.note}”</span>}
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {cancelled ? (
              <Badge tone="danger">Cancelado{l.cancelReason ? ` · ${l.cancelReason}` : ''}</Badge>
            ) : sent ? (
              <Badge tone="ok"><Check className="h-3 w-3" /> {l.kdsDoneAt ? 'Listo' : 'Enviado'}</Badge>
            ) : (
              <Badge tone="brand">Por enviar</Badge>
            )}
            {l.isCourtesy && <Badge tone="info"><Gift className="h-3 w-3" /> Cortesía</Badge>}
            {!l.isCourtesy && l.discountCents > 0 && <Badge tone="info">−{money(l.discountCents)}</Badge>}
          </span>
        </span>
        <span className={clsx('h-display font-bold tabular-nums', cancelled && 'line-through')}>{money(l.totalCents)}</span>
      </button>
    </li>
  );
}

function Totals({ t }: { t: Ticket }) {
  const row = (label: string, v: string, cls?: string) => (
    <div className={clsx('flex justify-between text-sm', cls)}>
      <span>{label}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
  return (
    <div className="space-y-0.5 border-t border-line bg-surface-sunken/50 px-4 py-3">
      {row('Subtotal', money(t.subtotalCents), 'text-ink-soft')}
      {t.discountCents > 0 && row(`Descuento${t.discountType === 'PERCENT' && t.discountValue ? ` ${t.discountValue}%` : ''}`, `−${money(t.discountCents)}`, 'text-info')}
      {t.tipCents > 0 && row(`Propina${t.tipPercent ? ` ${t.tipPercent}%` : ''}`, money(t.tipCents), 'text-ink-soft')}
      <div className="flex items-end justify-between pt-1">
        <span className="text-base font-semibold">Total</span>
        <span className="h-display text-3xl font-bold tabular-nums">{money(t.totalCents)}</span>
      </div>
      {t.paidCents > 0 && (
        <>
          {row('Pagado', money(t.paidCents), 'text-ok')}
          {row('Restante', money(t.remainingCents), 'font-bold text-warn')}
        </>
      )}
    </div>
  );
}
