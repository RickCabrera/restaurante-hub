import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { money } from '@/lib/format';
import { assetUrl } from '@/lib/config';
import { EmptyState, ErrorState, Skeleton } from '@/ui';
import { useMenu, type PosProduct } from '../api';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function MenuPanel({ onPick, disabled }: { onPick: (p: PosProduct) => void; disabled?: boolean }) {
  const menu = useMenu();
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const cats = menu.data ?? [];
  const current = cats.find((c) => c.id === cat) ?? cats[0];

  const products = useMemo(() => {
    if (q.trim()) {
      const n = norm(q.trim());
      return cats.flatMap((c) => c.products).filter((p) => norm(p.name).includes(n));
    }
    return current?.products ?? [];
  }, [q, cats, current]);

  if (menu.isLoading)
    return (
      <div className="grid grid-cols-3 gap-3 p-3">
        {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  if (menu.error) return <ErrorState error={menu.error} onRetry={() => menu.refetch()} />;
  if (!cats.length) return <EmptyState title="No hay productos para el punto de venta" description="Activa “Mostrar en POS” en los productos del menú." />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 p-2 pb-1">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-mute" />
          <input
            className="input h-12 pl-10 text-base"
            placeholder="Buscar producto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar producto"
          />
          {q && (
            <button aria-label="Limpiar búsqueda" onClick={() => setQ('')} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-ink-mute hover:bg-surface-sunken">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      </div>
      {!q && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto px-2 pb-2 scroll-thin">
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={clsx(
                'h-12 shrink-0 rounded-xl px-4 text-sm font-semibold transition active:scale-95',
                c.id === current?.id ? 'bg-ink text-surface' : 'bg-surface-sunken text-ink-soft',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scroll-thin">
        {products.length === 0 ? (
          <EmptyState title="Sin resultados" />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => {
              const off = !p.available;
              return (
                <button
                  key={p.id}
                  disabled={disabled || off}
                  onClick={() => onPick(p)}
                  className={clsx(
                    'group relative flex min-h-[92px] flex-col justify-between overflow-hidden rounded-2xl border border-line bg-surface-raised p-3 text-left shadow-card transition',
                    'active:scale-[0.97] hover:border-brand disabled:opacity-45',
                  )}
                >
                  {p.imageUrl && (
                    <img src={assetUrl(p.imageUrl)} alt="" className="absolute inset-y-0 right-0 h-full w-16 object-cover opacity-90 [mask-image:linear-gradient(to_right,transparent,black_60%)]" loading="lazy" />
                  )}
                  <span className="relative line-clamp-2 pr-10 text-[15px] font-semibold leading-tight">{p.name}</span>
                  <span className="relative flex items-center gap-1.5">
                    <span className="h-display text-base font-bold tabular-nums text-brand">{money(p.priceCents)}</span>
                    {p.modifierGroups.length > 0 && <SlidersHorizontal className="h-3.5 w-3.5 text-ink-mute" aria-label="Con opciones" />}
                    {off && <span className="text-xs font-semibold text-danger">Agotado</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
