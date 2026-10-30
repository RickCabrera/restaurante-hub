import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, History } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Button, EmptyState, ErrorState, Select, Skeleton } from '@/ui';

interface AuditItem {
  id: string;
  actorType: string;
  actorName: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  data: unknown;
  ip: string | null;
  createdAt: string;
}

const ENTITY_LABEL: Record<string, string> = {
  requisition: 'Requisiciones',
  supply: 'Insumos',
  user: 'Personal',
  area: 'Áreas',
  device: 'Tablets',
  business: 'Configuración',
  message: 'Mensajes',
  order: 'Pedidos',
  printer: 'Impresoras',
};

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Inició sesión',
  'auth.logout': 'Cerró sesión',
  'settings.update': 'Cambió la configuración',
  'requisition.create': 'Creó requisición',
  'requisition.review': 'Revisó requisición',
  'requisition.purchased': 'Marcó comprado',
  'requisition.fulfill': 'Surtió requisición',
  'requisition.receive': 'Confirmó recepción',
  'requisition.cancel': 'Canceló requisición',
  'user.create': 'Creó persona',
  'user.update': 'Editó persona',
  'user.set_pin': 'Cambió PIN',
  'user.reset_password': 'Cambió contraseña',
  'user.activate': 'Activó persona',
  'user.deactivate': 'Desactivó persona',
  'area.create': 'Creó área',
  'area.update': 'Editó área',
  'area.delete': 'Borró área',
  'device.pairing_code': 'Generó código de tablet',
  'device.revoke': 'Revocó tablet',
  'device.update': 'Editó tablet',
  'supply.bulk_assign': 'Asignó insumos a áreas',
  'chat.broadcast': 'Envió aviso a todos',
};

export function AuditTab() {
  const [f, setF] = useState({ entity: '', from: '', to: '' });
  const q = useInfiniteQuery({
    queryKey: ['audit-logs', f],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.get<{ items: AuditItem[]; nextCursor: string | null }>('/audit-logs', { entity: f.entity || undefined, from: f.from || undefined, to: f.to || undefined, cursor: pageParam, limit: 50 }),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  });
  const [open, setOpen] = useState<string | null>(null);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Select value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })} placeholder="Todo" options={Object.entries(ENTITY_LABEL).map(([value, label]) => ({ value, label }))} aria-label="Tipo" />
        <input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="Desde" />
        <input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="Hasta" />
      </div>
      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !items.length ? (
        <EmptyState icon={<History className="h-7 w-7" />} title="Sin movimientos" />
      ) : (
        <div className="card divide-y divide-line">
          {items.map((it) => (
            <div key={it.id} className="px-4 py-2.5">
              <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === it.id ? null : it.id)}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <b>{it.actorName ?? (it.actorType === 'SYSTEM' ? 'Sistema' : it.actorType)}</b> · {ACTION_LABEL[it.action] ?? it.action}
                  </p>
                  <p className="text-xs text-ink-mute">
                    {fmtDateTime(it.createdAt)}
                    {it.entity ? ` · ${ENTITY_LABEL[it.entity] ?? it.entity}` : ''}
                    {it.ip ? ` · ${it.ip}` : ''}
                  </p>
                </div>
                {it.data != null && <ChevronDown className={`h-4 w-4 text-ink-mute transition ${open === it.id ? 'rotate-180' : ''}`} />}
              </button>
              {open === it.id && it.data != null && <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-surface-sunken p-3 text-xs scroll-thin">{JSON.stringify(it.data, null, 2)}</pre>}
            </div>
          ))}
        </div>
      )}
      {q.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Ver más</Button>
        </div>
      )}
    </div>
  );
}
