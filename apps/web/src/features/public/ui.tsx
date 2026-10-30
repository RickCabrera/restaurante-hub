import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Minus, Plus, X } from 'lucide-react';
import { assetUrl } from '@/lib/config';

/** Hoja inferior (celular) / diálogo centrado (escritorio) con pie fijo. */
export function Sheet({
  open,
  onClose,
  children,
  footer,
  title,
  wide,
  bare,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  title?: ReactNode;
  wide?: boolean;
  /** sin encabezado (el contenido trae su propia portada) */
  bare?: boolean;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal aria-labelledby={labelledBy}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={clsx(
          'relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-surface-raised shadow-lift animate-slide-up sm:rounded-[28px]',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        {bare ? (
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
            <div className="h-display text-xl font-bold" id={labelledBy}>{title}</div>
            <button onClick={onClose} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-full bg-surface-sunken text-ink-soft hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain scroll-thin">{children}</div>
        {footer && <div className="border-t border-line bg-surface-raised px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

const CATEGORY_EMOJI: [RegExp, string][] = [
  [/hamburg|burger/i, '🍔'],
  [/taco|quesadill|burrit/i, '🌮'],
  [/alita|boneless|pollo/i, '🍗'],
  [/ensalad|bowl|veg/i, '🥗'],
  [/pizza/i, '🍕'],
  [/sushi|roll/i, '🍣'],
  [/pasta|spaghet/i, '🍝'],
  [/cervez|cóctel|coctel|trago|vino|bar/i, '🍹'],
  [/bebida|refresc|agua|jugo|limonad|café|cafe/i, '🥤'],
  [/postre|pastel|dulce|helado|pay/i, '🍰'],
  [/desayun|huevo/i, '🍳'],
  [/sopa|caldo|pozole/i, '🍲'],
  [/mariscos|pescado|camar/i, '🦐'],
  [/papas|snack|botana|entrada/i, '🍟'],
];
export function categoryEmoji(name: string): string {
  return CATEGORY_EMOJI.find(([re]) => re.test(name))?.[1] ?? '🍽️';
}

/** Foto del producto o un marcador con la inicial de la categoría (sin cuadros rotos). */
export function FoodImage({ src, category, name, className, rounded = 'rounded-2xl', big }: { src?: string | null; category: string; name: string; className?: string; rounded?: string; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  const url = assetUrl(src);
  if (url && !failed) {
    return <img src={url} alt={name} loading="lazy" onError={() => setFailed(true)} className={clsx('object-cover', rounded, className)} />;
  }
  return (
    <div
      aria-hidden
      className={clsx('relative grid place-items-center overflow-hidden', rounded, className)}
      style={{
        background:
          'radial-gradient(120% 90% at 20% 10%, rgb(var(--brand) / 0.22), transparent 60%), radial-gradient(90% 90% at 100% 100%, rgb(var(--brand) / 0.30), transparent 55%), rgb(var(--surface-sunken))',
      }}
    >
      <span className={clsx('absolute select-none font-display font-extrabold leading-none text-brand/15', big ? '-left-2 -top-6 text-[180px]' : '-left-1 -top-3 text-[88px]')}>
        {category.trim().charAt(0).toUpperCase()}
      </span>
      <span className={clsx('relative drop-shadow-sm', big ? 'text-7xl' : 'text-4xl')}>{categoryEmoji(category)}</span>
    </div>
  );
}

export function QtyStepper({ value, onChange, min = 1, max = 99, size = 'md', label = 'Cantidad' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'sm' | 'md'; label?: string }) {
  const btn = size === 'sm' ? 'h-8 w-8' : 'h-11 w-11';
  return (
    <div className={clsx('inline-flex items-center rounded-full bg-surface-sunken p-1', size === 'sm' ? 'gap-1' : 'gap-2')} role="group" aria-label={label}>
      <button
        type="button"
        aria-label="Quitar uno"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min && min > 0}
        className={clsx(btn, 'grid place-items-center rounded-full bg-surface-raised text-ink shadow-sm transition active:scale-90 disabled:opacity-40')}
      >
        <Minus className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </button>
      <span className={clsx('min-w-[1.75rem] text-center font-semibold tabular-nums', size === 'sm' ? 'text-sm' : 'text-lg')} aria-live="polite">{value}</span>
      <button
        type="button"
        aria-label="Agregar uno"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={clsx(btn, 'grid place-items-center rounded-full bg-brand text-white shadow-sm transition active:scale-90 disabled:opacity-40')}
      >
        <Plus className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </button>
    </div>
  );
}

export function Monogram({ name, logoUrl, size = 64, className }: { name: string; logoUrl?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = assetUrl(logoUrl);
  if (url && !failed) return <img src={url} alt={name} onError={() => setFailed(true)} className={clsx('shrink-0 rounded-2xl bg-white object-cover', className)} style={{ width: size, height: size }} />;
  const ini = name
    .replace(/^(la|el|los|las)\s+/i, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span className={clsx('grid shrink-0 place-items-center rounded-2xl bg-white font-display font-extrabold text-brand shadow-sm', className)} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {ini || name[0]}
    </span>
  );
}
