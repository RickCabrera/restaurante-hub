import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Calculator, CheckCircle2, Lock, Printer, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { money, fmtDateTime } from '@/lib/format';
import { Button, EmptyState, ErrorState, Modal, PageLoader, toast } from '@/ui';
import { pesosToCents, useCurrentCash, usePosRole, type CashSession, type CashSummary } from './api';
import { CashSummaryView } from './components/CashSummaryView';
import { CashEntry, OpenCashModal } from './components/OpenCashModal';

export function CashPage() {
  const { canCash } = usePosRole();
  const cur = useCurrentCash(canCash);
  const [opening, setOpening] = useState(false);
  const [zResult, setZResult] = useState<ZResult | null>(null);
  const navigate = useNavigate();

  if (!canCash)
    return (
      <EmptyState className="h-full" icon={<Lock className="h-7 w-7" />} title="La caja es solo para cajeros" description="Pide a la cajera o al administrador que se identifique." action={<Button onClick={() => navigate('/pos')}>Volver a mesas</Button>} />
    );
  if (zResult) return <ZResultView result={zResult} onDone={() => { setZResult(null); navigate('/pos'); }} />;
  if (cur.isLoading) return <PageLoader label="Cargando caja…" />;
  if (cur.error) return <ErrorState error={cur.error} onRetry={() => cur.refetch()} />;

  if (!cur.data)
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-3xl bg-warn/15 text-warn"><Wallet className="h-10 w-10" /></span>
        <h1 className="h-display mt-4 text-3xl font-bold">Caja cerrada</h1>
        <p className="mt-1 max-w-sm text-ink-mute">Abre la caja con el fondo inicial para empezar a cobrar.</p>
        <Button size="xl" className="mt-6 min-w-[260px]" onClick={() => setOpening(true)}>Abrir caja</Button>
        <OpenCashModal open={opening} onClose={() => setOpening(false)} />
      </div>
    );

  return <OpenSession session={cur.data} onClosed={setZResult} />;
}

interface ZResult { session: CashSession; warnings: string[]; printJobs: number }

function ZResultView({ result, onDone }: { result: ZResult; onDone: () => void }) {
  const d = result.session.differenceCents ?? 0;
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="card w-full max-w-md p-6 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-ok" />
        <p className="h-display mt-2 text-2xl font-bold">Caja cerrada · Corte Z</p>
        <p className="text-sm text-ink-mute">{result.session.folio}{result.printJobs ? ' · corte enviado a la impresora' : ' · no hay impresora de caja configurada'}</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Stat label="Esperado" v={money(result.session.expectedCents)} />
          <Stat label="Contado" v={money(result.session.countedCents)} />
          <Stat label="Diferencia" v={`${d > 0 ? '+' : d < 0 ? '−' : ''}${money(Math.abs(d))}`} cls={d === 0 ? 'text-ok' : d > 0 ? 'text-info' : 'text-danger'} />
        </div>
        {result.warnings.map((w) => (
          <p key={w} className="mt-4 flex items-center gap-2 rounded-xl bg-warn/10 px-3 py-2 text-left text-sm font-medium text-warn">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {w}
          </p>
        ))}
        <Button size="xl" block className="mt-5" onClick={onDone}>Listo</Button>
      </div>
    </div>
  );
}

function OpenSession({ session, onClosed }: { session: CashSession; onClosed: (r: ZResult) => void }) {
  const qc = useQueryClient();
  const sum = useQuery({
    queryKey: ['pos', 'cash', 'summary', session.id],
    queryFn: () => api.get<CashSummary>(`/pos/cash-sessions/${session.id}/summary`),
    initialData: session.summary,
    refetchInterval: 30_000,
  });
  const [mov, setMov] = useState<null | 'ENTRADA' | 'SALIDA'>(null);
  const [closing, setClosing] = useState(false);
  const [busyX, setBusyX] = useState(false);

  const cutX = async () => {
    setBusyX(true);
    try {
      const r = await api.post<{ printJobs: number }>(`/pos/cash-sessions/${session.id}/cut-x`);
      toast.success('Corte X generado', r.printJobs ? 'Enviado a la impresora' : 'No hay impresora de caja configurada');
      void sum.refetch();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusyX(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-ok"><span className="h-2.5 w-2.5 rounded-full bg-ok" /> Caja abierta</p>
            <h1 className="h-display text-3xl font-bold">{session.folio} · {session.cashierName}</h1>
            <p className="text-sm text-ink-mute">Desde {fmtDateTime(session.openedAt)} · fondo {money(session.openingCents)}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
            <Button size="lg" variant="outline" icon={<ArrowDownCircle className="h-5 w-5 text-ok" />} onClick={() => setMov('ENTRADA')}>Entrada</Button>
            <Button size="lg" variant="outline" icon={<ArrowUpCircle className="h-5 w-5 text-danger" />} onClick={() => setMov('SALIDA')}>Salida</Button>
            <Button size="lg" variant="outline" icon={<Printer className="h-5 w-5" />} loading={busyX} onClick={cutX}>Corte X</Button>
            <Button size="lg" variant="danger" icon={<Lock className="h-5 w-5" />} onClick={() => setClosing(true)}>Cerrar caja</Button>
          </div>
        </div>
        {sum.data ? <CashSummaryView s={sum.data} /> : <PageLoader />}
      </div>
      <MovementModal sessionId={session.id} type={mov} onClose={() => setMov(null)} onDone={() => void sum.refetch()} />
      {closing && sum.data && (
        <CloseCashModal
          session={session}
          summary={sum.data}
          onClose={() => setClosing(false)}
          onClosed={(r) => {
            onClosed(r);
            void qc.invalidateQueries({ queryKey: ['pos', 'cash'] });
          }}
        />
      )}
    </div>
  );
}

function MovementModal({ sessionId, type, onClose, onDone }: { sessionId: string; type: null | 'ENTRADA' | 'SALIDA'; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (type) {
      setV('');
      setReason('');
    }
  }, [type]);
  const reasons = type === 'ENTRADA' ? ['Cambio', 'Corte de repartidor', 'Otro'] : ['Pago a proveedor', 'Compra de insumos', 'Retiro', 'Repartidor'];
  const submit = async () => {
    if (!pesosToCents(v)) return toast.error('Captura el monto');
    if (!reason.trim()) return toast.error('Captura el motivo');
    setBusy(true);
    try {
      await api.post(`/pos/cash-sessions/${sessionId}/movements`, { type, amountCents: pesosToCents(v), reason: reason.trim() });
      toast.success(type === 'ENTRADA' ? 'Entrada registrada' : 'Salida registrada');
      onDone();
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!type} onClose={onClose} size="md" title={type === 'ENTRADA' ? 'Entrada de efectivo' : 'Salida de efectivo'} footer={<Button size="xl" block variant={type === 'ENTRADA' ? 'success' : 'danger'} loading={busy} onClick={submit}>Registrar {money(pesosToCents(v))}</Button>}>
      <CashEntry value={v} onChange={setV} label="Monto" />
      <label className="mt-4 block">
        <span className="label">Motivo</span>
        <input className="input h-12" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="¿Para qué?" />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {reasons.map((r) => (
          <button key={r} onClick={() => setReason(r)} className="h-9 rounded-full bg-surface-sunken px-3 text-xs font-semibold text-ink-soft">{r}</button>
        ))}
      </div>
    </Modal>
  );
}

const BILLS = [100000, 50000, 20000, 10000, 5000, 2000];
const COINS = [1000, 500, 200, 100, 50];

function CloseCashModal({ session, summary, onClose, onClosed }: { session: CashSession; summary: CashSummary; onClose: () => void; onClosed: (r: ZResult) => void }) {
  const [mode, setMode] = useState<'total' | 'denom'>('total');
  const [v, setV] = useState('');
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const denomTotal = useMemo(() => Object.entries(counts).reduce((s, [d, n]) => s + Number(d) * n, 0), [counts]);
  const counted = mode === 'total' ? pesosToCents(v) : denomTotal;
  const diff = counted - summary.expectedCashCents;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post<ZResult>(`/pos/cash-sessions/${session.id}/close`, { countedCents: counted, notes: notes.trim() || undefined });
      onClose();
      onClosed(r);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="xl" title="Cerrar caja · Corte Z">
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1">
            <button onClick={() => setMode('total')} className={clsx('h-11 rounded-lg font-semibold', mode === 'total' ? 'bg-surface-raised shadow-sm' : 'text-ink-mute')}>Total contado</button>
            <button onClick={() => setMode('denom')} className={clsx('flex h-11 items-center justify-center gap-1.5 rounded-lg font-semibold', mode === 'denom' ? 'bg-surface-raised shadow-sm' : 'text-ink-mute')}><Calculator className="h-4 w-4" /> Por billetes</button>
          </div>
          {mode === 'total' ? (
            <CashEntry value={v} onChange={setV} label="Efectivo contado en el cajón" />
          ) : (
            <div className="space-y-3">
              <DenomGroup title="Billetes" values={BILLS} counts={counts} setCounts={setCounts} />
              <DenomGroup title="Monedas" values={COINS} counts={counts} setCounts={setCounts} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Esperado" v={money(summary.expectedCashCents)} />
            <Stat label="Contado" v={money(counted)} />
          </div>
          <div className={clsx('rounded-3xl p-5 text-center', diff === 0 ? 'bg-ok/10' : diff > 0 ? 'bg-info/10' : 'bg-danger/10')}>
            <p className={clsx('text-sm font-semibold uppercase tracking-wide', diff === 0 ? 'text-ok' : diff > 0 ? 'text-info' : 'text-danger')}>
              {diff === 0 ? 'Cuadra exacto' : diff > 0 ? 'Sobra' : 'Falta'}
            </p>
            <p className={clsx('h-display text-5xl font-bold tabular-nums', diff === 0 ? 'text-ok' : diff > 0 ? 'text-info' : 'text-danger')}>{money(Math.abs(diff))}</p>
          </div>
          <CashSummaryView s={summary} compact />
          <label className="block">
            <span className="label">Notas (opcional)</span>
            <textarea className="input h-auto py-2" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <Button size="xl" variant="danger" block loading={busy} onClick={submit}>Cerrar caja con {money(counted)}</Button>
        </div>
      </div>
    </Modal>
  );
}

function DenomGroup({ title, values, counts, setCounts }: { title: string; values: number[]; counts: Record<number, number>; setCounts: (f: (c: Record<number, number>) => Record<number, number>) => void }) {
  return (
    <section>
      <h4 className="mb-1.5 text-sm font-semibold text-ink-mute">{title}</h4>
      <div className="space-y-1.5">
        {values.map((d) => {
          const n = counts[d] ?? 0;
          return (
            <div key={d} className="flex items-center gap-2">
              <span className="h-display w-20 text-right text-lg font-bold tabular-nums">{money(d).replace('.00', '')}</span>
              <span className="text-ink-mute">×</span>
              <button aria-label={`Menos ${money(d)}`} onClick={() => setCounts((c) => ({ ...c, [d]: Math.max(0, n - 1) }))} className="grid h-11 w-11 place-items-center rounded-xl bg-surface-sunken text-xl font-bold">−</button>
              <input
                aria-label={`Cantidad de ${money(d)}`}
                inputMode="numeric"
                className="input h-11 w-16 text-center text-lg font-bold"
                value={n || ''}
                placeholder="0"
                onChange={(e) => setCounts((c) => ({ ...c, [d]: Math.min(9999, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)) }))}
              />
              <button aria-label={`Más ${money(d)}`} onClick={() => setCounts((c) => ({ ...c, [d]: n + 1 }))} className="grid h-11 w-11 place-items-center rounded-xl bg-surface-sunken text-xl font-bold">+</button>
              <span className="ml-auto text-sm tabular-nums text-ink-mute">{money(d * n)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, v, cls }: { label: string; v: string; cls?: string }) {
  return (
    <div className="rounded-2xl bg-surface-sunken p-3 text-center">
      <p className="text-xs text-ink-mute">{label}</p>
      <p className={clsx('h-display text-xl font-bold tabular-nums', cls)}>{v}</p>
    </div>
  );
}
