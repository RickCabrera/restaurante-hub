import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Check, Copy, FileDown, MessageCircle, Printer, ShoppingCart, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtTime } from '@/lib/format';
import { sounds } from '@/lib/sound';
import { SupplyIcon } from '@/icons/supplies';
import { Button, EmptyState, ErrorState, Modal, PageHeader, Skeleton, Spinner, toast } from '@/ui';
import { useManagerBadges, upsertRequisition } from '@/features/common-req/hooks';
import type { Requisition, ShoppingList } from '@/features/common-req/types';

interface Printer {
  id: string;
  name: string;
  connectionLabel: string;
  areaName: string | null;
  active: boolean;
}

export function ShoppingPage() {
  const qc = useQueryClient();
  useManagerBadges();
  const q = useQuery({ queryKey: ['shopping-list'], queryFn: () => api.get<ShoppingList>('/requisitions/shopping-list') });
  const iconsQ = useQuery({ queryKey: ['supply-icons-map'], queryFn: async () => {
    const s = await api.get<{ id: string; icon: string | null; imageUrl: string | null }[]>('/supplies');
    return Object.fromEntries(s.map((x) => [x.id, x]));
  }, staleTime: 5 * 60_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const markPurchased = async (key: string, body: { supplyIds?: string[]; supplierId?: string | null }) => {
    setBusy(key);
    try {
      const r = await api.post<{ updatedItems: number; requisitions: Requisition[] }>('/requisitions/shopping-list/purchased', body);
      for (const x of r.requisitions ?? []) upsertRequisition(qc, x);
      await qc.invalidateQueries({ queryKey: ['shopping-list'] });
      sounds.tap();
      toast.success(r.updatedItems === 1 ? 'Marcado como comprado' : `${r.updatedItems} renglones comprados`);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(null);
    }
  };

  const share = async (g: ShoppingList['groups'][number]) => {
    if (g.waLink) {
      window.open(g.waLink, '_blank', 'noopener');
      return;
    }
    try {
      await navigator.clipboard.writeText(g.whatsappText);
      toast.success('Lista copiada', 'Este proveedor no tiene teléfono. Pégala en WhatsApp.');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const download = async () => {
    setBusy('pdf');
    try {
      await api.download('/requisitions/shopping-list.pdf', 'lista-de-compras.pdf');
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(null);
    }
  };

  const data = q.data;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Lista de compras"
        subtitle={data ? `${data.totalLines} insumos de ${data.requisitionCount} requisiciones aprobadas · ${fmtTime(data.generatedAt)}` : undefined}
        actions={
          data?.groups.length ? (
            <>
              <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => setPrintOpen(true)}>
                Imprimir
              </Button>
              <Button variant="outline" loading={busy === 'pdf'} icon={<FileDown className="h-4 w-4" />} onClick={download}>
                PDF
              </Button>
            </>
          ) : null
        }
      />
      {q.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !data?.groups.length ? (
        <EmptyState
          icon={<ShoppingCart className="h-7 w-7" />}
          title="No hay nada por comprar"
          description="Aquí se suman los insumos de las requisiciones aprobadas, agrupados por proveedor."
          action={<Link to="/admin/requisiciones" className="text-sm font-semibold text-brand">Ver requisiciones</Link>}
        />
      ) : (
        <div className="space-y-4">
          {data.groups.map((g) => {
            const gk = g.supplierId ?? 'none';
            return (
              <section key={gk} className="card overflow-hidden">
                <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-sunken/50 px-4 py-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-700">
                    <Store className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="h-display truncate text-lg font-bold">{g.supplierName}</h2>
                    <p className="text-xs text-ink-mute">{g.phone ?? 'Sin teléfono'} · {g.items.length} {g.items.length === 1 ? 'insumo' : 'insumos'}</p>
                  </div>
                  <Button size="sm" variant="success" icon={g.waLink ? <MessageCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={() => share(g)}>
                    {g.waLink ? 'Enviar por WhatsApp' : 'Copiar lista'}
                  </Button>
                  <Button size="sm" variant="outline" loading={busy === `g:${gk}`} icon={<Check className="h-4 w-4" />} onClick={() => markPurchased(`g:${gk}`, { supplierId: g.supplierId })}>
                    Todo comprado
                  </Button>
                </header>
                <ul className="divide-y divide-line">
                  {g.items.map((it) => {
                    const ik = `i:${it.supplyId}`;
                    const ic = iconsQ.data?.[it.supplyId];
                    return (
                      <li key={it.supplyId} className="flex items-center gap-3 px-4 py-3">
                        <button
                          onClick={() => markPurchased(ik, { supplyIds: [it.supplyId], supplierId: g.supplierId })}
                          disabled={!!busy}
                          className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-line transition hover:border-ok hover:bg-ok/10')}
                          aria-label={`Marcar ${it.supplyName} como comprado`}
                        >
                          {busy === ik ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4 text-ink-mute" />}
                        </button>
                        <SupplyIcon icon={ic?.icon} imageUrl={ic?.imageUrl} label={it.supplyName} size={40} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{it.supplyName}</p>
                          <p className="truncate text-xs text-ink-mute">
                            {it.sources.map((s) => `${s.areaName} (${s.folio})`).join(' · ')}
                          </p>
                        </div>
                        <span className="h-display whitespace-nowrap text-lg font-bold">{it.quantityText}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {printOpen && <PrintModal onClose={() => setPrintOpen(false)} />}
    </div>
  );
}

function PrintModal({ onClose }: { onClose: () => void }) {
  const printers = useQuery({ queryKey: ['printers'], queryFn: () => api.get<Printer[]>('/printing/printers') });
  const [busy, setBusy] = useState<string | null>(null);
  const print = async (p: Printer) => {
    setBusy(p.id);
    try {
      const data = await api.get('/requisitions/shopping-list/print-data');
      await api.post('/printing/print-shopping-list', { printerId: p.id, data });
      toast.success('Enviado a imprimir', p.name);
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(null);
    }
  };
  const list = (printers.data ?? []).filter((p) => p.active && !/pantalla/i.test(p.connectionLabel));
  return (
    <Modal open onClose={onClose} size="sm" title="Imprimir lista">
      {printers.isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : list.length === 0 ? (
        <EmptyState title="Sin impresoras" description="Configura una en Impresoras." action={<Link to="/admin/impresoras" className="text-sm font-semibold text-brand">Ir a Impresoras</Link>} />
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <button key={p.id} onClick={() => print(p)} disabled={!!busy} className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left hover:bg-surface-sunken">
              <Printer className="h-5 w-5 text-ink-mute" />
              <span className="flex-1">
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-xs text-ink-mute">{p.connectionLabel}{p.areaName ? ` · ${p.areaName}` : ''}</span>
              </span>
              {busy === p.id && <Spinner className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
