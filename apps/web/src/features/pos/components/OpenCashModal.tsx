import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { Button, Modal, NumberPad, toast } from '@/ui';
import { centsToInput, padKey, pesosToCents, qk, type CashSession } from '../api';

/** Abrir caja con fondo inicial. */
export function OpenCashModal({ open, onClose, onOpened, reason }: { open: boolean; onClose: () => void; onOpened?: (s: CashSession) => void; reason?: string }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    if (open) setV('');
  }, [open]);
  const submit = async () => {
    setBusy(true);
    try {
      const s = await api.post<CashSession>('/pos/cash-sessions/open', { openingCents: pesosToCents(v) });
      qc.setQueryData(qk.cashCurrent, s);
      toast.success('Caja abierta', `Fondo inicial ${money(s.openingCents)}`);
      onOpened?.(s);
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Abrir caja" footer={<Button size="xl" block loading={busy} onClick={submit}>Abrir caja con {money(pesosToCents(v))}</Button>}>
      <CashEntry value={v} onChange={setV} label="Fondo inicial (efectivo en el cajón)" hint={reason} presets={[50000, 100000, 150000, 200000]} />
    </Modal>
  );
}

/** Monto grande + atajos + NumberPad. */
export function CashEntry({ value, onChange, label, hint, presets }: { value: string; onChange: (v: string) => void; label: string; hint?: string; presets?: number[] }) {
  return (
    <div>
      {hint && <p className="mb-3 rounded-xl bg-warn/10 px-3 py-2 text-sm font-medium text-warn">{hint}</p>}
      <p className="text-center text-sm text-ink-mute">{label}</p>
      <p className="h-display mb-4 text-center text-5xl font-bold tabular-nums">{value ? `$${value}` : '$0'}</p>
      {presets && (
        <div className="mb-3 grid grid-cols-4 gap-2">
          {presets.map((p) => (
            <button key={p} onClick={() => onChange(centsToInput(p))} className="h-11 rounded-xl bg-surface-sunken text-sm font-bold tabular-nums active:scale-95">
              {money(p).replace('.00', '')}
            </button>
          ))}
        </div>
      )}
      <NumberPad allowDecimal onKey={(k) => onChange(padKey(value, k))} />
    </div>
  );
}
