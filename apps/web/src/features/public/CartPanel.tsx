import { useState } from 'react';
import clsx from 'clsx';
import { AlertCircle, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import { money } from '@/lib/format';
import { Spinner } from '@/ui';
import { useCart } from './cart';
import { lineTotal } from './lib';
import { FoodImage, QtyStepper } from './ui';
import type { Quote } from './types';

/** Desglose de la cotización (subtotal, promos, cupón, envío, total) */
export function QuoteSummary({ quote, loading, compact, isDelivery }: { quote?: Quote; loading?: boolean; compact?: boolean; isDelivery: boolean }) {
  const lines = useCart((s) => s.lines);
  const localSubtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const q = quote;
  const row = 'flex items-center justify-between gap-3';
  return (
    <div className={clsx('space-y-1.5 text-sm', compact && 'text-[13px]')}>
      <div className={row}>
        <span className="text-ink-soft">Subtotal</span>
        <span className="tabular-nums">{money(q?.subtotalCents ?? localSubtotal)}</span>
      </div>
      {q?.appliedPromotions.map((p) => (
        <div key={p.id} className={clsx(row, 'text-ok')}>
          <span className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> {p.name}</span>
          <span className="tabular-nums">−{money(p.discountCents)}</span>
        </div>
      ))}
      {q?.coupon && q.coupon.discountCents > 0 && (
        <div className={clsx(row, 'text-ok')}>
          <span className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Cupón {q.coupon.code}</span>
          <span className="tabular-nums">−{money(q.coupon.discountCents)}</span>
        </div>
      )}
      {isDelivery && (
        <div className={row}>
          <span className="text-ink-soft">Envío{q?.zone ? ` · ${q.zone.name}` : ''}</span>
          <span className="tabular-nums">
            {!q || (!q.zone && q.deliveryFeeCents === 0) ? <span className="text-ink-mute">Según tu dirección</span> : q.deliveryFeeCents === 0 ? <span className="font-medium text-ok">Gratis</span> : money(q.deliveryFeeCents)}
          </span>
        </div>
      )}
      <div className={clsx(row, 'border-t border-line pt-2 text-base font-bold')}>
        <span className="flex items-center gap-2">Total {loading && <Spinner className="h-3.5 w-3.5 text-ink-mute" />}</span>
        <span className="tabular-nums">{money(q?.totalCents ?? localSubtotal)}</span>
      </div>
    </div>
  );
}

/** Errores y avisos de la cotización, con textos amables. */
export function QuoteAlerts({ quote, ignore = [] }: { quote?: Quote; ignore?: string[] }) {
  if (!quote) return null;
  const errs = quote.errors.filter((e) => !ignore.includes(e.code));
  if (!errs.length && !quote.warnings.length) return null;
  return (
    <div className="space-y-2">
      {errs.map((e, i) => (
        <div key={`${e.code}-${i}`} className="flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{e.message}</span>
        </div>
      ))}
      {quote.warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{w}</span>
        </div>
      ))}
    </div>
  );
}

export function CouponField({ quote }: { quote?: Quote }) {
  const { couponCode, setCoupon } = useCart();
  const [open, setOpen] = useState(!!couponCode);
  const [draft, setDraft] = useState(couponCode);
  const invalid = quote?.errors.find((e) => e.code === 'COUPON_INVALID' || e.code.startsWith('COUPON'));
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-sm font-semibold text-brand">
        <Tag className="h-4 w-4" /> ¿Tienes un cupón?
      </button>
    );
  const applied = !!couponCode && quote?.coupon?.code?.toUpperCase() === couponCode.toUpperCase();
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setCoupon(draft.trim().toUpperCase());
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          placeholder="CÓDIGO"
          aria-label="Código de cupón"
          className="input h-10 flex-1 font-mono uppercase tracking-wider"
          maxLength={30}
        />
        {couponCode ? (
          <button
            type="button"
            onClick={() => {
              setCoupon('');
              setDraft('');
            }}
            className="h-10 rounded-xl bg-surface-sunken px-3 text-sm font-medium"
          >
            Quitar
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()} className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-surface disabled:opacity-40">
            Aplicar
          </button>
        )}
      </form>
      {applied && <p className="mt-1 text-xs font-medium text-ok">Cupón aplicado{quote?.coupon?.freeDelivery ? ' · envío gratis' : ''}</p>}
      {couponCode && invalid && <p className="mt-1 text-xs text-danger">{invalid.message}</p>}
    </div>
  );
}

/** Lista editable de líneas del carrito + cupón + desglose. */
export function CartPanel({
  quote,
  quoteLoading,
  onCheckout,
  checkoutDisabledReason,
  categoryOf,
  className,
}: {
  quote?: Quote;
  quoteLoading?: boolean;
  onCheckout: () => void;
  checkoutDisabledReason?: string | null;
  categoryOf: (productId: string) => string;
  className?: string;
}) {
  const { lines, setQty, remove, clear, type } = useCart();
  const isDelivery = type === 'DOMICILIO';
  if (!lines.length)
    return (
      <div className={clsx('flex flex-col items-center px-6 py-12 text-center', className)}>
        <div className="grid h-16 w-16 place-items-center rounded-full bg-brand/10 text-brand"><ShoppingBag className="h-7 w-7" /></div>
        <p className="mt-3 font-semibold">Tu pedido está vacío</p>
        <p className="mt-1 text-sm text-ink-mute">Agrega platillos del menú para empezar.</p>
      </div>
    );
  // Errores de líneas por índice (producto agotado, etc.)
  const lineErr = (i: number) => quote?.errors.find((e) => e.lineIndex === i);
  // En el carrito todavía no hay dirección: esos errores se resuelven en el checkout.
  const ignore = ['ADDRESS_REQUIRED', 'ADDRESS_NOT_FOUND', 'OUT_OF_ZONE', 'COUPON_INVALID'];
  return (
    <div className={clsx('flex flex-col', className)}>
      <ul className="divide-y divide-line">
        {lines.map((l, i) => {
          const err = lineErr(i);
          return (
            <li key={l.key} className="flex gap-3 py-3">
              <FoodImage src={l.imageUrl} category={categoryOf(l.productId)} name={l.name} className="h-14 w-14 shrink-0" rounded="rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-tight">{l.name}</p>
                  <button onClick={() => remove(l.key)} aria-label={`Quitar ${l.name}`} className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-mute hover:bg-surface-sunken hover:text-danger">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {l.modifiers.length > 0 && <p className="mt-0.5 text-xs leading-snug text-ink-mute">{l.modifiers.map((m) => m.name).join(' · ')}</p>}
                {l.note && <p className="mt-0.5 text-xs italic text-ink-mute">“{l.note}”</p>}
                {err && <p className="mt-1 text-xs font-medium text-danger">{err.message}</p>}
                <div className="mt-2 flex items-center justify-between">
                  <QtyStepper size="sm" value={l.quantity} min={0} onChange={(v) => setQty(l.key, v)} label={`Cantidad de ${l.name}`} />
                  <span className="font-semibold tabular-nums">{money(lineTotal(l))}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 flex justify-end">
        <button onClick={clear} className="flex items-center gap-1 text-xs text-ink-mute hover:text-danger"><Trash2 className="h-3.5 w-3.5" /> Vaciar</button>
      </div>
      <div className="mt-3"><CouponField quote={quote} /></div>
      <div className="mt-4 rounded-2xl bg-surface-sunken/70 p-4">
        <QuoteSummary quote={quote} loading={quoteLoading} isDelivery={isDelivery} />
      </div>
      <div className="mt-3"><QuoteAlerts quote={quote} ignore={ignore} /></div>
      <button
        onClick={onCheckout}
        disabled={!!checkoutDisabledReason}
        className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-brand px-5 text-base font-semibold text-white shadow-lift transition active:scale-[0.98] disabled:opacity-50"
      >
        {checkoutDisabledReason ?? 'Continuar con mi pedido'}
      </button>
    </div>
  );
}
