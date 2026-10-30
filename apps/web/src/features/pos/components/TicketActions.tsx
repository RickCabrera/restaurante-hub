import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Gift, Minus, Pencil, Percent, Plus, Tag, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useAuth } from '@/lib/auth-store';
import { Button, Checkbox, EmptyState, Modal, NumberPad, confirm, toast } from '@/ui';
import { centsToInput, lineModsText, padKey, pesosToCents, useFloor, useSetTicket, type Ticket, type TicketLine } from '../api';
import { TicketList } from './OpenTicketsSheet';

async function run<T>(fn: () => Promise<T>, ok?: string): Promise<T | null> {
  try {
    const r = await fn();
    if (ok) toast.success(ok);
    return r;
  } catch (e) {
    toast.fromError(e);
    return null;
  }
}

// ------------------------------------------------------------- descuento de cuenta / renglón

export function DiscountModal({ ticket, line, open, onClose }: { ticket: Ticket; line?: TicketLine | null; open: boolean; onClose: () => void }) {
  const [type, setType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [v, setV] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const setTicket = useSetTicket();
  useEffect(() => {
    if (!open) return;
    const cur = line ? null : ticket;
    setType((cur?.discountType as 'PERCENT' | 'AMOUNT') ?? 'PERCENT');
    setV(cur?.discountValue ? (cur.discountType === 'AMOUNT' ? centsToInput(cur.discountValue) : String(cur.discountValue)) : '');
    setReason(cur?.discountReason ?? '');
  }, [open, line, ticket]);

  const value = type === 'PERCENT' ? Math.min(100, parseInt(v || '0', 10)) : pesosToCents(v);
  const base = line ? line.totalCents + line.discountCents : ticket.subtotalCents;
  const preview = type === 'PERCENT' ? Math.round((base * value) / 100) : Math.min(value, base);

  const save = async (val = value) => {
    if (val > 0 && !reason.trim()) return toast.error('Captura el motivo del descuento');
    setBusy(true);
    const path = line ? `/pos/tickets/${ticket.id}/lines/${line.id}/discount` : `/pos/tickets/${ticket.id}/discount`;
    const r = await run(() => api.post<Ticket>(path, { type, value: val, reason: reason.trim() || undefined }), val ? 'Descuento aplicado' : 'Descuento quitado');
    setBusy(false);
    if (r) {
      setTicket(r);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={line ? `Descuento · ${line.productName}` : 'Descuento a la cuenta'}
      footer={
        <>
          {(line ? line.discountCents > 0 && !line.isCourtesy : !!ticket.discountCents) && (
            <Button variant="ghost" className="mr-auto text-danger" onClick={() => save(0)}>Quitar descuento</Button>
          )}
          <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
          <Button size="lg" loading={busy} disabled={!value} onClick={() => save()}>Aplicar −{money(preview)}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1">
            {(['PERCENT', 'AMOUNT'] as const).map((t) => (
              <button key={t} onClick={() => { setType(t); setV(''); }} className={clsx('h-11 rounded-lg font-semibold', type === t ? 'bg-surface-raised shadow-sm' : 'text-ink-mute')}>
                {t === 'PERCENT' ? 'Porcentaje' : 'Monto $'}
              </button>
            ))}
          </div>
          <p className="h-display text-center text-5xl font-bold tabular-nums">{type === 'PERCENT' ? `${v || 0}%` : `$${v || 0}`}</p>
          <p className="mb-3 text-center text-sm text-ink-mute">de {money(base)}</p>
          {type === 'PERCENT' && (
            <div className="mb-3 grid grid-cols-4 gap-2">
              {[5, 10, 15, 20].map((p) => (
                <button key={p} onClick={() => setV(String(p))} className={clsx('h-11 rounded-xl font-bold', v === String(p) ? 'bg-brand text-white' : 'bg-surface-sunken')}>{p}%</button>
              ))}
            </div>
          )}
          <p className="text-xs text-ink-mute">Más de 20 % requiere administrador.</p>
        </div>
        <div className="space-y-3">
          <NumberPad allowDecimal={type === 'AMOUNT'} onKey={(k) => setV((x) => (type === 'PERCENT' ? (k === 'back' ? x.slice(0, -1) : k === '.' ? x : (x + k).slice(-3)) : padKey(x, k)))} />
          <label className="block">
            <span className="label">Motivo</span>
            <input className="input" maxLength={200} placeholder="Ej. cliente frecuente" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------- propina

export function TipModal({ ticket, open, onClose }: { ticket: Ticket; open: boolean; onClose: () => void }) {
  const business = useAuth((s) => s.business);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const setTicket = useSetTicket();
  const base = ticket.subtotalCents - ticket.discountCents;
  const options = ticket.suggestedTips?.length
    ? ticket.suggestedTips
    : (business?.tips ?? [10, 15, 20]).map((p) => ({ percent: p, amountCents: Math.round((base * p) / 100) }));

  const send = async (body: { percent?: number; amountCents?: number }) => {
    setBusy(true);
    const r = await run(() => api.post<Ticket>(`/pos/tickets/${ticket.id}/tip`, body), 'Propina actualizada');
    setBusy(false);
    if (r) {
      setTicket(r);
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Propina" size="md">
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button
            key={o.percent}
            disabled={busy}
            onClick={() => send({ percent: o.percent })}
            className={clsx('flex h-24 flex-col items-center justify-center rounded-2xl border-2 transition active:scale-95', ticket.tipPercent === o.percent ? 'border-brand bg-brand/10' : 'border-line')}
          >
            <span className="h-display text-3xl font-bold">{o.percent}%</span>
            <span className="text-sm tabular-nums text-ink-mute">{money(o.amountCents)}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-end gap-2">
        <label className="flex-1">
          <span className="label">Otro monto</span>
          <input className="input h-12 text-lg" inputMode="decimal" placeholder="$0" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ''))} />
        </label>
        <Button size="lg" disabled={!custom || busy} onClick={() => send({ amountCents: pesosToCents(custom) })}>Aplicar</Button>
      </div>
      <Button variant="ghost" className="mt-3 text-danger" disabled={busy} onClick={() => send({ amountCents: 0 })}>Sin propina</Button>
    </Modal>
  );
}

// ------------------------------------------------------------- dividir

export function SplitModal({ ticket, open, onClose, onPayPart }: { ticket: Ticket; open: boolean; onClose: () => void; onPayPart: (cents: number) => void }) {
  const [mode, setMode] = useState<'lines' | 'equal'>('lines');
  const [ids, setIds] = useState<string[]>([]);
  const [parts, setParts] = useState(2);
  const [result, setResult] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const setTicket = useSetTicket();
  const lines = (ticket.items ?? []).filter((l) => !l.cancelledAt);
  useEffect(() => {
    if (open) {
      setIds([]);
      setResult(null);
      setParts(Math.max(2, ticket.guests));
    }
  }, [open, ticket.guests]);

  const splitLines = async () => {
    setBusy(true);
    const r = await run(() => api.post<{ ticket: Ticket; newTicket: Ticket }>(`/pos/tickets/${ticket.id}/split`, { mode: 'lines', lineIds: ids }), 'Cuenta dividida');
    setBusy(false);
    if (r) {
      setTicket(r.ticket);
      setTicket(r.newTicket);
      onClose();
      navigate(`/pos/cuenta/${r.newTicket.id}`);
    }
  };
  const splitEqual = async () => {
    setBusy(true);
    const r = await run(() => api.post<{ parts: number[] }>(`/pos/tickets/${ticket.id}/split`, { mode: 'equal', parts }));
    setBusy(false);
    if (r) setResult(r.parts);
  };

  return (
    <Modal open={open} onClose={onClose} title="Dividir cuenta" size="lg">
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1">
        {(['lines', 'equal'] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); setResult(null); }} className={clsx('h-11 rounded-lg font-semibold', mode === m ? 'bg-surface-raised shadow-sm' : 'text-ink-mute')}>
            {m === 'lines' ? 'Por productos' : 'Partes iguales'}
          </button>
        ))}
      </div>
      {mode === 'lines' ? (
        <>
          <p className="mb-2 text-sm text-ink-mute">Elige los productos que pasan a una cuenta nueva.</p>
          <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto scroll-thin">
            {lines.map((l) => {
              const on = ids.includes(l.id);
              return (
                <li key={l.id}>
                  <button
                    onClick={() => setIds((x) => (on ? x.filter((i) => i !== l.id) : [...x, l.id]))}
                    className={clsx('flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 px-3 text-left', on ? 'border-brand bg-brand/10' : 'border-line')}
                  >
                    <Checkbox checked={on} onChange={() => undefined} label="" />
                    <span className="flex-1 font-medium">{l.quantity}× {l.productName}</span>
                    <span className="font-semibold tabular-nums">{money(l.totalCents)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Button size="xl" block className="mt-4" loading={busy} disabled={!ids.length || ids.length >= lines.length} onClick={splitLines}>
            Pasar {ids.length} a cuenta nueva · {money(lines.filter((l) => ids.includes(l.id)).reduce((s, l) => s + l.totalCents, 0))}
          </Button>
        </>
      ) : result ? (
        <>
          <p className="mb-3 text-sm text-ink-mute">Restante {money(ticket.remainingCents)} entre {result.length} personas:</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {result.map((c, i) => (
              <button key={i} onClick={() => { onClose(); onPayPart(c); }} className="flex h-24 flex-col items-center justify-center rounded-2xl border-2 border-line transition hover:border-brand active:scale-95">
                <span className="text-xs text-ink-mute">Parte {i + 1}</span>
                <span className="h-display text-2xl font-bold tabular-nums">{money(c)}</span>
                <span className="text-xs font-semibold text-brand">Cobrar</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center">
          <p className="mb-3 text-sm text-ink-mute">¿Entre cuántas personas?</p>
          <div className="flex items-center gap-6">
            <button aria-label="Menos" onClick={() => setParts((p) => Math.max(2, p - 1))} className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-sunken"><Minus /></button>
            <span className="h-display w-20 text-center text-6xl font-bold">{parts}</span>
            <button aria-label="Más" onClick={() => setParts((p) => Math.min(30, p + 1))} className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-sunken"><Plus /></button>
          </div>
          <p className="mt-3 text-sm text-ink-mute">≈ {money(Math.ceil(ticket.remainingCents / parts))} por persona</p>
          <Button size="xl" block className="mt-4" loading={busy} onClick={splitEqual}>Calcular partes</Button>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------- juntar / mover

export function MergeModal({ ticket, open, onClose }: { ticket: Ticket; open: boolean; onClose: () => void }) {
  const setTicket = useSetTicket();
  return (
    <Modal open={open} onClose={onClose} title="Juntar con otra cuenta" size="lg">
      <p className="mb-3 text-sm text-ink-mute">Los productos de la cuenta que elijas se pasan a esta ({ticket.tableLabel}).</p>
      {open && (
        <TicketList
          excludeId={ticket.id}
          onPick={async (src) => {
            const ok = await confirm({ title: `¿Juntar ${src.tableLabel} en ${ticket.tableLabel}?`, description: `${src.folio} · ${money(src.totalCents)}`, confirmText: 'Juntar' });
            if (!ok) return;
            const r = await run(() => api.post<Ticket>(`/pos/tickets/${ticket.id}/merge`, { sourceTicketId: src.id }), 'Cuentas juntadas');
            if (r) {
              setTicket(r);
              onClose();
            }
          }}
        />
      )}
    </Modal>
  );
}

export function MoveModal({ ticket, open, onClose }: { ticket: Ticket; open: boolean; onClose: () => void }) {
  const floor = useFloor();
  const setTicket = useSetTicket();
  const areas = floor.data ?? [];
  return (
    <Modal open={open} onClose={onClose} title="Cambiar de mesa" size="lg">
      {areas.every((a) => a.tables.every((t) => t.status !== 'LIBRE')) && <EmptyState title="No hay mesas libres" />}
      <div className="space-y-4">
        {areas.map((a) => {
          const free = a.tables.filter((t) => t.status === 'LIBRE' && t.id !== ticket.tableId);
          if (!free.length) return null;
          return (
            <section key={a.id}>
              <h3 className="mb-2 text-sm font-semibold text-ink-mute">{a.name}</h3>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {free.map((t) => (
                  <button
                    key={t.id}
                    onClick={async () => {
                      const r = await run(() => api.post<Ticket>(`/pos/tickets/${ticket.id}/move`, { tableId: t.id }), `Cuenta movida a mesa ${t.name}`);
                      if (r) {
                        setTicket(r);
                        onClose();
                      }
                    }}
                    className="h-display h-16 rounded-2xl border-2 border-ok/40 bg-ok/10 text-xl font-bold active:scale-95"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------- menú de renglón

export function LineSheet({ ticket, line, onClose, canCash, onDiscount }: { ticket: Ticket; line: TicketLine | null; onClose: () => void; canCash: boolean; onDiscount: (l: TicketLine) => void }) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const setTicket = useSetTicket();
  useEffect(() => {
    if (line) {
      setQty(line.quantity);
      setNote(line.note ?? '');
    }
  }, [line]);
  if (!line) return null;
  const sent = !!line.sentAt;

  const save = async () => {
    setBusy(true);
    const r = await run(() => api.patch<Ticket>(`/pos/tickets/${ticket.id}/lines/${line.id}`, { quantity: qty, note: note.trim() || null }));
    setBusy(false);
    if (r) {
      setTicket(r);
      onClose();
    }
  };
  const cancel = async () => {
    const reason = await confirm({
      title: `Cancelar ${line.quantity}× ${line.productName}`,
      description: sent ? 'Ya se envió a cocina: se avisará la cancelación.' : undefined,
      danger: true,
      confirmText: 'Cancelar producto',
      cancelText: 'Volver',
      input: { label: 'Motivo', required: true, placeholder: 'Ej. el cliente cambió de opinión' },
    });
    if (!reason) return;
    const r = await run(() => api.post<Ticket>(`/pos/tickets/${ticket.id}/lines/${line.id}/cancel`, { reason }), 'Producto cancelado');
    if (r) {
      setTicket(r);
      onClose();
    }
  };
  const courtesy = async () => {
    const reason = await confirm({ title: line.isCourtesy ? 'Quitar cortesía' : `Cortesía: ${line.productName}`, input: line.isCourtesy ? undefined : { label: 'Motivo', required: true } });
    if (!reason) return;
    const r = await run(
      () => api.post<Ticket>(`/pos/tickets/${ticket.id}/lines/${line.id}/discount`, line.isCourtesy ? { value: 0, isCourtesy: false } : { isCourtesy: true, reason }),
      line.isCourtesy ? 'Cortesía quitada' : 'Cortesía aplicada',
    );
    if (r) {
      setTicket(r);
      onClose();
    }
  };

  const mods = lineModsText(line);
  return (
    <Modal open onClose={onClose} title={line.productName} size="md">
      {mods && <p className="mb-3 text-sm text-ink-mute">{mods}</p>}
      {!sent ? (
        <>
          <div className="mb-4 flex items-center justify-center gap-6">
            <button aria-label="Menos" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-sunken"><Minus /></button>
            <span className="h-display w-16 text-center text-5xl font-bold">{qty}</span>
            <button aria-label="Más" onClick={() => setQty((q) => Math.min(99, q + 1))} className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-sunken"><Plus /></button>
          </div>
          <label className="block">
            <span className="label">Nota para cocina</span>
            <input className="input h-12" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <Button size="lg" block className="mt-3" icon={<Pencil className="h-4 w-4" />} loading={busy} onClick={save}>Guardar cambios</Button>
        </>
      ) : (
        <p className="mb-2 rounded-xl bg-ok/10 px-3 py-2 text-sm font-medium text-ok">Enviado a cocina: ya no se puede editar.</p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button size="lg" variant="outline" disabled={!canCash} icon={<Percent className="h-4 w-4" />} onClick={() => { onClose(); onDiscount(line); }}>Descuento</Button>
        <Button size="lg" variant="outline" disabled={!canCash} icon={<Gift className="h-4 w-4" />} onClick={courtesy}>{line.isCourtesy ? 'Quitar cortesía' : 'Cortesía'}</Button>
        <Button size="lg" variant="outline" className="text-danger" icon={<XCircle className="h-4 w-4" />} onClick={cancel}>Cancelar</Button>
      </div>
      {!canCash && <p className="mt-2 flex items-center gap-1 text-xs text-ink-mute"><Tag className="h-3 w-3" /> Descuentos y cortesías: solo caja o administrador.</p>}
    </Modal>
  );
}
