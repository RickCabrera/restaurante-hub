import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Banknote, CheckCircle2, CreditCard, Landmark, Trash2, Wallet } from 'lucide-react';
import type { PaymentMethod } from '@rh/shared';
import { api, ApiError } from '@/lib/api';
import { money } from '@/lib/format';
import { sounds } from '@/lib/sound';
import { Button, Modal, NumberPad, toast } from '@/ui';
import { centsToInput, padKey, pesosToCents, useSetTicket, type Ticket } from '../api';
import { OpenCashModal } from './OpenCashModal';

interface Draft {
  method: PaymentMethod;
  amountCents: number;
  receivedCents?: number;
  reference?: string;
}

const METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: 'EFECTIVO', label: 'Efectivo', icon: Banknote },
  { value: 'TARJETA', label: 'Tarjeta', icon: CreditCard },
  { value: 'TRANSFERENCIA', label: 'Transferencia', icon: Landmark },
];

type PayResult = Ticket & { changeCents: number; isPaid: boolean };

/**
 * Cobro: uno o varios pagos parciales. `presetCents` sugiere el monto (p. ej. una parte de una división).
 */
export function PayModal({ ticket, open, onClose, presetCents }: { ticket: Ticket; open: boolean; onClose: () => void; presetCents?: number }) {
  const remaining = ticket.remainingCents;
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('EFECTIVO');
  const [input, setInput] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [needCash, setNeedCash] = useState(false);
  const [done, setDone] = useState<PayResult | null>(null);
  const setTicket = useSetTicket();
  const navigate = useNavigate();

  const draftApplied = drafts.reduce((s, d) => s + d.amountCents, 0);
  const left = Math.max(0, remaining - draftApplied);
  const target = presetCents && drafts.length === 0 ? Math.min(presetCents, left) : left;

  useEffect(() => {
    if (!open) return;
    setDrafts([]);
    setMethod('EFECTIVO');
    setInput('');
    setReference('');
    setDone(null);
  }, [open]);

  const typed = pesosToCents(input);
  // Efectivo: lo tecleado es lo RECIBIDO (puede exceder) → cambio. Tarjeta/transferencia: monto (máx. lo que falta)
  const amountNow = method === 'EFECTIVO' ? Math.min(typed || target, target) : Math.min(typed || target, left);
  const received = method === 'EFECTIVO' ? typed || target : undefined;
  const change = method === 'EFECTIVO' && received ? Math.max(0, received - amountNow) : 0;
  const cashShort = method === 'EFECTIVO' && !!typed && typed < target && drafts.length === 0 && !presetCents;

  const quick = useMemo(() => {
    const opts = [5000, 10000, 20000, 50000, 100000].filter((v) => v >= target);
    return opts.slice(0, 4);
  }, [target]);

  const addPartial = () => {
    if (amountNow <= 0) return;
    setDrafts((d) => [...d, { method, amountCents: amountNow, receivedCents: received, reference: reference.trim() || undefined }]);
    setInput('');
    setReference('');
  };

  const submit = async () => {
    const all: Draft[] = [...drafts];
    if (amountNow > 0) all.push({ method, amountCents: amountNow, receivedCents: received, reference: reference.trim() || undefined });
    if (!all.length) return;
    setBusy(true);
    try {
      const r = await api.post<PayResult>(`/pos/tickets/${ticket.id}/pay`, {
        payments: all.map((d) => ({
          method: d.method,
          amountCents: d.amountCents,
          receivedCents: d.method === 'EFECTIVO' ? Math.max(d.receivedCents ?? d.amountCents, d.amountCents) : undefined,
          reference: d.reference,
          tipCents: 0,
        })),
      });
      setTicket(r);
      sounds.success();
      if (r.isPaid) setDone(r);
      else {
        toast.success('Pago registrado', `Restan ${money(r.remainingCents)}`);
        if (r.changeCents) toast.info(`Cambio: ${money(r.changeCents)}`);
        onClose();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && /caja/i.test(e.message)) setNeedCash(true);
      else toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal open={open} onClose={onClose} size="md" dismissable={false}>
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle2 className="h-16 w-16 text-ok" />
          <p className="h-display mt-3 text-2xl font-bold">Cuenta pagada</p>
          <p className="text-sm text-ink-mute">{done.tableLabel} · {done.folio} · Total {money(done.totalCents)}</p>
          {done.changeCents > 0 && (
            <div className="mt-6 w-full rounded-3xl bg-ok/10 p-6">
              <p className="text-sm font-semibold uppercase tracking-wide text-ok">Cambio</p>
              <p className="h-display text-6xl font-bold tabular-nums text-ok">{money(done.changeCents)}</p>
            </div>
          )}
          <div className="mt-6 grid w-full grid-cols-2 gap-3">
            <Button size="xl" variant="outline" onClick={() => { onClose(); navigate('/pos'); }}>Ir a mesas</Button>
            <Button size="xl" onClick={() => { onClose(); navigate('/pos'); }}>Nueva cuenta</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal open={open} onClose={onClose} size="xl" title={`Cobrar · ${ticket.tableLabel}`}>
        <div className="grid gap-5 md:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="flex items-end justify-between rounded-3xl bg-surface-sunken p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{drafts.length ? 'Falta por cobrar' : 'Por cobrar'}</p>
                <p className="h-display text-5xl font-bold tabular-nums">{money(left)}</p>
              </div>
              {ticket.paidCents > 0 && <p className="text-right text-sm text-ink-mute">Total {money(ticket.totalCents)}<br />Pagado {money(ticket.paidCents)}</p>}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => { setMethod(m.value); setInput(''); }}
                  className={clsx(
                    'flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 font-semibold transition active:scale-95',
                    method === m.value ? 'border-brand bg-brand text-white' : 'border-line bg-surface-raised',
                  )}
                >
                  <m.icon className="h-6 w-6" />
                  {m.label}
                </button>
              ))}
            </div>

            <div className="rounded-3xl border border-line p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{method === 'EFECTIVO' ? 'Recibido' : 'Monto'}</p>
              <p className={clsx('h-display text-4xl font-bold tabular-nums', !input && 'text-ink-mute')}>{input ? `$${input}` : money(target)}</p>
              {method === 'EFECTIVO' ? (
                <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
                  <span className="text-sm font-semibold uppercase tracking-wide text-ink-mute">Cambio</span>
                  <span className={clsx('h-display text-5xl font-bold tabular-nums', change > 0 ? 'text-ok' : 'text-ink-mute')}>{money(change)}</span>
                </div>
              ) : (
                <input className="input mt-3 h-12" placeholder={method === 'TARJETA' ? 'Referencia / últimos 4 dígitos (opcional)' : 'Referencia de la transferencia (opcional)'} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
              )}
              {cashShort && <p className="mt-2 text-xs font-semibold text-warn">El efectivo no cubre el total: se registrará como pago parcial de {money(typed)}.</p>}
            </div>

            {drafts.length > 0 && (
              <ul className="space-y-1.5">
                {drafts.map((d, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl bg-surface-sunken px-3 py-2 text-sm">
                    <Wallet className="h-4 w-4 text-ink-mute" />
                    <span className="flex-1 font-medium">{METHODS.find((m) => m.value === d.method)?.label}{d.reference ? ` · ${d.reference}` : ''}</span>
                    <span className="font-bold tabular-nums">{money(d.amountCents)}</span>
                    <button aria-label="Quitar pago" onClick={() => setDrafts((x) => x.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-lg text-danger hover:bg-danger/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            {method === 'EFECTIVO' && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setInput(centsToInput(target))} className="h-14 rounded-2xl bg-brand/10 font-bold text-brand active:scale-95">Exacto</button>
                {quick.map((v) => (
                  <button key={v} onClick={() => setInput(String(v / 100))} className="h-14 rounded-2xl bg-surface-sunken text-lg font-bold tabular-nums active:scale-95">
                    {money(v).replace('.00', '')}
                  </button>
                ))}
              </div>
            )}
            <NumberPad allowDecimal onKey={(k) => setInput((v) => padKey(v, k))} />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button size="lg" variant="outline" disabled={amountNow <= 0 || amountNow >= left} onClick={addPartial}>
                Pago parcial
              </Button>
              <Button size="lg" variant="ghost" onClick={() => setInput('')}>Borrar</Button>
            </div>
            <Button size="xl" variant="success" block loading={busy} disabled={left <= 0 && drafts.length === 0} onClick={submit}>
              Cobrar {money(draftApplied + amountNow)}
            </Button>
          </div>
        </div>
      </Modal>
      <OpenCashModal
        open={needCash}
        onClose={() => setNeedCash(false)}
        reason="Para cobrar, primero abre la caja."
        onOpened={() => {
          setNeedCash(false);
          void submit();
        }}
      />
    </>
  );
}
