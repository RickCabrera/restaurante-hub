/**
 * delivery-common/ProductModal — Selector de modificadores de un producto con validación min/max.
 *
 * Exporta:
 * - `<ProductModal product open onClose onAdd(line, unitTotalCents, summary) initial? addLabel? />`
 *     product: MenuProduct (de GET /menu o /public/:slug/menu). Hace cumplir minSelect/maxSelect por grupo,
 *     modificadores agotados deshabilitados, cantidad y nota. `onAdd` recibe un CartLine listo para cotizar.
 * - `groupRuleText(group)` → "Obligatorio · elige 1" | "Opcional · hasta 3" | ...
 * - `validateSelection(product, selected)` → string | null (mensaje del primer error)
 * - `lineUnitCents(product, modifierIds)` → precio unitario con modificadores
 */
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, Minus, Plus } from 'lucide-react';
import { Button, Modal, Textarea } from '@/ui';
import { money } from '@/lib/format';
import { assetUrl } from '@/lib/config';
import type { CartLine, MenuModifierGroup, MenuProduct } from './types';

export function groupRuleText(g: Pick<MenuModifierGroup, 'minSelect' | 'maxSelect'>): string {
  const { minSelect: min, maxSelect: max } = g;
  if (min > 0 && min === max) return `Obligatorio · elige ${min}`;
  if (min > 0) return `Obligatorio · elige de ${min} a ${max}`;
  if (max === 1) return 'Opcional · elige 1';
  return `Opcional · hasta ${max}`;
}

export function validateSelection(product: MenuProduct, selected: Record<string, string[]>): string | null {
  for (const g of product.modifierGroups) {
    const n = selected[g.id]?.length ?? 0;
    if (n < g.minSelect) return `Elige ${g.minSelect === 1 ? 'una opción' : `${g.minSelect} opciones`} en “${g.name}”`;
    if (n > g.maxSelect) return `Máximo ${g.maxSelect} en “${g.name}”`;
  }
  return null;
}

export function lineUnitCents(product: MenuProduct, modifierIds: string[]): number {
  const mods = product.modifierGroups.flatMap((g) => g.modifiers);
  return product.priceCents + modifierIds.reduce((s, id) => s + (mods.find((m) => m.id === id)?.priceCents ?? 0), 0);
}

export function ProductModal({
  product,
  open,
  onClose,
  onAdd,
  initial,
  addLabel = 'Agregar',
}: {
  product: MenuProduct | null;
  open: boolean;
  onClose: () => void;
  onAdd: (line: CartLine, unitTotalCents: number, summary: string[]) => void;
  initial?: CartLine;
  addLabel?: string;
}) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open || !product) return;
    setQty(initial?.quantity ?? 1);
    setNote(initial?.note ?? '');
    setTried(false);
    const s: Record<string, string[]> = {};
    for (const g of product.modifierGroups) {
      const ids = new Set(g.modifiers.map((m) => m.id));
      s[g.id] = (initial?.modifiers ?? []).map((m) => m.modifierId).filter((id) => ids.has(id));
    }
    setSel(s);
  }, [open, product, initial]);

  const allSelected = useMemo(() => Object.values(sel).flat(), [sel]);
  if (!product) return null;
  const error = validateSelection(product, sel);
  const unit = lineUnitCents(product, allSelected);

  const toggle = (g: MenuModifierGroup, id: string) => {
    setSel((s) => {
      const cur = s[g.id] ?? [];
      if (cur.includes(id)) return { ...s, [g.id]: cur.filter((x) => x !== id) };
      if (g.maxSelect === 1) return { ...s, [g.id]: [id] };
      if (cur.length >= g.maxSelect) return s;
      return { ...s, [g.id]: [...cur, id] };
    });
  };

  const submit = () => {
    setTried(true);
    if (error) return;
    const mods = product.modifierGroups.flatMap((g) => g.modifiers);
    const summary = allSelected.map((id) => mods.find((m) => m.id === id)?.name ?? '').filter(Boolean);
    onAdd({ productId: product.id, quantity: qty, modifiers: allSelected.map((modifierId) => ({ modifierId, quantity: 1 })), note: note.trim() || undefined }, unit, summary);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product.name}
      size="md"
      footer={
        <div className="flex w-full items-center gap-3">
          <div className="flex items-center rounded-xl bg-surface-sunken">
            <button className="grid h-11 w-11 place-items-center" aria-label="Menos" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></button>
            <span className="w-8 text-center font-semibold tabular-nums">{qty}</span>
            <button className="grid h-11 w-11 place-items-center" aria-label="Más" onClick={() => setQty((q) => Math.min(99, q + 1))}><Plus className="h-4 w-4" /></button>
          </div>
          <Button size="lg" className="flex-1" onClick={submit} disabled={!product.available}>
            {product.available ? `${addLabel} · ${money(unit * qty)}` : 'Agotado'}
          </Button>
        </div>
      }
    >
      {product.imageUrl && <img src={assetUrl(product.imageUrl)} alt="" className="mb-3 h-40 w-full rounded-2xl object-cover" />}
      {product.description && <p className="mb-3 text-sm text-ink-soft">{product.description}</p>}
      <p className="mb-4 text-lg font-semibold">{money(product.priceCents)}</p>
      <div className="space-y-5">
        {product.modifierGroups.map((g) => {
          const cur = sel[g.id] ?? [];
          const bad = tried && (cur.length < g.minSelect || cur.length > g.maxSelect);
          return (
            <section key={g.id}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">{g.name}</h3>
                <span className={clsx('text-xs font-medium', bad ? 'text-danger' : g.minSelect > 0 ? 'text-brand' : 'text-ink-mute')}>
                  {groupRuleText(g)}{g.maxSelect > 1 && ` · ${cur.length}/${g.maxSelect}`}
                </span>
              </div>
              <div className={clsx('divide-y divide-line rounded-2xl border', bad ? 'border-danger' : 'border-line')}>
                {g.modifiers.map((m) => {
                  const on = cur.includes(m.id);
                  const full = !on && g.maxSelect > 1 && cur.length >= g.maxSelect;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!m.available || full}
                      onClick={() => toggle(g, m.id)}
                      className={clsx('flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm transition first:rounded-t-2xl last:rounded-b-2xl', on ? 'bg-brand/10' : 'hover:bg-surface-sunken', (!m.available || full) && 'opacity-50')}
                    >
                      <span className={clsx('grid h-5 w-5 shrink-0 place-items-center border-2 transition', g.maxSelect === 1 ? 'rounded-full' : 'rounded-md', on ? 'border-brand bg-brand text-white' : 'border-line')}>
                        {on && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="flex-1">{m.name}{!m.available && <span className="ml-1 text-xs text-danger">(agotado)</span>}</span>
                      {m.priceCents > 0 && <span className="text-ink-mute">+{money(m.priceCents)}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
        <Textarea label="Nota para cocina (opcional)" rows={2} maxLength={200} placeholder="Sin cebolla, bien dorado…" value={note} onChange={(e) => setNote(e.target.value)} />
        {tried && error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
