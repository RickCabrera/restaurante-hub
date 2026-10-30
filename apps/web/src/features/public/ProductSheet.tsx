import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { money } from '@/lib/format';
import { sounds, vibrate } from '@/lib/sound';
import { FoodImage, QtyStepper, Sheet } from './ui';
import { groupRule } from './lib';
import type { CartLine, PubProduct } from './types';

export function ProductSheet({
  product,
  categoryName,
  onClose,
  onAdd,
  readOnly,
}: {
  product: PubProduct | null;
  categoryName: string;
  onClose: () => void;
  onAdd?: (l: Omit<CartLine, 'key'>) => void;
  readOnly?: boolean;
}) {
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!product) return;
    // Preselecciona la primera opción disponible en grupos "Elige 1"
    const init: Record<string, string[]> = {};
    for (const g of product.modifierGroups) {
      if (g.minSelect === 1 && g.maxSelect === 1) {
        const first = g.modifiers.find((m) => m.available);
        init[g.id] = first ? [first.id] : [];
      } else init[g.id] = [];
    }
    setSel(init);
    setQty(1);
    setNote('');
    setTried(false);
  }, [product]);

  const groups = product?.modifierGroups ?? [];
  const missing = useMemo(() => groups.filter((g) => (sel[g.id]?.length ?? 0) < g.minSelect).map((g) => g.id), [groups, sel]);
  const extras = useMemo(
    () => groups.flatMap((g) => g.modifiers.filter((m) => sel[g.id]?.includes(m.id))).reduce((s, m) => s + m.priceCents, 0),
    [groups, sel],
  );
  if (!product) return null;
  const total = (product.priceCents + extras) * qty;

  const toggle = (gid: string, mid: string, max: number) => {
    sounds.tap();
    setSel((s) => {
      const cur = s[gid] ?? [];
      if (cur.includes(mid)) return { ...s, [gid]: cur.filter((x) => x !== mid) };
      if (max === 1) return { ...s, [gid]: [mid] };
      if (cur.length >= max) return s;
      return { ...s, [gid]: [...cur, mid] };
    });
  };

  const submit = () => {
    setTried(true);
    if (missing.length) {
      document.getElementById(`grp-${missing[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      vibrate(30);
      return;
    }
    onAdd?.({
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      basePriceCents: product.priceCents,
      modifiers: groups.flatMap((g) =>
        g.modifiers.filter((m) => sel[g.id]?.includes(m.id)).map((m) => ({ modifierId: m.id, name: m.name, priceCents: m.priceCents, groupName: g.name })),
      ),
      quantity: qty,
      note: note.trim() || undefined,
    });
  };

  return (
    <Sheet
      open
      bare
      onClose={onClose}
      labelledBy="product-title"
      footer={
        readOnly ? undefined : (
          <div className="flex items-center gap-3">
            <QtyStepper value={qty} onChange={setQty} />
            <button
              onClick={submit}
              disabled={!product.available}
              className="flex h-14 flex-1 items-center justify-between gap-2 rounded-2xl bg-brand px-5 text-base font-semibold text-white shadow-lift transition active:scale-[0.98] disabled:opacity-50"
            >
              <span>{product.available ? 'Agregar' : 'Agotado'}</span>
              <span className="tabular-nums">{money(total)}</span>
            </button>
          </div>
        )
      }
    >
      <FoodImage src={product.imageUrl} category={categoryName} name={product.name} rounded="rounded-none" className="aspect-[16/10] w-full" big />
      <div className="px-5 pb-6 pt-5">
        <h2 id="product-title" className="h-display text-2xl font-bold leading-tight">{product.name}</h2>
        <p className="mt-1 text-lg font-semibold text-brand">{money(product.priceCents)}</p>
        {product.description && <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{product.description}</p>}
        {!product.available && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Agotado por hoy</p>}

        {groups.map((g) => {
          const rule = groupRule(g);
          const count = sel[g.id]?.length ?? 0;
          const bad = tried && missing.includes(g.id);
          const single = g.maxSelect === 1;
          return (
            <section key={g.id} id={`grp-${g.id}`} className="mt-6">
              <div className={clsx('sticky -top-px z-[1] -mx-5 flex items-center justify-between gap-2 bg-surface-raised/95 px-5 py-2 backdrop-blur', bad && 'animate-pop')}>
                <div>
                  <h3 className="font-semibold">{g.name}</h3>
                  <p className={clsx('text-xs', bad ? 'font-semibold text-danger' : 'text-ink-mute')}>
                    {rule.text}
                    {g.maxSelect > 1 && count > 0 && ` · ${count} de ${g.maxSelect}`}
                  </p>
                </div>
                {rule.required && (
                  <span className={clsx('chip', count >= g.minSelect ? 'bg-ok/15 text-ok' : bad ? 'bg-danger/15 text-danger' : 'bg-surface-sunken text-ink-soft')}>
                    {count >= g.minSelect ? <><Check className="h-3 w-3" /> Listo</> : 'Obligatorio'}
                  </span>
                )}
              </div>
              <div className="mt-1 divide-y divide-line overflow-hidden rounded-2xl border border-line">
                {g.modifiers.map((m) => {
                  const on = !!sel[g.id]?.includes(m.id);
                  const full = !on && !single && count >= g.maxSelect;
                  const disabled = readOnly || !m.available || full;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role={single ? 'radio' : 'checkbox'}
                      aria-checked={on}
                      disabled={disabled}
                      onClick={() => toggle(g.id, m.id, g.maxSelect)}
                      className={clsx(
                        'flex w-full items-center gap-3 px-4 py-3.5 text-left transition',
                        on ? 'bg-brand/10' : 'bg-surface-raised hover:bg-surface-sunken/60',
                        disabled && !on && 'opacity-50',
                        readOnly && 'cursor-default !opacity-100',
                      )}
                    >
                      {!readOnly && (
                        <span
                          className={clsx(
                            'grid h-6 w-6 shrink-0 place-items-center border-2 transition',
                            single ? 'rounded-full' : 'rounded-lg',
                            on ? 'border-brand bg-brand text-white' : 'border-line',
                          )}
                        >
                          {on && (single ? <span className="h-2.5 w-2.5 rounded-full bg-white" /> : <Check className="h-4 w-4" strokeWidth={3} />)}
                        </span>
                      )}
                      <span className="flex-1">
                        <span className="block text-[15px]">{m.name}</span>
                        {!m.available && <span className="text-xs text-danger">Agotado</span>}
                      </span>
                      {m.priceCents > 0 && <span className="text-sm font-medium text-ink-soft tabular-nums">+{money(m.priceCents)}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {!readOnly && (
          <label className="mt-6 block">
            <span className="label">¿Alguna indicación? <span className="font-normal text-ink-mute">(opcional)</span></span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              rows={2}
              placeholder="Ej. sin cebolla, salsa aparte"
              className="input h-auto py-2.5"
            />
          </label>
        )}
      </div>
    </Sheet>
  );
}
