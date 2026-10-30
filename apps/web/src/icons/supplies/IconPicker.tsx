import { useMemo, useState } from 'react';
import { SUPPLY_ICONS, type SupplyIconDef } from '@rh/shared';
import { SupplyIcon } from './SupplyIcon';

type Group = SupplyIconDef['group'];

export const SUPPLY_GROUP_LABELS: Record<Group, string> = {
  verdura: 'Verduras',
  fruta: 'Frutas',
  carne: 'Carnes',
  lacteo: 'Lácteos',
  abarrote: 'Abarrotes',
  panaderia: 'Panadería',
  especia: 'Especias',
  bebida: 'Bebidas',
  barra: 'Barra',
  desechable: 'Desechables',
  limpieza: 'Limpieza',
  servicio: 'Servicios',
  otro: 'Otros',
};

const GROUP_ORDER = Object.keys(SUPPLY_GROUP_LABELS) as Group[];

/** Minúsculas y sin acentos, para búsqueda tolerante ("jitomate" = "Jitomaté"). */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const INDEX = SUPPLY_ICONS.map((def) => ({
  def,
  haystack: norm([def.label, def.key, ...(def.tags ?? [])].join(' ')),
}));

export interface IconPickerProps {
  value?: string | null;
  onChange: (key: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<Group | 'all'>('all');

  const results = useMemo(() => {
    const terms = norm(query).split(/\s+/).filter(Boolean);
    return INDEX.filter(
      ({ def, haystack }) => (group === 'all' || def.group === group) && terms.every((t) => haystack.includes(t)),
    ).map(({ def }) => def);
  }, [query, group]);

  const chip = (active: boolean) =>
    [
      'shrink-0 px-3 h-9 rounded-full border text-sm font-semibold transition',
      active ? 'bg-brand text-white border-brand' : 'bg-surface-sunken text-ink-mute border-line hover:text-ink',
    ].join(' ');

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        className="input"
        placeholder="Buscar ícono… (jitomate, hielo, gas)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Buscar ícono"
      />

      <div className="flex gap-2 overflow-x-auto scroll-thin pb-1" role="tablist" aria-label="Grupos">
        <button type="button" role="tab" aria-selected={group === 'all'} className={chip(group === 'all')} onClick={() => setGroup('all')}>
          Todos
        </button>
        {GROUP_ORDER.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={group === g} className={chip(group === g)} onClick={() => setGroup(g)}>
            {SUPPLY_GROUP_LABELS[g]}
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-mute">No hay íconos que coincidan.</p>
      ) : (
        <div
          className="grid gap-2 max-h-[420px] overflow-y-auto scroll-thin p-1"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}
          role="listbox"
          aria-label="Íconos de insumos"
        >
          {results.map((def) => {
            const selected = def.key === value;
            return (
              <button
                key={def.key}
                type="button"
                role="option"
                aria-selected={selected}
                title={def.label}
                onClick={() => onChange(def.key)}
                className={[
                  'flex flex-col items-center gap-1 p-2 rounded-xl border transition',
                  selected ? 'ring-2 ring-brand border-brand bg-brand/10' : 'border-line bg-surface-sunken hover:border-brand/50',
                ].join(' ')}
              >
                <SupplyIcon icon={def.key} label={def.label} size={56} />
                <span className="text-xs leading-tight text-center text-ink-mute line-clamp-2">{def.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
