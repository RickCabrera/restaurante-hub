import type { ReactNode } from 'react';
import clsx from 'clsx';
import { initials } from '@/lib/format';

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-sunken text-ink-soft',
    brand: 'bg-brand-100 text-brand-700',
    ok: 'bg-ok/15 text-ok',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
    info: 'bg-info/15 text-info',
  };
  return <span className={clsx('chip', tones[tone], className)}>{children}</span>;
}

export function Avatar({ name, color, size = 40, className }: { name: string; color?: string; size?: number; className?: string }) {
  return (
    <span
      className={clsx('inline-grid shrink-0 place-items-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, background: color ?? '#78716c', fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="h-display truncate text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={clsx('flex gap-1 overflow-x-auto rounded-xl bg-surface-sunken p-1 scroll-thin', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={clsx(
            'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
            value === it.value ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-mute hover:text-ink',
          )}
        >
          {it.label}
          {it.count !== undefined && it.count > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'brand' | 'ok' | 'warn' | 'danger' }) {
  const toneCls = { brand: 'bg-brand-100 text-brand-700', ok: 'bg-ok/15 text-ok', warn: 'bg-warn/15 text-warn', danger: 'bg-danger/15 text-danger' };
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink-mute">{label}</p>
        {icon && <span className={clsx('grid h-9 w-9 place-items-center rounded-xl', tone ? toneCls[tone] : 'bg-surface-sunken text-ink-soft')}>{icon}</span>}
      </div>
      <p className="h-display mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-mute">{hint}</p>}
    </div>
  );
}

/** Teclado numérico grande (PIN, cantidades, efectivo). */
export function NumberPad({ onKey, allowDecimal, className }: { onKey: (k: string) => void; allowDecimal?: boolean; className?: string }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', allowDecimal ? '.' : '', '0', '⌫'];
  return (
    <div className={clsx('grid grid-cols-3 gap-3', className)}>
      {keys.map((k, i) =>
        k ? (
          <button
            key={i}
            onClick={() => onKey(k === '⌫' ? 'back' : k)}
            className="h-16 rounded-2xl bg-surface-sunken text-2xl font-semibold active:scale-95 active:bg-line transition no-select"
          >
            {k}
          </button>
        ) : (
          <span key={i} />
        ),
      )}
    </div>
  );
}
