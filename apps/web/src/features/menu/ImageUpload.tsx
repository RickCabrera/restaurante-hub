import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { assetUrl } from '@/lib/config';
import { Spinner, toast } from '@/ui';

export function ImageUpload({ value, onChange, folder, label = 'Foto' }: { value: string | null; onChange: (url: string | null) => void; folder: string; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File) => {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return toast.error('La imagen es muy pesada (máx. 8 MB)');
    setBusy(true);
    try {
      const r = await api.upload(f, folder);
      onChange(r.url);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => ref.current?.click()} className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-surface-sunken text-ink-mute hover:border-brand/50" aria-label="Subir foto">
          {value ? <img src={assetUrl(value)} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-7 w-7" />}
          {busy && <span className="absolute inset-0 grid place-items-center bg-black/40 text-white"><Spinner /></span>}
        </button>
        <div className="space-y-1 text-sm">
          <button type="button" className="block font-semibold text-brand" onClick={() => ref.current?.click()}>{value ? 'Cambiar foto' : 'Subir foto'}</button>
          {value && <button type="button" className="flex items-center gap-1 text-danger" onClick={() => onChange(null)}><Trash2 className="h-3.5 w-3.5" />Quitar</button>}
          <p className="text-xs text-ink-mute">JPG o PNG, cuadrada se ve mejor.</p>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
