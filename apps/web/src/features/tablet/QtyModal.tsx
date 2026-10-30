import { useEffect, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { roundQty } from '@rh/shared';
import { SupplyIcon } from '@/icons/supplies';
import { assetUrl } from '@/lib/config';
import { Button, Modal, NumberPad } from '@/ui';
import { qtyLabel, unitShort } from '@/features/common-req/SupplyTile';
import type { CatalogSupply } from '@/features/common-req/types';

/** Cantidad exacta + nota (mantener presionado un insumo). */
export function QtyModal({
  supply,
  qty,
  note,
  onClose,
  onSave,
}: {
  supply: CatalogSupply | null;
  qty: number;
  note?: string;
  onClose: () => void;
  onSave: (qty: number, note: string) => void;
}) {
  const [val, setVal] = useState('');
  const [n, setN] = useState('');
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    if (supply) {
      setVal(qty ? String(qty) : '');
      setN(note ?? '');
      setFresh(true);
    }
  }, [supply, qty, note]);
  if (!supply) return null;
  const decimal = ['KG', 'L'].includes(supply.unit);
  const num = Number(val || 0);
  const max = supply.maxPerOrder ?? Infinity;
  const over = num > max;

  const key = (k: string) => {
    if (k === 'back') {
      setFresh(false);
      return setVal((v) => v.slice(0, -1));
    }
    setVal((v) => {
      const base = fresh ? '' : v;
      setFresh(false);
      if (k === '.' && base.includes('.')) return base;
      const next = base === '' && k === '.' ? '0.' : base + k;
      if (next.replace('.', '').length > 6) return base;
      const dec = next.split('.')[1];
      if (dec && dec.length > 2) return base;
      return next;
    });
  };
  const bump = (d: number) => {
    setFresh(false);
    setVal(String(Math.max(0, roundQty(num + d * supply.step))));
  };

  return (
    <Modal open onClose={onClose} size="md" title={supply.name}>
      <div className="flex items-center gap-4">
        <SupplyIcon icon={supply.icon} imageUrl={assetUrl(supply.imageUrl)} label={supply.name} size={72} />
        <div className="flex flex-1 items-center justify-center gap-3">
          <button onClick={() => bump(-1)} className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-sunken active:scale-90" aria-label="Menos">
            <Minus className="h-8 w-8" strokeWidth={3} />
          </button>
          <div className="min-w-[8rem] text-center">
            <p className={`h-display text-5xl font-bold ${over ? 'text-danger' : ''}`}>{val || '0'}</p>
            <p className="text-lg font-medium text-ink-mute">{unitShort(supply.unit)}</p>
          </div>
          <button onClick={() => bump(1)} className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-sunken active:scale-90" aria-label="Más">
            <Plus className="h-8 w-8" strokeWidth={3} />
          </button>
        </div>
      </div>
      {supply.maxPerOrder != null && (
        <p className={`mt-2 text-center text-sm ${over ? 'font-semibold text-danger' : 'text-ink-mute'}`}>Máximo por pedido: {qtyLabel(supply.maxPerOrder, supply.unit)}</p>
      )}
      <NumberPad allowDecimal={decimal} onKey={key} className="mt-4" />
      <label className="mt-4 block">
        <span className="label">Nota (opcional)</span>
        <input className="input h-14 text-lg" value={n} onChange={(e) => setN(e.target.value)} placeholder="Ej. bien maduros, saladet…" maxLength={200} />
      </label>
      <div className="mt-5 grid grid-cols-[auto_1fr] gap-3">
        <Button
          size="xl"
          variant="secondary"
          icon={<Trash2 className="h-6 w-6" />}
          onClick={() => {
            onSave(0, '');
            onClose();
          }}
        >
          Quitar
        </Button>
        <Button
          size="xl"
          disabled={over}
          onClick={() => {
            onSave(num, n.trim());
            onClose();
          }}
        >
          Listo
        </Button>
      </div>
    </Modal>
  );
}
