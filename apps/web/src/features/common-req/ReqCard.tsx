import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, Clock, MessageCircle } from 'lucide-react';
import { SupplyIcon } from '@/icons/supplies';
import { assetUrl } from '@/lib/config';
import { minutesSince, timeAgo } from '@/lib/format';
import { AreaBadge, StatusPill } from './meta';
import { qtyLabel } from './SupplyTile';
import type { Requisition } from './types';

/** Tarjeta de requisición para la bandeja y el dashboard (mobile-first). */
export function ReqCard({ r, fresh }: { r: Requisition; fresh?: boolean }) {
  const urgent = r.priority === 'URGENTE';
  const waiting = r.status === 'ENVIADA' || r.status === 'VISTA';
  const mins = minutesSince(r.createdAt);
  return (
    <Link
      to={`/admin/requisiciones/${r.id}`}
      className={clsx(
        'card group block overflow-hidden transition hover:shadow-lift',
        fresh && 'animate-slide-up ring-2 ring-brand',
        urgent && waiting && 'border-danger/60 bg-danger/[0.04]',
      )}
    >
      <div className="flex">
        <span className="w-1.5 shrink-0" style={{ background: urgent && waiting ? 'rgb(var(--danger))' : r.area.color }} />
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start gap-3">
            <AreaBadge area={r.area} size={42} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="h-display text-lg font-bold">{r.area.name}</span>
                <span className="text-sm font-semibold text-ink-mute">{r.folio}</span>
                {urgent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-white">
                    <AlertTriangle className="h-3 w-3" /> Urgente
                  </span>
                )}
                {r.isLate && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-bold text-warn">Tarde</span>}
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-mute">
                <span className={clsx('inline-flex items-center gap-1', waiting && mins >= 15 && 'font-semibold text-danger')}>
                  <Clock className="h-3.5 w-3.5" />
                  {timeAgo(r.createdAt)}
                </span>
                <span>· {r.itemCount} {r.itemCount === 1 ? 'insumo' : 'insumos'}</span>
                {r.createdByName && <span>· {r.createdByName}</span>}
                {r.conversationId && <MessageCircle className="h-3.5 w-3.5" />}
              </p>
            </div>
            <StatusPill status={r.status} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.items.slice(0, 7).map((i) => (
              <span key={i.id} className={clsx('flex items-center gap-1 rounded-full bg-surface-sunken py-0.5 pl-0.5 pr-2.5 text-xs font-semibold', i.rejected && 'line-through opacity-50')}>
                <SupplyIcon icon={i.icon} imageUrl={assetUrl(i.imageUrl)} label={i.supplyName} size={22} />
                {i.supplyName} · {qtyLabel(i.approvedQty ?? i.requestedQty, i.unit)}
              </span>
            ))}
            {r.items.length > 7 && <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold">+{r.items.length - 7}</span>}
          </div>
          {r.note && <p className="mt-2 line-clamp-2 rounded-xl bg-surface-sunken/70 px-3 py-1.5 text-sm italic text-ink-soft">“{r.note}”</p>}
          {r.hasDifferences && <p className="mt-2 text-xs font-semibold text-warn">Recibido con diferencias</p>}
        </div>
      </div>
    </Link>
  );
}
