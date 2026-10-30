import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ChevronDown, Minus, PackageCheck, Plus, X } from 'lucide-react';
import { roundQty } from '@rh/shared';
import { api } from '@/lib/api';
import { SupplyIcon } from '@/icons/supplies';
import { assetUrl } from '@/lib/config';
import { fmtTime, timeAgo } from '@/lib/format';
import { sounds } from '@/lib/sound';
import { Button, confirm, EmptyState, ErrorState, Modal, PageLoader, toast } from '@/ui';
import { isOpen, STEPS, stepIndex, StatusPill } from '@/features/common-req/meta';
import { qtyLabel } from '@/features/common-req/SupplyTile';
import { upsertRequisition } from '@/features/common-req/hooks';
import type { Requisition } from '@/features/common-req/types';
import { useMyRequisitions } from './useTabletData';

function Stepper({ r, accent }: { r: Requisition; accent: string }) {
  const idx = stepIndex(r.status);
  if (idx < 0) return null;
  return (
    <ol className="flex items-center">
      {STEPS.map((s, i) => {
        const done = i <= idx;
        return (
          <li key={s.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={clsx('grid h-10 w-10 place-items-center rounded-full border-4 font-bold transition', done ? 'border-transparent text-white' : 'border-line bg-surface-raised text-ink-mute')}
                style={done ? { background: accent } : undefined}
              >
                {done ? <Check className="h-5 w-5" strokeWidth={3} /> : i + 1}
              </span>
              <span className={clsx('whitespace-nowrap text-xs font-semibold', done ? 'text-ink' : 'text-ink-mute')}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <span className="mx-1 mb-5 h-1.5 flex-1 rounded-full" style={{ background: i < idx ? accent : 'rgb(var(--line))' }} />}
          </li>
        );
      })}
    </ol>
  );
}

function LineView({ it, status }: { it: Requisition['items'][number]; status: Requisition['status'] }) {
  const changed = it.approvedQty != null && !it.rejected && Math.abs(it.approvedQty - it.requestedQty) > 1e-9;
  const fulfilledDiff = it.fulfilledQty != null && it.approvedQty != null && Math.abs(it.fulfilledQty - it.approvedQty) > 1e-9;
  return (
    <div className={clsx('flex items-center gap-3 rounded-2xl px-3 py-2', it.rejected ? 'bg-danger/5' : changed ? 'bg-warn/10' : 'bg-surface-sunken/60')}>
      <SupplyIcon icon={it.icon} imageUrl={assetUrl(it.imageUrl)} label={it.supplyName} size={48} />
      <div className="min-w-0 flex-1">
        <p className={clsx('text-lg font-semibold leading-tight', it.rejected && 'text-ink-mute line-through')}>{it.supplyName}</p>
        {it.rejected ? (
          <p className="text-sm font-semibold text-danger">No aprobado{it.reviewNote ? ` · ${it.reviewNote}` : ''}</p>
        ) : changed ? (
          <p className="text-sm font-semibold text-warn">
            Pediste {qtyLabel(it.requestedQty, it.unit)} · Aprobado {qtyLabel(it.approvedQty!, it.unit)}
            {it.reviewNote ? ` · ${it.reviewNote}` : ''}
          </p>
        ) : (
          it.note && <p className="text-sm text-ink-mute">{it.note}</p>
        )}
        {fulfilledDiff && status !== 'RECIBIDA' && <p className="text-sm text-info">Surtido: {qtyLabel(it.fulfilledQty!, it.unit)}</p>}
        {it.receivedQty != null && <p className="text-sm text-ink-mute">Recibido: {qtyLabel(it.receivedQty, it.unit)}</p>}
      </div>
      <span className={clsx('h-display text-xl font-bold', it.rejected && 'text-ink-mute line-through')}>
        {qtyLabel(it.rejected ? it.requestedQty : it.fulfilledQty ?? it.approvedQty ?? it.requestedQty, it.unit)}
      </span>
    </div>
  );
}

function ReceiveModal({ r, onClose }: { r: Requisition; onClose: () => void }) {
  const qc = useQueryClient();
  const lines = r.items.filter((i) => !i.rejected);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((i) => [i.id, i.fulfilledQty ?? i.approvedQty ?? i.requestedQty])));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const step = (unit: string) => (['KG', 'L'].includes(unit) ? 0.5 : 1);

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.post<Requisition>(`/requisitions/${r.id}/receive`, { items: lines.map((i) => ({ id: i.id, receivedQty: qty[i.id] })), note: note.trim() || undefined });
      upsertRequisition(qc, res);
      sounds.success();
      toast.success('¡Recibido!', res.hasDifferences ? 'Se avisó a la dueña de las diferencias' : undefined);
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Recibir ${r.folio}`}
      footer={
        <Button size="xl" block variant="success" loading={busy} icon={<PackageCheck className="h-7 w-7" />} onClick={save}>
          Confirmar recepción
        </Button>
      }
    >
      <p className="mb-3 text-ink-mute">Revisa lo que llegó. Si falta algo, bájale con “−”.</p>
      <div className="space-y-2">
        {lines.map((i) => {
          const expected = i.fulfilledQty ?? i.approvedQty ?? i.requestedQty;
          const v = qty[i.id];
          const diff = Math.abs(v - expected) > 1e-9;
          return (
            <div key={i.id} className={clsx('flex items-center gap-3 rounded-2xl p-2', diff ? 'bg-warn/10' : 'bg-surface-sunken/60')}>
              <SupplyIcon icon={i.icon} imageUrl={assetUrl(i.imageUrl)} label={i.supplyName} size={52} />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold leading-tight">{i.supplyName}</p>
                <p className="text-sm text-ink-mute">Esperado: {qtyLabel(expected, i.unit)}</p>
              </div>
              <button className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-raised shadow-card active:scale-90" onClick={() => setQty((q) => ({ ...q, [i.id]: Math.max(0, roundQty(v - step(i.unit))) }))} aria-label="Menos">
                <Minus className="h-7 w-7" strokeWidth={3} />
              </button>
              <span className={clsx('h-display min-w-[5rem] text-center text-xl font-bold', diff && 'text-warn')}>{qtyLabel(v, i.unit)}</span>
              <button className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-raised shadow-card active:scale-90" onClick={() => setQty((q) => ({ ...q, [i.id]: roundQty(v + step(i.unit)) }))} aria-label="Más">
                <Plus className="h-7 w-7" strokeWidth={3} />
              </button>
            </div>
          );
        })}
      </div>
      <input className="input mt-4 h-14 text-lg" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comentario (opcional)" maxLength={300} />
    </Modal>
  );
}

export function MyOrders({ accent }: { accent: string }) {
  const q = useMyRequisitions();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<Requisition | null>(null);

  const list = useMemo(() => {
    const items = q.data?.items ?? [];
    const rank = (r: Requisition) => (r.status === 'SURTIDA' ? 0 : isOpen(r.status) ? 1 : 2);
    return [...items].sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
  }, [q.data]);

  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!list.length) return <EmptyState title="Aún no hay pedidos" description="Cuando envíes un pedido lo verás aquí." className="h-full" />;

  const cancel = async (r: Requisition) => {
    const ok = await confirm({ title: `¿Cancelar ${r.folio}?`, description: 'La dueña ya no lo verá como pendiente.', danger: true, confirmText: 'Sí, cancelar' });
    if (!ok) return;
    try {
      upsertRequisition(qc, await api.post<Requisition>(`/requisitions/${r.id}/cancel`, {}));
      toast.success('Pedido cancelado');
    } catch (e) {
      toast.fromError(e);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      {list.map((r) => {
        const open = isOpen(r.status);
        const exp = expanded === r.id || (expanded === null && open && list.filter((x) => isOpen(x.status))[0]?.id === r.id);
        const changed = r.items.some((i) => i.rejected || (i.approvedQty != null && Math.abs(i.approvedQty - i.requestedQty) > 1e-9));
        return (
          <article key={r.id} className={clsx('card overflow-hidden', !open && 'opacity-80')} style={r.priority === 'URGENTE' && open ? { borderColor: 'rgb(var(--danger))', borderWidth: 2 } : undefined}>
            <button className="flex w-full items-center gap-3 px-4 py-4 text-left" onClick={() => setExpanded(exp ? '' : r.id)}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="h-display text-2xl font-bold">{r.folio}</span>
                  <StatusPill status={r.status} big />
                  {r.priority === 'URGENTE' && <span className="rounded-full bg-danger px-2.5 py-0.5 text-xs font-black text-white">URGENTE</span>}
                  {changed && open && <span className="rounded-full bg-warn px-2.5 py-0.5 text-xs font-bold text-white">Con cambios</span>}
                </div>
                <p className="mt-0.5 text-ink-mute">
                  {r.itemCount} {r.itemCount === 1 ? 'insumo' : 'insumos'} · {fmtTime(r.createdAt)} · {timeAgo(r.createdAt)}
                  {r.createdByName ? ` · ${r.createdByName}` : ''}
                </p>
              </div>
              <ChevronDown className={clsx('h-7 w-7 text-ink-mute transition', exp && 'rotate-180')} />
            </button>
            {r.status === 'SURTIDA' && !exp && (
              <div className="px-4 pb-4">
                <Button size="xl" block variant="success" icon={<PackageCheck className="h-7 w-7" />} onClick={() => setReceiving(r)}>
                  Llegó · Confirmar recepción
                </Button>
              </div>
            )}
            {exp && (
              <div className="space-y-4 border-t border-line px-4 py-4">
                <Stepper r={r} accent={accent} />
                {r.status === 'RECHAZADA' && <p className="rounded-2xl bg-danger/10 px-4 py-3 text-lg font-semibold text-danger">Rechazado{r.rejectReason ? `: ${r.rejectReason}` : ''}</p>}
                {r.reviewNote && <p className="rounded-2xl bg-info/10 px-4 py-3 text-info">La dueña: {r.reviewNote}</p>}
                <div className="space-y-2">
                  {r.items.map((it) => (
                    <LineView key={it.id} it={it} status={r.status} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  {r.status === 'SURTIDA' && (
                    <Button size="xl" variant="success" className="flex-1" icon={<PackageCheck className="h-7 w-7" />} onClick={() => setReceiving(r)}>
                      Confirmar recepción
                    </Button>
                  )}
                  {(r.status === 'ENVIADA' || r.status === 'VISTA') && (
                    <Button size="xl" variant="outline" icon={<X className="h-6 w-6" />} onClick={() => cancel(r)}>
                      Cancelar pedido
                    </Button>
                  )}
                </div>
              </div>
            )}
          </article>
        );
      })}
      {receiving && <ReceiveModal r={receiving} onClose={() => setReceiving(null)} />}
    </div>
  );
}
