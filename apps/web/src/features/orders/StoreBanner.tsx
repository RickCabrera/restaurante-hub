import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { PauseCircle, PlayCircle, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { Button, Modal, toast } from '@/ui';
import { dk, useBranches, type Branch } from '@/features/delivery-common';

const DURATIONS = [15, 30, 60];

export function PauseModal({ branch, open, onClose }: { branch: Branch; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [minutes, setMinutes] = useState(30);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const pause = async () => {
    setBusy(true);
    try {
      await api.post(`/branches/${branch.id}/pause`, { minutes, reason: reason.trim() || undefined });
      await qc.invalidateQueries({ queryKey: dk.branches });
      toast.success(`Pedidos pausados ${minutes} min`, branch.name);
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Pausar pedidos" size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="danger" loading={busy} onClick={pause} icon={<PauseCircle className="h-4 w-4" />}>Pausar {minutes} min</Button></>}>
      <p className="mb-3 text-sm text-ink-soft">Mientras está en pausa, WhatsApp y el menú web no reciben pedidos de <b>{branch.name}</b>. Se reanuda sola.</p>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {DURATIONS.map((m) => (
          <button key={m} onClick={() => setMinutes(m)} className={clsx('h-14 rounded-2xl border-2 font-bold transition', minutes === m ? 'border-danger bg-danger text-white' : 'border-line hover:border-danger/50')}>
            {m === 60 ? '1 hora' : `${m} min`}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="label">Motivo (opcional, lo ve el cliente)</span>
        <input className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Mucha demanda, volvemos pronto" />
      </label>
    </Modal>
  );
}

export async function resumeBranch(qc: ReturnType<typeof useQueryClient>, b: Branch) {
  try {
    await api.post(`/branches/${b.id}/resume`);
    await qc.invalidateQueries({ queryKey: dk.branches });
    toast.success('Pedidos reanudados', b.name);
  } catch (e) {
    toast.fromError(e);
  }
}

/** Estado de tienda: banner cuando está pausada/cerrada; botón compacto cuando está abierta. */
export function StoreBanner() {
  const branches = useBranches();
  const qc = useQueryClient();
  const [pausing, setPausing] = useState<Branch | null>(null);
  const list = (branches.data ?? []).filter((b) => b.active);
  if (!list.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {list.map((b) => {
        const st = b.status;
        const paused = st.reason === 'PAUSED';
        if (st.open)
          return (
            <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-raised px-4 py-2.5">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ok" /></span>
              <p className="min-w-0 flex-1 truncate text-sm"><b>{list.length > 1 ? b.name : 'Tienda abierta'}</b> <span className="hidden text-ink-mute sm:inline">· recibiendo pedidos · {st.hoursText}</span></p>
              <Button size="sm" variant="outline" icon={<PauseCircle className="h-4 w-4" />} onClick={() => setPausing(b)}>Pausar<span className="hidden sm:inline"> pedidos</span></Button>
            </div>
          );
        return (
          <div key={b.id} className={clsx('flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3', paused ? 'bg-danger/10 text-danger' : 'bg-warn/15 text-warn')}>
            {paused ? <PauseCircle className="h-6 w-6 shrink-0" /> : <Store className="h-6 w-6 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {list.length > 1 && `${b.name}: `}
                {paused ? `Pedidos en pausa${st.pausedUntil ? ` hasta las ${fmtTime(st.pausedUntil)}` : ''}` : 'Tienda cerrada'}
              </p>
              {(st.pauseReason || !paused) && <p className="text-sm opacity-90">{st.pauseReason || st.message}</p>}
            </div>
            {paused ? (
              <Button variant="success" icon={<PlayCircle className="h-4 w-4" />} onClick={() => resumeBranch(qc, b)}>Reanudar ahora</Button>
            ) : (
              <span className="text-sm font-medium">{st.nextOpeningText ? `Abre ${st.nextOpeningText}` : ''}</span>
            )}
          </div>
        );
      })}
      {pausing && <PauseModal branch={pausing} open onClose={() => setPausing(null)} />}
    </div>
  );
}
