import clsx from 'clsx';
import { ArrowDownCircle, ArrowUpCircle, Banknote, CreditCard, Landmark } from 'lucide-react';
import { money, fmtTime } from '@/lib/format';
import type { CashSummary } from '../api';

const ICON = { EFECTIVO: Banknote, TARJETA: CreditCard, TRANSFERENCIA: Landmark } as const;
const SOURCE: Record<string, string> = { MANUAL: '', DRIVER_SETTLEMENT: 'Repartidor', DELIVERY_CASH: 'Delivery' };

/** Resumen de caja: ventas por método, propinas, movimientos y efectivo esperado. */
export function CashSummaryView({ s, compact }: { s: CashSummary; compact?: boolean }) {
  return (
    <div className={clsx('grid gap-4', !compact && 'lg:grid-cols-2')}>
      <section className="card p-4">
        <h3 className="mb-3 font-semibold">Ventas por método</h3>
        <ul className="space-y-2">
          {s.salesByMethod.map((m) => {
            const Icon = ICON[m.method];
            return (
              <li key={m.method} className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-sunken text-ink-soft"><Icon className="h-5 w-5" /></span>
                <span className="flex-1">
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-xs text-ink-mute">{m.count} pago(s){m.tipsCents ? ` · propina ${money(m.tipsCents)}` : ''}</span>
                </span>
                <span className="h-display text-lg font-bold tabular-nums">{money(m.amountCents)}</span>
              </li>
            );
          })}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
          <Row label="Total vendido" v={money(s.salesCents)} bold />
          <Row label="Propinas" v={money(s.tipsCents)} />
          <Row label="Descuentos" v={money(s.discountsCents)} />
          <Row label="Cuentas cobradas" v={String(s.ticketsCount)} />
          <Row label="Cancelaciones" v={`${s.cancelledCount} cuentas · ${s.cancelledLinesCount} productos`} />
        </dl>
      </section>

      <section className="card p-4">
        <h3 className="mb-3 font-semibold">Efectivo en caja</h3>
        <dl className="space-y-1 text-sm">
          <Row label="Fondo inicial" v={money(s.openingCents)} />
          <Row label="Ventas en efectivo" v={`+${money((s.salesByMethod.find((m) => m.method === 'EFECTIVO')?.amountCents ?? 0) + (s.salesByMethod.find((m) => m.method === 'EFECTIVO')?.tipsCents ?? 0))}`} />
          <Row label="Entradas" v={`+${money(s.entradasCents)}`} cls="text-ok" />
          <Row label="Salidas" v={`−${money(s.salidasCents)}`} cls="text-danger" />
        </dl>
        <div className="mt-3 flex items-end justify-between rounded-2xl bg-surface-sunken p-4">
          <span className="text-sm font-semibold text-ink-soft">Efectivo esperado</span>
          <span className="h-display text-3xl font-bold tabular-nums">{money(s.expectedCashCents)}</span>
        </div>
        {s.countedCents != null && s.differenceCents != null && (
          <div className="mt-2 flex items-center justify-between px-1 text-sm">
            <span>Contado {money(s.countedCents)}</span>
            <span className={clsx('font-bold', s.differenceCents === 0 ? 'text-ok' : s.differenceCents > 0 ? 'text-info' : 'text-danger')}>
              {s.differenceCents === 0 ? 'Cuadra' : `${s.differenceCents > 0 ? 'Sobra' : 'Falta'} ${money(Math.abs(s.differenceCents))}`}
            </span>
          </div>
        )}
        <h4 className="mb-2 mt-4 text-sm font-semibold text-ink-mute">Movimientos</h4>
        {s.movements.length === 0 ? (
          <p className="text-sm text-ink-mute">Sin entradas ni salidas.</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto scroll-thin">
            {s.movements.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                {m.type === 'ENTRADA' ? <ArrowDownCircle className="h-4 w-4 shrink-0 text-ok" /> : <ArrowUpCircle className="h-4 w-4 shrink-0 text-danger" />}
                <span className="min-w-0 flex-1 truncate">
                  {SOURCE[m.source] ? <span className="font-semibold">{SOURCE[m.source]}: </span> : null}
                  {m.reason}
                </span>
                <span className="text-xs text-ink-mute">{fmtTime(m.createdAt)}</span>
                <span className={clsx('w-24 text-right font-semibold tabular-nums', m.type === 'ENTRADA' ? 'text-ok' : 'text-danger')}>
                  {m.type === 'ENTRADA' ? '+' : '−'}{money(m.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, v, bold, cls }: { label: string; v: string; bold?: boolean; cls?: string }) {
  return (
    <div className={clsx('flex justify-between', bold && 'font-semibold', cls)}>
      <dt className={clsx(!cls && 'text-ink-soft')}>{label}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
