import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, Minus, Plus } from 'lucide-react';
import { money } from '@/lib/format';
import { Button, Modal } from '@/ui';
import type { PosModifierGroup, PosProduct } from '../api';

export interface CartLine {
  productId: string;
  quantity: number;
  modifiers: { modifierId: string; quantity: number }[];
  note?: string;
}

/** Selección de modificadores (min/max por grupo), nota y cantidad. */
export function ProductModal({ product, onClose, onAdd, busy }: { product: PosProduct | null; onClose: () => void; onAdd: (l: CartLine) => void; busy?: boolean }) {
  const [sel, setSel] = useState<Record<string, number>>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    setSel({});
    setQty(1);
    setNote('');
    setTried(false);
  }, [product?.id]);

  const groupCount = (g: PosModifierGroup) => g.modifiers.reduce((s, m) => s + (sel[m.id] ?? 0), 0);
  const invalid = useMemo(
    () => (product?.modifierGroups ?? []).filter((g) => groupCount(g) < g.minSelect || (g.maxSelect > 0 && groupCount(g) > g.maxSelect)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product, sel],
  );
  const unit = useMemo(() => {
    if (!product) return 0;
    let c = product.priceCents;
    for (const g of product.modifierGroups) for (const m of g.modifiers) c += (sel[m.id] ?? 0) * m.priceCents;
    return c;
  }, [product, sel]);

  if (!product) return null;

  const toggle = (g: PosModifierGroup, id: string) => {
    setSel((s) => {
      const next = { ...s };
      if (g.maxSelect === 1) {
        for (const m of g.modifiers) delete next[m.id];
        if (!s[id]) next[id] = 1;
        else if (g.minSelect === 0) delete next[id];
        else next[id] = 1;
        return next;
      }
      if (next[id]) delete next[id];
      else if (g.maxSelect === 0 || groupCount(g) < g.maxSelect) next[id] = 1;
      return next;
    });
  };
  const bump = (g: PosModifierGroup, id: string, d: number) => {
    setSel((s) => {
      const cur = s[id] ?? 0;
      const n = cur + d;
      if (n < 0) return s;
      if (d > 0 && g.maxSelect > 0 && groupCount(g) >= g.maxSelect) return s;
      const next = { ...s };
      if (n === 0) delete next[id];
      else next[id] = n;
      return next;
    });
  };

  const add = () => {
    setTried(true);
    if (invalid.length) return;
    onAdd({
      productId: product.id,
      quantity: qty,
      modifiers: Object.entries(sel).filter(([, q]) => q > 0).map(([modifierId, quantity]) => ({ modifierId, quantity })),
      note: note.trim() || undefined,
    });
  };

  const rule = (g: PosModifierGroup) => {
    if (g.minSelect === 1 && g.maxSelect === 1) return 'Elige 1 · obligatorio';
    if (g.minSelect > 0 && g.maxSelect > 0) return `Elige de ${g.minSelect} a ${g.maxSelect}`;
    if (g.minSelect > 0) return `Elige al menos ${g.minSelect}`;
    if (g.maxSelect > 0) return `Opcional · hasta ${g.maxSelect}`;
    return 'Opcional';
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={product.name}
      footer={
        <div className="flex w-full items-center gap-3">
          <div className="flex items-center gap-1 rounded-2xl bg-surface-sunken p-1">
            <button aria-label="Menos" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-12 w-12 place-items-center rounded-xl active:bg-line">
              <Minus className="h-5 w-5" />
            </button>
            <span className="h-display w-10 text-center text-2xl font-bold tabular-nums">{qty}</span>
            <button aria-label="Más" onClick={() => setQty((q) => Math.min(99, q + 1))} className="grid h-12 w-12 place-items-center rounded-xl active:bg-line">
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <Button size="xl" className="flex-1" loading={busy} onClick={add}>
            Agregar · {money(unit * qty)}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {product.modifierGroups.map((g) => {
          const bad = tried && invalid.includes(g);
          const multi = g.maxSelect !== 1;
          return (
            <section key={g.id}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold">{g.name}</h3>
                <span className={clsx('text-xs font-semibold', bad ? 'text-danger' : g.minSelect > 0 ? 'text-brand' : 'text-ink-mute')}>
                  {rule(g)} {multi && g.maxSelect > 0 ? `(${groupCount(g)}/${g.maxSelect})` : ''}
                </span>
              </div>
              <div className={clsx('grid grid-cols-2 gap-2 sm:grid-cols-3', bad && 'rounded-2xl ring-2 ring-danger/60 ring-offset-2 ring-offset-surface-raised')}>
                {g.modifiers.map((m) => {
                  const q = sel[m.id] ?? 0;
                  const on = q > 0;
                  return (
                    <div
                      key={m.id}
                      className={clsx(
                        'relative flex min-h-[60px] items-center rounded-2xl border-2 transition',
                        on ? 'border-brand bg-brand/10' : 'border-line bg-surface-raised',
                        !m.available && 'opacity-40',
                      )}
                    >
                      <button disabled={!m.available} onClick={() => toggle(g, m.id)} className="flex h-full min-h-[56px] flex-1 items-center gap-2 px-3 text-left">
                        <span
                          className={clsx(
                            'grid h-6 w-6 shrink-0 place-items-center border-2',
                            multi ? 'rounded-md' : 'rounded-full',
                            on ? 'border-brand bg-brand text-white' : 'border-line',
                          )}
                        >
                          {on && <Check className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold leading-tight">{m.name}</span>
                          <span className="block text-xs text-ink-mute">{m.priceCents ? `+${money(m.priceCents)}` : m.available ? 'Sin costo' : 'Agotado'}</span>
                        </span>
                      </button>
                      {multi && on && (
                        <span className="flex items-center pr-1">
                          <button aria-label={`Menos ${m.name}`} onClick={() => bump(g, m.id, -1)} className="grid h-10 w-9 place-items-center rounded-lg active:bg-line">
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-4 text-center text-sm font-bold">{q}</span>
                          <button aria-label={`Más ${m.name}`} onClick={() => bump(g, m.id, 1)} className="grid h-10 w-9 place-items-center rounded-lg active:bg-line">
                            <Plus className="h-4 w-4" />
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        <section>
          <h3 className="mb-2 text-base font-semibold">Nota para cocina</h3>
          <input className="input h-12" maxLength={200} placeholder="Ej. sin cebolla, bien dorado" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2">
            {['Sin cebolla', 'Sin chile', 'Para llevar', 'Aparte'].map((n) => (
              <button key={n} onClick={() => setNote((v) => (v ? `${v}, ${n.toLowerCase()}` : n))} className="h-9 rounded-full bg-surface-sunken px-3 text-xs font-semibold text-ink-soft">
                + {n}
              </button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
