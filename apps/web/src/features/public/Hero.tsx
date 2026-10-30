import clsx from 'clsx';
import { Bike, Clock, MapPin, Phone, ShoppingBag, Store } from 'lucide-react';
import type { OrderType } from '@rh/shared';
import { branchStatusText, fmtPhone, telHref } from './lib';
import { Monogram } from './ui';
import type { PubBranch, PubBusiness } from './types';

export function Hero({
  business,
  branch,
  branches,
  onBranch,
  type,
  onType,
  compact,
  subtitle,
}: {
  business: PubBusiness;
  branch?: PubBranch;
  branches: PubBranch[];
  onBranch?: (id: string) => void;
  type?: OrderType;
  onType?: (t: OrderType) => void;
  compact?: boolean;
  subtitle?: string;
}) {
  const st = branchStatusText(branch, business.timezone);
  const phone = branch?.phone || business.phone;
  const canDelivery = branches.some((b) => b.acceptsDelivery);
  const canPickup = branches.some((b) => b.acceptsPickup);
  return (
    <header className="relative">
      <div
        className="relative overflow-hidden bg-brand px-4 pb-16 pt-6 text-white sm:px-6 sm:pt-8"
        style={{
          backgroundImage:
            'radial-gradient(60% 120% at 100% 0%, rgb(255 255 255 / 0.18), transparent 60%), radial-gradient(50% 90% at 0% 100%, rgb(0 0 0 / 0.18), transparent 60%)',
        }}
      >
        {/* patrón sutil de puntos */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: 'radial-gradient(rgb(255 255 255) 1.2px, transparent 1.2px)', backgroundSize: '18px 18px' }}
        />
        <div className="relative mx-auto flex max-w-5xl items-center gap-4">
          <Monogram name={business.name} logoUrl={business.logoUrl} size={compact ? 56 : 72} className="ring-4 ring-white/25" />
          <div className="min-w-0 flex-1">
            <h1 className={clsx('h-display font-extrabold leading-[1.05] drop-shadow-sm', compact ? 'text-2xl' : 'text-[28px] sm:text-4xl')}>{business.name}</h1>
            {subtitle && <p className="mt-1 text-sm text-white/85">{subtitle}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold', st.open ? 'bg-white text-[#1c1917]' : 'bg-black/30 text-white')}>
                <span className={clsx('h-2 w-2 rounded-full', st.open ? 'bg-ok' : 'bg-white/70')} />
                {st.text}
              </span>
              {phone && (
                <a href={telHref(phone)} className="inline-flex items-center gap-1 text-white/90 underline-offset-2 hover:underline">
                  <Phone className="h-3.5 w-3.5" /> {fmtPhone(phone)}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {onType && (
        <div className="relative mx-auto -mt-11 max-w-5xl px-4 sm:px-6">
          <div className="card p-2 shadow-lift">
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-surface-sunken p-1" role="radiogroup" aria-label="Tipo de servicio">
              <ServiceBtn on={type === 'DOMICILIO'} disabled={!canDelivery} onClick={() => onType('DOMICILIO')} icon={<Bike className="h-5 w-5" />} label="Domicilio" hint={canDelivery ? 'Te lo llevamos' : 'No disponible'} />
              <ServiceBtn on={type === 'PASAR_A_RECOGER'} disabled={!canPickup} onClick={() => onType('PASAR_A_RECOGER')} icon={<ShoppingBag className="h-5 w-5" />} label="Pasar a recoger" hint={canPickup ? `Listo en ~${branch?.prepMinutes ?? 25} min` : 'No disponible'} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-1 pt-2.5 text-xs text-ink-mute">
              {branches.length > 1 && onBranch ? (
                <label className="flex min-w-0 items-center gap-1.5">
                  <Store className="h-3.5 w-3.5 shrink-0" />
                  <span className="sr-only">Sucursal</span>
                  <select
                    value={branch?.id ?? ''}
                    onChange={(e) => onBranch(e.target.value)}
                    className="max-w-[60vw] truncate rounded-lg bg-transparent py-0.5 font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}{b.isOpen ? '' : ' (cerrada)'}</option>
                    ))}
                  </select>
                </label>
              ) : (
                branch?.address && (
                  <span className="flex min-w-0 items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{branch.address}</span></span>
                )
              )}
              {branch?.hoursText && <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {branch.hoursText}</span>}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function ServiceBtn({ on, disabled, onClick, icon, label, hint }: { on: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition',
        on ? 'bg-surface-raised text-ink shadow-card' : 'text-ink-mute hover:text-ink',
        disabled && 'opacity-40',
      )}
    >
      <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-full', on ? 'bg-brand text-white' : 'bg-surface-raised/70')}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-tight">{label}</span>
        <span className="block truncate text-[11px]">{hint}</span>
      </span>
    </button>
  );
}
