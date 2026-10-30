import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Plus, Search, X } from 'lucide-react';
import { money } from '@/lib/format';
import { FoodImage } from './ui';
import type { PubCategory, PubProduct } from './types';

const TABS_H = 56;

/** Pestañas de categorías fijas con scroll-spy + lista de productos. */
export function MenuList({
  categories,
  onOpen,
  countFor,
  readOnly,
  topOffset = 0,
}: {
  categories: PubCategory[];
  onOpen: (p: PubProduct, cat: PubCategory) => void;
  countFor?: (productId: string) => number;
  readOnly?: boolean;
  topOffset?: number;
}) {
  const [active, setActive] = useState<string | null>(categories[0]?.id ?? null);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const lock = useRef(0);

  const term = q.trim().toLowerCase();
  const visible = categories
    .map((c) => ({ ...c, products: term ? c.products.filter((p) => `${p.name} ${p.description ?? ''}`.toLowerCase().includes(term)) : c.products }))
    .filter((c) => c.products.length > 0);

  // Scroll-spy: categoría cuya sección cruza la línea bajo las pestañas
  useEffect(() => {
    const onScroll = () => {
      if (Date.now() < lock.current) return;
      const line = topOffset + TABS_H + 24;
      let cur: string | null = visible[0]?.id ?? null;
      for (const c of visible) {
        const el = document.getElementById(`cat-${c.id}`);
        if (el && el.getBoundingClientRect().top <= line) cur = c.id;
      }
      // al final de la página, la última
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = visible[visible.length - 1]?.id ?? cur;
      setActive(cur);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [visible.map((c) => c.id).join(','), topOffset]);

  // Mantener la pestaña activa visible
  useEffect(() => {
    const t = tabsRef.current?.querySelector<HTMLElement>(`[data-cat="${active}"]`);
    t?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [active]);

  const go = (id: string) => {
    const el = document.getElementById(`cat-${id}`);
    if (!el) return;
    lock.current = Date.now() + 700;
    setActive(id);
    const y = el.getBoundingClientRect().top + window.scrollY - topOffset - TABS_H - 8;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  return (
    <div>
      <div className="sticky z-20 -mx-4 border-b border-line bg-surface/90 backdrop-blur-md sm:-mx-6" style={{ top: topOffset }}>
        <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
          {searching ? (
            <div className="flex flex-1 items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-ink-mute" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar en el menú"
                aria-label="Buscar en el menú"
                className="h-10 flex-1 bg-transparent text-[15px] placeholder:text-ink-mute focus:outline-none"
              />
              <button
                onClick={() => {
                  setQ('');
                  setSearching(false);
                }}
                aria-label="Cerrar búsqueda"
                className="grid h-9 w-9 place-items-center rounded-full bg-surface-sunken"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => setSearching(true)} aria-label="Buscar" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-ink-soft">
                <Search className="h-4 w-4" />
              </button>
              <nav ref={tabsRef} className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto" aria-label="Categorías" style={{ scrollbarWidth: 'none' }}>
                {visible.map((c) => (
                  <button
                    key={c.id}
                    data-cat={c.id}
                    onClick={() => go(c.id)}
                    aria-current={active === c.id}
                    className={clsx(
                      'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
                      active === c.id ? 'bg-ink text-surface' : 'text-ink-soft hover:bg-surface-sunken',
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </nav>
            </>
          )}
        </div>
      </div>

      {visible.length === 0 && (
        <div className="py-16 text-center text-ink-mute">
          <p className="text-4xl">🔍</p>
          <p className="mt-2 font-medium text-ink">Sin resultados para “{q}”</p>
        </div>
      )}

      {visible.map((c) => (
        <section key={c.id} id={`cat-${c.id}`} className="pt-7" aria-labelledby={`cat-h-${c.id}`}>
          <h2 id={`cat-h-${c.id}`} className="h-display text-[22px] font-bold">{c.name}</h2>
          {c.description && <p className="mt-0.5 text-sm text-ink-mute">{c.description}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {c.products.map((p) => (
              <ProductCard key={p.id} p={p} cat={c} count={countFor?.(p.id) ?? 0} onOpen={() => onOpen(p, c)} readOnly={readOnly} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ProductCard({ p, cat, count, onOpen, readOnly }: { p: PubProduct; cat: PubCategory; count: number; onOpen: () => void; readOnly?: boolean }) {
  const soldOut = !p.available;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={soldOut && !readOnly}
      className={clsx(
        'group relative flex w-full gap-3 rounded-2xl border border-line bg-surface-raised p-3 text-left shadow-card transition',
        'hover:border-brand/40 hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 active:scale-[0.99]',
        soldOut && 'opacity-60',
        count > 0 && 'border-brand/60 ring-1 ring-brand/30',
      )}
      aria-label={`${p.name}, ${money(p.priceCents)}${soldOut ? ', agotado' : ''}`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-semibold leading-snug">{p.name}</h3>
        {p.description && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-mute">{p.description}</p>}
        <div className="mt-auto flex items-center gap-2 pt-2">
          <span className="font-bold tabular-nums">{money(p.priceCents)}</span>
          {soldOut && <span className="chip bg-surface-sunken text-ink-mute">Agotado</span>}
          {!soldOut && p.modifierGroups.length > 0 && !readOnly && <span className="text-[11px] text-ink-mute">Personalizable</span>}
        </div>
      </div>
      <div className="relative shrink-0">
        <FoodImage src={p.imageUrl} category={cat.name} name={p.name} className={clsx('h-[104px] w-[104px]', soldOut && 'grayscale')} rounded="rounded-xl" />
        {!readOnly && !soldOut && (
          <span
            className={clsx(
              'absolute -bottom-1.5 -right-1.5 grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm font-bold shadow-lift ring-4 ring-surface-raised transition group-hover:scale-105',
              count > 0 ? 'bg-brand text-white' : 'bg-surface-raised text-brand',
            )}
            aria-hidden
          >
            {count > 0 ? count : <Plus className="h-5 w-5" strokeWidth={2.5} />}
          </span>
        )}
      </div>
    </button>
  );
}
