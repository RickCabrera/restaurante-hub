import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, Ban, Check, CheckCheck, Minus, PackageCheck, Plus, RotateCcw, ShoppingCart, Truck, X } from 'lucide-react';
import { roundQty } from '@rh/shared';
import { api } from '@/lib/api';
import { SupplyIcon } from '@/icons/supplies';
import { assetUrl } from '@/lib/config';
import { fmtDateTime, fmtTime, timeAgo } from '@/lib/format';
import { sounds } from '@/lib/sound';
import { Button, confirm, ErrorState, Modal, PageLoader, toast } from '@/ui';
import { AreaBadge, StatusPill } from '@/features/common-req/meta';
import { qtyLabel, unitShort } from '@/features/common-req/SupplyTile';
import { upsertRequisition, useManagerBadges } from '@/features/common-req/hooks';
import { ChatThread } from '@/features/common-req/ChatThread';
import type { Requisition, RequisitionItem } from '@/features/common-req/types';

const stepFor = (u: string) => (['KG', 'L'].includes(u) ? 0.5 : 1);

function QtyStepper({ value, onChange, unit, disabled }: { value: number; onChange: (v: number) => void; unit: RequisitionItem['unit']; disabled?: boolean }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(value)), [value]);
  return (
    <div className={clsx('flex items-center gap-1', disabled && 'pointer-events-none opacity-40')}>
      <button className="grid h-10 w-10 place-items-center rounded-xl bg-surface-sunken active:scale-90" onClick={() => onChange(Math.max(0, roundQty(value - stepFor(unit))))} aria-label="Menos">
        <Minus className="h-4 w-4" strokeWidth={3} />
      </button>
      <div className="relative">
        <input
          inputMode="decimal"
          value={txt}
          onChange={(e) => setTxt(e.target.value.replace(',', '.'))}
          onBlur={() => {
            const n = Number(txt);
            if (Number.isFinite(n) && n >= 0) onChange(roundQty(n));
            else setTxt(String(value));
          }}
          className="input h-10 w-20 pr-8 text-center font-semibold"
          aria-label="Cantidad"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-ink-mute">{unitShort(unit)}</span>
      </div>
      <button className="grid h-10 w-10 place-items-center rounded-xl bg-surface-sunken active:scale-90" onClick={() => onChange(roundQty(value + stepFor(unit)))} aria-label="Más">
        <Plus className="h-4 w-4" strokeWidth={3} />
      </button>
    </div>
  );
}

interface Edit {
  approvedQty: number;
  rejected: boolean;
  note: string;
}

export function DetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  useManagerBadges();
  const q = useQuery({ queryKey: ['requisition', id], queryFn: () => api.get<Requisition>(`/requisitions/${id}`) });
  const conv = useQuery({ queryKey: ['req-conv', id], queryFn: () => api.get<{ id: string }>(`/requisitions/${id}/conversation`), enabled: !!q.data });
  const r = q.data;
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [fulfillOpen, setFulfillOpen] = useState(false);

  // Marcar como vista al abrir
  useEffect(() => {
    if (r?.status === 'ENVIADA') {
      api
        .post<Requisition>(`/requisitions/${r.id}/seen`)
        .then((x) => upsertRequisition(qc, x))
        .catch(() => undefined);
    }
  }, [r?.id, r?.status, qc]);

  useEffect(() => {
    if (!r) return;
    setEdits(Object.fromEntries(r.items.map((i) => [i.id, { approvedQty: i.approvedQty ?? i.requestedQty, rejected: i.rejected, note: i.reviewNote ?? '' }])));
  }, [r?.id, r?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const reviewing = r?.status === 'ENVIADA' || r?.status === 'VISTA';
  const hasChanges = useMemo(
    () => !!r && r.items.some((i) => {
      const e = edits[i.id];
      return e && (e.rejected || Math.abs(e.approvedQty - i.requestedQty) > 1e-9 || !!e.note.trim());
    }),
    [r, edits],
  );

  if (q.isLoading) return <PageLoader />;
  if (q.error || !r) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const run = async (key: string, fn: () => Promise<Requisition>, msg: string) => {
    setBusy(key);
    try {
      const x = await fn();
      upsertRequisition(qc, x);
      sounds.success();
      toast.success(msg);
    } catch (e) {
      sounds.error();
      toast.fromError(e);
    } finally {
      setBusy(null);
    }
  };

  const approveAll = () => run('all', () => api.post(`/requisitions/${r.id}/review`, { action: 'APPROVE_ALL' }), 'Aprobada completa');
  const approveChanges = () =>
    run(
      'changes',
      () =>
        api.post(`/requisitions/${r.id}/review`, {
          action: 'APPROVE',
          items: r.items.map((i) => ({ id: i.id, approvedQty: edits[i.id]?.rejected ? 0 : edits[i.id]?.approvedQty ?? i.requestedQty, note: edits[i.id]?.note.trim() || undefined })),
        }),
      'Aprobada con cambios',
    );
  const reject = async () => {
    const reason = await confirm({ title: `Rechazar ${r.folio}`, description: 'El área verá el motivo en su tablet.', danger: true, confirmText: 'Rechazar', input: { label: 'Motivo', placeholder: 'Ej. ya hay suficiente en almacén', required: true } });
    if (!reason) return;
    await run('reject', () => api.post(`/requisitions/${r.id}/review`, { action: 'REJECT', reason }), 'Requisición rechazada');
  };
  const cancel = async () => {
    const reason = await confirm({ title: `Cancelar ${r.folio}`, danger: true, confirmText: 'Cancelar requisición', cancelText: 'Volver', input: { label: 'Motivo (opcional)' } });
    if (!reason) return;
    await run('cancel', () => api.post(`/requisitions/${r.id}/cancel`, { reason: reason === 'ok' ? undefined : reason }), 'Requisición cancelada');
  };

  const timeline: [string, string | null][] = [
    ['Enviada', r.createdAt],
    ['Vista', r.seenAt],
    [r.status === 'RECHAZADA' ? 'Rechazada' : 'Revisada', r.reviewedAt],
    ['En compra', r.purchasingAt],
    ['Surtida', r.fulfilledAt],
    ['Recibida', r.receivedAt],
    ['Cancelada', r.cancelledAt],
  ];

  return (
    <div className="mx-auto max-w-6xl pb-32 lg:pb-0">
      <Link to="/admin/requisiciones" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-mute hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Requisiciones
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <AreaBadge area={r.area} size={52} />
        <div className="min-w-0 flex-1 basis-[60%]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="h-display text-2xl font-bold sm:text-3xl">{r.area.name}</h1>
            <span className="h-display text-xl font-semibold text-ink-mute">{r.folio}</span>
            <StatusPill status={r.status} big />
            {r.priority === 'URGENTE' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2.5 py-1 text-xs font-black uppercase text-white">
                <AlertTriangle className="h-3.5 w-3.5" /> Urgente
              </span>
            )}
            {r.isLate && <span className="rounded-full bg-warn/15 px-2.5 py-1 text-xs font-bold text-warn">Fuera de horario</span>}
          </div>
          <p className="text-sm text-ink-mute">
            {fmtDateTime(r.createdAt)} · {timeAgo(r.createdAt)}
            {r.createdByName ? ` · pidió ${r.createdByName}` : ''}
          </p>
        </div>
        {['ENVIADA', 'VISTA', 'APROBADA', 'APROBADA_PARCIAL', 'EN_COMPRA'].includes(r.status) && (
          <Button size="sm" variant="ghost" className="text-ink-mute max-sm:order-last max-sm:-ml-3" loading={busy === 'cancel'} icon={<X className="h-4 w-4" />} onClick={cancel}>
            Cancelar requisición
          </Button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {r.note && <div className="rounded-2xl border border-line bg-surface-sunken/60 px-4 py-3 text-ink-soft"><span className="text-xs font-semibold uppercase text-ink-mute">Nota del área</span><p className="italic">“{r.note}”</p></div>}
          {r.rejectReason && <div className="rounded-2xl bg-danger/10 px-4 py-3 font-medium text-danger">Motivo del rechazo: {r.rejectReason}</div>}
          {r.cancelReason && <div className="rounded-2xl bg-surface-sunken px-4 py-3 text-ink-soft">Cancelada: {r.cancelReason}</div>}
          {r.hasDifferences && (
            <div className="flex items-center gap-2 rounded-2xl bg-warn/10 px-4 py-3 font-medium text-warn">
              <AlertTriangle className="h-5 w-5" /> Recibido con diferencias{r.receptionNote ? ` — “${r.receptionNote}”` : ''}
            </div>
          )}

          <section className="card divide-y divide-line">
            <header className="flex items-center justify-between px-4 py-3">
              <h2 className="font-display text-lg font-semibold">{r.items.length} {r.items.length === 1 ? 'insumo' : 'insumos'}</h2>
              {reviewing && <span className="text-xs text-ink-mute">Ajusta cantidades o rechaza renglones</span>}
            </header>
            {r.items.map((i) => {
              const e = edits[i.id] ?? { approvedQty: i.requestedQty, rejected: i.rejected, note: '' };
              const changed = !e.rejected && Math.abs(e.approvedQty - i.requestedQty) > 1e-9;
              const recvDiff = i.receivedQty != null && Math.abs(i.receivedQty - (i.fulfilledQty ?? i.approvedQty ?? 0)) > 1e-9;
              return (
                <div key={i.id} className={clsx('flex flex-wrap items-center gap-3 px-4 py-3', e.rejected && 'bg-danger/[0.05]')}>
                  <SupplyIcon icon={i.icon} imageUrl={assetUrl(i.imageUrl)} label={i.supplyName} size={48} />
                  <div className="min-w-[9rem] flex-1">
                    <p className={clsx('font-semibold', e.rejected && 'text-ink-mute line-through')}>{i.supplyName}</p>
                    <p className="text-sm text-ink-mute">
                      Pidió <b className="text-ink">{qtyLabel(i.requestedQty, i.unit)}</b>
                      {!reviewing && i.approvedQty != null && !i.rejected && (
                        <>
                          {' · '}Aprobado <b className={clsx(Math.abs(i.approvedQty - i.requestedQty) > 1e-9 ? 'text-warn' : 'text-ink')}>{qtyLabel(i.approvedQty, i.unit)}</b>
                        </>
                      )}
                      {i.fulfilledQty != null && <> · Surtido <b className="text-ink">{qtyLabel(i.fulfilledQty, i.unit)}</b></>}
                      {i.receivedQty != null && <> · Recibido <b className={recvDiff ? 'text-warn' : 'text-ink'}>{qtyLabel(i.receivedQty, i.unit)}</b></>}
                      {i.purchased && !i.fulfilledQty && <span className="ml-1 text-ok">· Comprado</span>}
                    </p>
                    {i.note && <p className="text-sm italic text-ink-soft">“{i.note}”</p>}
                    {!reviewing && i.reviewNote && <p className="text-sm text-info">Tu nota: {i.reviewNote}</p>}
                    {!reviewing && i.rejected && <p className="text-sm font-semibold text-danger">No aprobado</p>}
                    {reviewing && (changed || e.rejected || e.note) && (
                      <input
                        className="mt-1 h-8 w-full rounded-lg border border-line bg-surface-raised px-2 text-sm"
                        placeholder="Nota para el área (opcional)"
                        value={e.note}
                        onChange={(ev) => setEdits({ ...edits, [i.id]: { ...e, note: ev.target.value.slice(0, 200) } })}
                      />
                    )}
                  </div>
                  {reviewing && (
                    <div className="flex items-center gap-2">
                      <QtyStepper value={e.approvedQty} unit={i.unit} disabled={e.rejected} onChange={(v) => setEdits({ ...edits, [i.id]: { ...e, approvedQty: v, rejected: v <= 0 ? true : e.rejected } })} />
                      <button
                        onClick={() => setEdits({ ...edits, [i.id]: { ...e, rejected: !e.rejected, approvedQty: e.rejected && e.approvedQty <= 0 ? i.requestedQty : e.approvedQty } })}
                        className={clsx('grid h-10 w-10 place-items-center rounded-xl border transition', e.rejected ? 'border-danger bg-danger text-white' : 'border-line text-ink-mute hover:text-danger')}
                        aria-label={e.rejected ? 'Volver a incluir' : 'Rechazar renglón'}
                        title={e.rejected ? 'Volver a incluir' : 'Rechazar renglón'}
                      >
                        {e.rejected ? <RotateCcw className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* Acciones */}
          {['ENVIADA', 'VISTA', 'APROBADA', 'APROBADA_PARCIAL', 'EN_COMPRA', 'SURTIDA'].includes(r.status) && (
          <div className="fixed inset-x-0 bottom-[60px] z-20 border-t border-line bg-surface-raised/95 p-3 backdrop-blur lg:static lg:rounded-2xl lg:border lg:p-4">
            <div className="flex flex-wrap gap-2">
              {reviewing && (
                <>
                  {hasChanges ? (
                    <Button size="lg" className="flex-1" variant="success" loading={busy === 'changes'} icon={<Check className="h-5 w-5" />} onClick={approveChanges}>
                      Aprobar con cambios
                    </Button>
                  ) : (
                    <Button size="lg" className="flex-1" variant="success" loading={busy === 'all'} icon={<CheckCheck className="h-5 w-5" />} onClick={approveAll}>
                      Aprobar todo
                    </Button>
                  )}
                  {hasChanges && (
                    <Button size="lg" variant="outline" className="max-sm:hidden" loading={busy === 'all'} onClick={approveAll}>
                      Aprobar todo
                    </Button>
                  )}
                  <Button size="lg" variant="outline" className="text-danger" loading={busy === 'reject'} icon={<Ban className="h-5 w-5" />} onClick={reject}>
                    Rechazar
                  </Button>
                </>
              )}
              {(r.status === 'APROBADA' || r.status === 'APROBADA_PARCIAL') && (
                <Button size="lg" className="flex-1" loading={busy === 'purchasing'} icon={<ShoppingCart className="h-5 w-5" />} onClick={() => run('purchasing', () => api.post(`/requisitions/${r.id}/purchasing`), 'Marcada en compra')}>
                  Marcar en compra
                </Button>
              )}
              {(r.status === 'APROBADA' || r.status === 'APROBADA_PARCIAL' || r.status === 'EN_COMPRA') && (
                <Button size="lg" className="flex-1" variant={r.status === 'EN_COMPRA' ? 'primary' : 'outline'} icon={<Truck className="h-5 w-5" />} onClick={() => setFulfillOpen(true)}>
                  Marcar surtida
                </Button>
              )}
              {r.status === 'SURTIDA' && <p className="flex-1 py-2 text-sm text-ink-mute">Esperando que {r.area.name} confirme la recepción.</p>}
            </div>
          </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-3 font-display text-lg font-semibold">Línea de tiempo</h2>
            <ol className="space-y-0">
              {timeline
                .filter(([label, at]) => at || (label !== 'Cancelada' && r.status !== 'CANCELADA' && r.status !== 'RECHAZADA'))
                .map(([label, at], idx, arr) => (
                  <li key={label} className="relative flex gap-3 pb-4 last:pb-0">
                    {idx < arr.length - 1 && <span className={clsx('absolute left-[9px] top-5 h-full w-0.5', at ? 'bg-brand' : 'bg-line')} />}
                    <span className={clsx('relative z-[1] mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', at ? 'bg-brand text-white' : 'border-2 border-line bg-surface-raised')}>
                      {at && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <div className="flex-1">
                      <p className={clsx('text-sm font-semibold', !at && 'text-ink-mute')}>{label}</p>
                      {at && <p className="text-xs text-ink-mute">{fmtTime(at)} · {timeAgo(at)}</p>}
                    </div>
                  </li>
                ))}
            </ol>
          </section>
          <section className="card flex h-[460px] flex-col overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 font-display text-lg font-semibold">Dudas con {r.area.name}</h2>
            {conv.data ? (
              <ChatThread conversationId={conv.data.id} mySide="MANAGER" showQuick={false} className="flex-1" />
            ) : (
              <PageLoader />
            )}
          </section>
        </aside>
      </div>

      {fulfillOpen && <FulfillModal r={r} onClose={() => setFulfillOpen(false)} onDone={(x) => upsertRequisition(qc, x)} />}
    </div>
  );
}

function FulfillModal({ r, onClose, onDone }: { r: Requisition; onClose: () => void; onDone: (r: Requisition) => void }) {
  const lines = r.items.filter((i) => !i.rejected);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((i) => [i.id, i.approvedQty ?? i.requestedQty])));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const x = await api.post<Requisition>(`/requisitions/${r.id}/fulfill`, { items: lines.map((i) => ({ id: i.id, fulfilledQty: qty[i.id] })) });
      onDone(x);
      sounds.success();
      toast.success('Marcada como surtida', `${r.area.name} confirmará la recepción`);
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
      size="md"
      title={`Surtir ${r.folio}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} icon={<PackageCheck className="h-4 w-4" />} onClick={save}>Marcar surtida</Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-mute">¿Cuánto se entregó de cada insumo?</p>
      <div className="space-y-2">
        {lines.map((i) => {
          const exp = i.approvedQty ?? i.requestedQty;
          const v = qty[i.id];
          return (
            <div key={i.id} className={clsx('flex items-center gap-3 rounded-xl p-2', Math.abs(v - exp) > 1e-9 ? 'bg-warn/10' : 'bg-surface-sunken/60')}>
              <SupplyIcon icon={i.icon} imageUrl={assetUrl(i.imageUrl)} label={i.supplyName} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{i.supplyName}</p>
                <p className="text-xs text-ink-mute">Aprobado {qtyLabel(exp, i.unit)}</p>
              </div>
              <QtyStepper value={v} unit={i.unit} onChange={(n) => setQty({ ...qty, [i.id]: n })} />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
