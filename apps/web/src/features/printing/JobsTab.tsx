import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, RotateCcw, X, ListOrdered } from 'lucide-react';
import { RT } from '@rh/shared';
import type { PrintDocument } from '@rh/printing';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/socket';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { previewDocumentHtml } from '@/platform';
import { Badge, EmptyState, ErrorState, IconButton, Select, Skeleton, toast } from '@/ui';
import { JOB_KIND_LABEL, JOB_STATUS, usePrinters, type JobStatus, type PrintJob } from './api';

export function JobsTab() {
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [printerId, setPrinterId] = useState('');
  const qc = useQueryClient();
  const printers = usePrinters();
  const key = ['printing', 'jobs', status, printerId];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<PrintJob[]>('/printing/jobs', { status: status || undefined, printerId: printerId || undefined, limit: 100 }), refetchInterval: 60_000 });
  useRealtime<PrintJob>(RT.PRINT_JOB_UPDATED, (j) => {
    qc.setQueryData<PrintJob[]>(key, (old) => {
      if (!old) return old;
      const i = old.findIndex((x) => x.id === j.id);
      if (i >= 0) return old.map((x) => (x.id === j.id ? { ...x, ...j } : x));
      if ((status && j.status !== status) || (printerId && j.printerId !== printerId)) return old;
      return [j, ...old].slice(0, 100);
    });
  });

  const act = async (j: PrintJob, what: 'retry' | 'cancel') => {
    try {
      await api.post(`/printing/jobs/${j.id}/${what}`);
      toast.success(what === 'retry' ? 'Se volverá a imprimir' : 'Trabajo cancelado');
      void q.refetch();
    } catch (e) {
      toast.fromError(e);
    }
  };
  const preview = async (j: PrintJob) => {
    try {
      const d = await api.get<PrintJob & { document: PrintDocument }>(`/printing/jobs/${j.id}`);
      previewDocumentHtml(d.document);
    } catch (e) {
      toast.fromError(e);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <Select className="w-48" aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value as JobStatus | '')} placeholder="Todos los estados" options={Object.entries(JOB_STATUS).map(([v, s]) => ({ value: v, label: s.label }))} />
        <Select className="w-60" aria-label="Impresora" value={printerId} onChange={(e) => setPrinterId(e.target.value)} placeholder="Todas las impresoras" options={(printers.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
      </div>
      {q.isLoading ? <Skeleton className="h-48" /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <div className="card"><EmptyState icon={<ListOrdered className="h-7 w-7" />} title="No hay trabajos" description="Aquí aparecen comandas, cuentas y pruebas en cuanto se envían." /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="hidden w-full text-sm md:table">
            <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-mute">
              <tr><th className="px-4 py-2.5">Trabajo</th><th>Impresora</th><th>Estado</th><th>Intentos</th><th>Creado</th><th className="px-4 text-right">Acciones</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.map((j) => (
                <tr key={j.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{j.title || JOB_KIND_LABEL[j.kind]}</p>
                    <p className="text-xs text-ink-mute">{JOB_KIND_LABEL[j.kind] ?? j.kind}</p>
                    {j.error && <p className="text-xs text-danger">{j.error}</p>}
                  </td>
                  <td>{j.printerName ?? '—'}</td>
                  <td><Badge tone={JOB_STATUS[j.status].tone}>{JOB_STATUS[j.status].label}</Badge></td>
                  <td className="tabular-nums">{j.attempts}</td>
                  <td title={fmtDateTime(j.createdAt)}>{timeAgo(j.createdAt)}</td>
                  <td className="px-4"><Actions j={j} onAct={act} onPreview={preview} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-line md:hidden">
            {q.data.map((j) => (
              <li key={j.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{j.title || JOB_KIND_LABEL[j.kind]}</p>
                  <p className="text-xs text-ink-mute">{j.printerName} · {timeAgo(j.createdAt)} · {j.attempts} intento(s)</p>
                  {j.error && <p className="text-xs text-danger">{j.error}</p>}
                  <Badge className="mt-1" tone={JOB_STATUS[j.status].tone}>{JOB_STATUS[j.status].label}</Badge>
                </div>
                <Actions j={j} onAct={act} onPreview={preview} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Actions({ j, onAct, onPreview }: { j: PrintJob; onAct: (j: PrintJob, w: 'retry' | 'cancel') => void; onPreview: (j: PrintJob) => void }) {
  return (
    <div className="flex justify-end gap-1">
      <IconButton size="sm" label="Ver ticket" icon={<Eye className="h-4 w-4" />} onClick={() => onPreview(j)} />
      <IconButton size="sm" label={j.status === 'PRINTED' ? 'Reimprimir' : 'Reintentar'} icon={<RotateCcw className="h-4 w-4" />} onClick={() => onAct(j, 'retry')} />
      {(j.status === 'PENDING' || j.status === 'SENT' || j.status === 'FAILED') && <IconButton size="sm" label="Cancelar" icon={<X className="h-4 w-4 text-danger" />} onClick={() => onAct(j, 'cancel')} />}
    </div>
  );
}
