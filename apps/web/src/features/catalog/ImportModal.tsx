import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Modal, toast } from '@/ui';

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  createdCategories: string[];
  createdSuppliers: string[];
  errors: { row: number; name: string; error: string }[];
  dryRun: boolean;
}

export function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setCsv(null);
    setPreview(null);
    setFileName('');
  };

  const pick = async (f?: File) => {
    if (!f) return;
    const text = await f.text();
    setCsv(text);
    setFileName(f.name);
    setBusy(true);
    try {
      setPreview(await api.post<ImportResult>('/supplies/import', { csv: text, dryRun: true }));
    } catch (e) {
      toast.fromError(e);
      reset();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!csv) return;
    setBusy(true);
    try {
      const r = await api.post<ImportResult>('/supplies/import', { csv });
      toast.success('Importación lista', `${r.created} nuevos · ${r.updated} actualizados${r.errors.length ? ` · ${r.errors.length} con error` : ''}`);
      onDone();
      reset();
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="lg"
      title="Importar insumos (CSV)"
      footer={
        <>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button disabled={!preview || preview.created + preview.updated === 0} loading={busy && !!preview} onClick={confirmImport}>
            Importar {preview ? preview.created + preview.updated : ''} insumos
          </Button>
        </>
      }
    >
      <ol className="space-y-4">
        <li className="flex gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">1</span>
          <div className="flex-1">
            <p className="font-semibold">Descarga la plantilla</p>
            <p className="text-sm text-ink-mute">Llénala en Excel o Google Sheets y guárdala como CSV.</p>
            <Button size="sm" variant="outline" className="mt-2" icon={<Download className="h-4 w-4" />} onClick={() => api.download('/supplies/import/template', 'plantilla_insumos.csv').catch(toast.fromError)}>
              Plantilla CSV
            </Button>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">2</span>
          <div className="flex-1">
            <p className="font-semibold">Sube tu archivo</p>
            <button onClick={() => fileRef.current?.click()} className="mt-2 flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-line px-4 py-6 text-ink-mute hover:border-brand hover:text-brand">
              <FileUp className="h-7 w-7" />
              <span className="text-sm font-semibold">{fileName || 'Elegir archivo .csv'}</span>
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
          </div>
        </li>
        {preview && (
          <li className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">3</span>
            <div className="min-w-0 flex-1 space-y-3">
              <p className="font-semibold">Revisa antes de importar</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-ok/10 p-2"><p className="h-display text-2xl font-bold text-ok">{preview.created}</p><p className="text-xs">nuevos</p></div>
                <div className="rounded-xl bg-info/10 p-2"><p className="h-display text-2xl font-bold text-info">{preview.updated}</p><p className="text-xs">actualizados</p></div>
                <div className="rounded-xl bg-danger/10 p-2"><p className="h-display text-2xl font-bold text-danger">{preview.errors.length}</p><p className="text-xs">con error</p></div>
              </div>
              {(preview.createdCategories.length > 0 || preview.createdSuppliers.length > 0) && (
                <p className="flex items-start gap-2 text-sm text-ink-soft">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                  Se crearán: {[...preview.createdCategories.map((c) => `categoría “${c}”`), ...preview.createdSuppliers.map((s) => `proveedor “${s}”`)].join(', ')}
                </p>
              )}
              {preview.errors.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-danger/30">
                  <p className="flex items-center gap-2 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
                    <AlertTriangle className="h-4 w-4" /> Estos renglones no se importarán
                  </p>
                  <div className="max-h-48 overflow-y-auto scroll-thin">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-sunken text-left text-xs text-ink-mute">
                        <tr><th className="px-3 py-1.5">Fila</th><th className="px-3 py-1.5">Insumo</th><th className="px-3 py-1.5">Error</th></tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {preview.errors.map((e) => (
                          <tr key={e.row}><td className="px-3 py-1.5 font-mono">{e.row}</td><td className="px-3 py-1.5">{e.name || '—'}</td><td className="px-3 py-1.5 text-danger">{e.error}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </li>
        )}
      </ol>
    </Modal>
  );
}
