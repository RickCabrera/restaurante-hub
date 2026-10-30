import { useState } from 'react';
import clsx from 'clsx';
import { todayISO } from '@/lib/format';

export type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';
const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'month', label: 'Este mes' },
  { value: 'custom', label: 'Fechas' },
];

function presetRange(p: Preset): { from: string; to: string } {
  switch (p) {
    case 'today': return { from: todayISO(), to: todayISO() };
    case 'yesterday': return { from: todayISO(-1), to: todayISO(-1) };
    case '7d': return { from: todayISO(-6), to: todayISO() };
    case 'month': return { from: todayISO().slice(0, 8) + '01', to: todayISO() };
    default: return { from: todayISO(-29), to: todayISO() };
  }
}

export function useRange(initial: Preset = 'today') {
  const [preset, setPresetState] = useState<Preset>(initial);
  const [r, setR] = useState(() => presetRange(initial));
  return {
    preset,
    from: r.from,
    to: r.to,
    setPreset: (p: Preset) => {
      setPresetState(p);
      if (p !== 'custom') setR(presetRange(p));
    },
    setFrom: (from: string) => setR((x) => ({ ...x, from })),
    setTo: (to: string) => setR((x) => ({ ...x, to })),
  };
}

export function DateRange({ range, className }: { range: ReturnType<typeof useRange>; className?: string }) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-2', className)}>
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface-sunken p-1 scroll-thin">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => range.setPreset(p.value)}
            className={clsx('shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium', range.preset === p.value ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-mute')}
          >
            {p.label}
          </button>
        ))}
      </div>
      {range.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" aria-label="Desde" className="input h-9 w-auto" value={range.from} max={range.to} onChange={(e) => range.setFrom(e.target.value)} />
          <span className="text-ink-mute">a</span>
          <input type="date" aria-label="Hasta" className="input h-9 w-auto" value={range.to} min={range.from} onChange={(e) => range.setTo(e.target.value)} />
        </div>
      )}
    </div>
  );
}
