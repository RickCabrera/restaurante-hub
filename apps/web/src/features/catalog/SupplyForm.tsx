import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Camera, ImageOff, Smile } from 'lucide-react';
import { UnitLabel, UnitCode } from '@rh/shared';
import { api } from '@/lib/api';
import { assetUrl } from '@/lib/config';
import { IconPicker, SupplyIcon } from '@/icons/supplies';
import { Button, Input, Modal, Select, Toggle, toast } from '@/ui';
import type { Area, Category, Supplier, SupplyView } from '@/features/common-req/types';
import { AreaIcon } from '@/features/common-req/meta';

export const UNIT_OPTIONS = (Object.keys(UnitCode) as (keyof typeof UnitCode)[]).map((u) => ({ value: u, label: `${UnitLabel[u].one[0].toUpperCase()}${UnitLabel[u].one.slice(1)} (${UnitLabel[u].short})` }));

interface FormState {
  name: string;
  categoryId: string;
  unit: string;
  step: string;
  maxPerOrder: string;
  icon: string | null;
  imageUrl: string | null;
  supplierId: string;
  areaIds: string[];
  autoApprove: boolean;
  active: boolean;
}

export function SupplyForm({
  supply,
  open,
  onClose,
  onSaved,
  categories,
  suppliers,
  areas,
}: {
  supply: SupplyView | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  categories: Category[];
  suppliers: Supplier[];
  areas: Area[];
}) {
  const [f, setF] = useState<FormState>(() => blank());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function blank(): FormState {
    return { name: '', categoryId: categories[0]?.id ?? '', unit: 'KG', step: '1', maxPerOrder: '', icon: null, imageUrl: null, supplierId: '', areaIds: [], autoApprove: false, active: true };
  }

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      supply
        ? {
            name: supply.name,
            categoryId: supply.categoryId,
            unit: supply.unit,
            step: String(supply.step),
            maxPerOrder: supply.maxPerOrder != null ? String(supply.maxPerOrder) : '',
            icon: supply.icon,
            imageUrl: supply.imageUrl,
            supplierId: supply.supplierId ?? '',
            areaIds: supply.areaIds,
            autoApprove: supply.autoApprove,
            active: supply.active,
          }
        : blank(),
    );
  }, [open, supply]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.upload(file, 'supplies');
      setF((s) => ({ ...s, imageUrl: url }));
    } catch (e) {
      toast.fromError(e);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    const body = {
      name: f.name.trim(),
      categoryId: f.categoryId,
      unit: f.unit,
      step: Number(f.step) || 1,
      maxPerOrder: f.maxPerOrder ? Number(f.maxPerOrder) : null,
      icon: f.icon,
      imageUrl: f.imageUrl,
      supplierId: f.supplierId || null,
      areaIds: f.areaIds,
      autoApprove: f.autoApprove,
      active: f.active,
    };
    if (!body.name) return setErrors({ name: 'Escribe el nombre' });
    setBusy(true);
    try {
      if (supply) await api.patch(`/supplies/${supply.id}`, body);
      else await api.post('/supplies', body);
      toast.success(supply ? 'Insumo actualizado' : 'Insumo creado');
      onSaved();
      onClose();
    } catch (e) {
      const fe = (e as { fieldErrors?: Record<string, string> }).fieldErrors;
      if (fe && Object.keys(fe).length) setErrors(fe);
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={supply ? 'Editar insumo' : 'Nuevo insumo'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} onClick={save}>Guardar</Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
        <div className="flex flex-col items-center gap-2">
          <div className="grid h-36 w-36 place-items-center rounded-3xl border-2 border-dashed border-line bg-surface-sunken/50">
            <SupplyIcon icon={f.icon} imageUrl={assetUrl(f.imageUrl)} label={f.name || '?'} size={104} />
          </div>
          <div className="flex w-full gap-1.5">
            <Button size="sm" variant="outline" className="flex-1" icon={<Smile className="h-4 w-4" />} onClick={() => setIconOpen(true)}>
              Ícono
            </Button>
            <Button size="sm" variant="outline" className="flex-1" loading={uploading} icon={<Camera className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
              Foto
            </Button>
          </div>
          {f.imageUrl && (
            <button className="flex items-center gap-1 text-xs font-semibold text-ink-mute hover:text-danger" onClick={() => setF({ ...f, imageUrl: null })}>
              <ImageOff className="h-3.5 w-3.5" /> Quitar foto
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
        <div className="space-y-4">
          <Input label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errors.name} placeholder="Ej. Jitomate" autoFocus />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Categoría" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} options={categories.map((c) => ({ value: c.id, label: c.name }))} error={errors.categoryId} />
            <Select label="Proveedor" value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })} placeholder="Sin proveedor" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select label="Unidad" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} options={UNIT_OPTIONS} />
            <Input label="Por toque" inputMode="decimal" value={f.step} onChange={(e) => setF({ ...f, step: e.target.value.replace(',', '.') })} error={errors.step} hint="Ej. 1 o 0.5" />
            <Input label="Máx. por pedido" inputMode="decimal" value={f.maxPerOrder} onChange={(e) => setF({ ...f, maxPerOrder: e.target.value.replace(',', '.') })} placeholder="Sin límite" error={errors.maxPerOrder} />
          </div>
        </div>
      </div>

      <div className="mt-5">
        <span className="label">Áreas que lo pueden pedir</span>
        <div className="flex flex-wrap gap-2">
          {areas.map((a) => {
            const on = f.areaIds.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setF({ ...f, areaIds: on ? f.areaIds.filter((x) => x !== a.id) : [...f.areaIds, a.id] })}
                className={clsx('flex h-10 items-center gap-2 rounded-full border-2 px-3 text-sm font-semibold transition', on ? 'text-white' : 'border-line text-ink-soft')}
                style={on ? { background: a.color, borderColor: a.color } : undefined}
              >
                <AreaIcon icon={a.icon} className="h-4 w-4" />
                {a.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-5 space-y-3 rounded-2xl bg-surface-sunken/60 p-4">
        <Toggle checked={f.autoApprove} onChange={(v) => setF({ ...f, autoApprove: v })} label="Aprobar automáticamente" description="No necesita tu revisión (ej. hielo, garrafones)." />
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Activo" description="Si lo apagas, desaparece de las tablets." />
      </div>

      <Modal open={iconOpen} onClose={() => setIconOpen(false)} size="xl" title="Elige un ícono">
        <IconPicker
          value={f.icon}
          onChange={(k) => {
            setF({ ...f, icon: k, imageUrl: null });
            setIconOpen(false);
          }}
        />
      </Modal>
    </Modal>
  );
}
