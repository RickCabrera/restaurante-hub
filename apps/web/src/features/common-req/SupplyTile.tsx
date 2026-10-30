import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Minus } from 'lucide-react';
import { UnitLabel, formatQty, type UnitCode } from '@rh/shared';
import { SupplyIcon } from '@/icons/supplies';
import { assetUrl } from '@/lib/config';

export const unitShort = (u: UnitCode) => UnitLabel[u]?.short ?? u.toLowerCase();
export function qtyLabel(q: number, u: UnitCode) {
  const l = UnitLabel[u];
  if (!l) return formatQty(q);
  if (['KG', 'G', 'L', 'ML'].includes(u)) return `${formatQty(q)} ${l.short}`;
  return `${formatQty(q)} ${q === 1 ? l.one : l.many}`;
}

/**
 * Tarjeta grande de insumo (tablet). Toque = +paso, mantener = cantidad exacta.
 * Detecta arrastre para no sumar mientras se desplaza la cuadrícula.
 */
export function SupplyTile({
  supply,
  qty,
  accent,
  onTap,
  onMinus,
  onLongPress,
  iconSize = 88,
  compact,
  atMax,
}: {
  supply: { id: string; name: string; unit: UnitCode; icon: string | null; imageUrl: string | null };
  qty: number;
  accent: string;
  onTap?: () => void;
  onMinus?: () => void;
  onLongPress?: () => void;
  iconSize?: number;
  compact?: boolean;
  atMax?: boolean;
}) {
  const [popKey, setPopKey] = useState(0);
  const timer = useRef<number>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const longFired = useRef(false);

  const clear = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    longFired.current = false;
    clear();
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      timer.current = undefined;
      onLongPress?.();
    }, 500);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    if (Math.abs(e.clientX - start.current.x) > 12 || Math.abs(e.clientY - start.current.y) > 12) {
      clear();
      start.current = null;
    }
  };
  const onUp = () => {
    const wasPending = !!timer.current;
    clear();
    if (start.current && wasPending && !longFired.current) {
      setPopKey((k) => k + 1);
      onTap?.();
    }
    start.current = null;
  };

  const active = qty > 0;
  return (
    <div className="relative">
      <button
        type="button"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          clear();
          start.current = null;
        }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setPopKey((k) => k + 1);
            onTap?.();
          }
        }}
        aria-label={`${supply.name}${active ? `, ${qtyLabel(qty, supply.unit)}` : ''}`}
        className={clsx(
          'no-select relative flex w-full flex-col items-center justify-center rounded-3xl border-2 bg-surface-raised text-center shadow-card transition-[transform,border-color,background] duration-150 active:scale-[0.96]',
          compact ? 'gap-1 px-2 pb-2 pt-3' : 'gap-2 px-3 pb-3 pt-5',
          active ? 'border-transparent' : 'border-line',
        )}
        style={
          active
            ? { borderColor: accent, background: `color-mix(in srgb, ${accent} 10%, rgb(var(--surface-raised)))`, touchAction: 'manipulation' }
            : { touchAction: 'manipulation' }
        }
      >
        <span key={popKey} className={clsx('pointer-events-none', popKey > 0 && 'animate-pop')}>
          <SupplyIcon icon={supply.icon} imageUrl={assetUrl(supply.imageUrl)} label={supply.name} size={iconSize} />
        </span>
        <span className={clsx('pointer-events-none line-clamp-2 font-semibold leading-tight text-ink', compact ? 'text-sm' : 'text-lg')}>{supply.name}</span>
        <span className={clsx('pointer-events-none font-medium text-ink-mute', compact ? 'text-[11px]' : 'text-sm')}>{unitShort(supply.unit)}</span>
        {atMax && <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-warn px-2 text-[11px] font-bold text-white">Máximo</span>}
      </button>
      {active && (
        <span
          key={`b${popKey}`}
          className={clsx(
            'h-display pointer-events-none absolute right-2 top-2 min-w-[3rem] rounded-2xl px-2.5 py-1 text-center font-bold text-white shadow-lift animate-pop',
            compact ? 'text-sm' : 'text-xl',
          )}
          style={{ background: accent }}
        >
          {qtyLabel(qty, supply.unit)}
        </span>
      )}
      {active && onMinus && (
        <button
          type="button"
          onClick={onMinus}
          aria-label={`Quitar ${supply.name}`}
          className={clsx(
            'no-select absolute left-2 top-2 grid place-items-center rounded-2xl border-2 border-line bg-surface-raised text-ink shadow-card active:scale-90',
            compact ? 'h-9 w-9' : 'h-14 w-14',
          )}
        >
          <Minus className={compact ? 'h-5 w-5' : 'h-8 w-8'} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}
