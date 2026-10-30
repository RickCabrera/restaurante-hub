import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight, Receipt } from 'lucide-react';
import { money, minutesSince } from '@/lib/format';
import { Badge, EmptyState, ErrorState, Modal, Skeleton, Tabs } from '@/ui';
import { TICKET_STATUS_LABEL, useOpenTickets, type Ticket } from '../api';

export function OpenTicketsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mine, setMine] = useState<'all' | 'mine'>('all');
  const navigate = useNavigate();
  return (
    <Modal open={open} onClose={onClose} title="Cuentas abiertas" size="lg">
      <Tabs value={mine} onChange={setMine} items={[{ value: 'all', label: 'Todas' }, { value: 'mine', label: 'Mías' }]} className="mb-3 w-fit" />
      {open && (
        <TicketList
          mine={mine === 'mine'}
          onPick={(t) => {
            onClose();
            navigate(`/pos/cuenta/${t.id}`);
          }}
        />
      )}
    </Modal>
  );
}

export function TicketList({ mine, onPick, excludeId }: { mine?: boolean; onPick: (t: Ticket) => void; excludeId?: string }) {
  const q = useOpenTickets(mine);
  if (q.isLoading) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = (q.data ?? []).filter((t) => t.id !== excludeId);
  if (!rows.length) return <EmptyState icon={<Receipt className="h-7 w-7" />} title="No hay cuentas abiertas" />;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
      {rows.map((t) => (
        <li key={t.id}>
          <button onClick={() => onPick(t)} className="flex min-h-[64px] w-full items-center gap-3 bg-surface-raised px-4 py-3 text-left hover:bg-surface-sunken active:bg-surface-sunken">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold">
                {t.tableLabel}
                <Badge tone={t.status === 'POR_COBRAR' ? 'warn' : 'brand'}>{TICKET_STATUS_LABEL[t.status]}</Badge>
              </p>
              <p className="text-xs text-ink-mute">
                {t.folio} · {t.waiterName ?? 'Sin mesero'} · {minutesSince(t.openedAt)} min
              </p>
            </div>
            <span className={clsx('h-display text-lg font-bold tabular-nums')}>{money(t.totalCents)}</span>
            <ChevronRight className="h-5 w-5 text-ink-mute" />
          </button>
        </li>
      ))}
    </ul>
  );
}
