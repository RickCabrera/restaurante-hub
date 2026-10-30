// Acciones de pedido compartidas por el monitor y el detalle.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  Ban, Bike, Check, CheckCheck, ChefHat, CircleDollarSign, MoreHorizontal, PackageCheck, Printer, Truck, UserPlus, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { sounds } from '@/lib/sound';
import { Avatar, Button, Modal, Spinner, confirm, toast } from '@/ui';
import { upsertOrderInCaches, useDrivers, type OrderView } from '@/features/delivery-common';
import { useNavigate } from 'react-router-dom';

export const ETA_CHIPS = [15, 25, 35, 45, 60];

export function useOrderMutation() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<OrderView | { ok: boolean }>, okMsg?: string) => {
    setBusy(key);
    try {
      const r = await fn();
      if (r && 'id' in r) upsertOrderInCaches(qc, r);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['drivers'] });
      if (okMsg) toast.success(okMsg);
      return r;
    } catch (e) {
      sounds.error();
      toast.fromError(e);
      return null;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

/** Modal para aceptar con tiempo estimado. */
export function AcceptModal({ order, open, onClose, onDone }: { order: OrderView; open: boolean; onClose: () => void; onDone?: () => void }) {
  const { busy, run } = useOrderMutation();
  const [eta, setEta] = useState<number>(order.estimatedMinutes && ETA_CHIPS.includes(order.estimatedMinutes) ? order.estimatedMinutes : 25);
  const accept = async (m: number) => {
    const r = await run('accept', () => api.post<OrderView>(`/orders/${order.id}/accept`, { estimatedMinutes: m }), `Pedido ${order.folio} aceptado`);
    if (r) {
      sounds.success();
      onDone?.();
      onClose();
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Aceptar ${order.folio}`} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button size="lg" icon={<Check className="h-5 w-5" />} loading={busy === 'accept'} onClick={() => accept(eta)}>Aceptar · {eta} min</Button></>}>
      <p className="mb-3 text-sm text-ink-soft">¿En cuánto tiempo estará {order.type === 'DOMICILIO' ? 'entregado' : 'listo para recoger'}? Se le avisa al cliente.</p>
      <div className="grid grid-cols-5 gap-2">
        {ETA_CHIPS.map((m) => (
          <button key={m} onClick={() => setEta(m)} onDoubleClick={() => accept(m)}
            className={clsx('h-14 rounded-2xl border-2 text-lg font-bold tabular-nums transition', eta === m ? 'border-brand bg-brand text-white' : 'border-line bg-surface-raised hover:border-brand/50')}>
            {m}
            <span className="block text-[10px] font-medium leading-none opacity-80">min</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Selector de repartidor con carga y efectivo pendiente. */
export function DriverPickerModal({ order, open, onClose }: { order: OrderView; open: boolean; onClose: () => void }) {
  const drivers = useDrivers();
  const { busy, run } = useOrderMutation();
  const navigate = useNavigate();
  const assign = async (driverId: string | null) => {
    const r = await run(driverId ?? 'none', () => api.post<OrderView>(`/orders/${order.id}/assign-driver`, { driverId }), driverId ? 'Repartidor asignado' : 'Repartidor quitado');
    if (r) onClose();
  };
  const list = (drivers.data ?? []).filter((d) => d.active);
  return (
    <Modal open={open} onClose={onClose} title={`Repartidor para ${order.folio}`} size="sm">
      {drivers.isLoading ? (
        <div className="grid place-items-center py-10"><Spinner /></div>
      ) : !list.length ? (
        <div className="py-8 text-center text-sm text-ink-mute">
          No hay repartidores activos.
          <button className="mt-2 block w-full font-semibold text-brand" onClick={() => navigate('/admin/equipo')}>Crear usuario repartidor</button>
        </div>
      ) : (
        <div className="-mx-2 space-y-1">
          {list.map((d) => {
            const current = order.driverId === d.id;
            return (
              <button key={d.id} disabled={!!busy} onClick={() => assign(d.id)}
                className={clsx('flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition', current ? 'bg-brand/10 ring-2 ring-brand' : 'hover:bg-surface-sunken')}>
                <Avatar name={d.name} color={d.avatarColor ?? undefined} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{d.name}</span>
                  <span className="block text-xs text-ink-mute">
                    {d.activeOrders ? `${d.activeOrders} pedido${d.activeOrders > 1 ? 's' : ''} activo${d.activeOrders > 1 ? 's' : ''}` : 'Libre'}
                    {d.onTheWay ? ` · ${d.onTheWay} en camino` : ''}
                  </span>
                </span>
                {d.unsettledCashCents > 0 && <span className="chip bg-warn/15 text-warn" title="Efectivo por liquidar">{money(d.unsettledCashCents)}</span>}
                {busy === d.id ? <Spinner className="h-4 w-4" /> : current && <Check className="h-5 w-5 text-brand" />}
              </button>
            );
          })}
          {order.driverId && (
            <button onClick={() => assign(null)} className="mt-2 w-full rounded-xl py-2.5 text-sm font-semibold text-danger hover:bg-danger/10">Quitar repartidor</button>
          )}
        </div>
      )}
    </Modal>
  );
}

interface ActionDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'outline';
  onClick: () => void;
  primary?: boolean;
  short?: string;
}

/** Botones de acción según el estado. `compact` = tarjeta del monitor. */
export function OrderActions({ order, compact, onAccepted }: { order: OrderView; compact?: boolean; onAccepted?: () => void }) {
  const { busy, run } = useOrderMutation();
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [driverOpen, setDriverOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const s = order.status;
  const isDelivery = order.type === 'DOMICILIO';
  const closed = ['ENTREGADO', 'RECOGIDO', 'RECHAZADO', 'CANCELADO'].includes(s);

  const setStatus = (status: string, msg: string) => run(status, () => api.post<OrderView>(`/orders/${order.id}/status`, { status }), msg);

  const reject = async () => {
    const reason = await confirm({ title: `Rechazar ${order.folio}`, description: 'Se le avisará al cliente con este motivo.', danger: true, confirmText: 'Rechazar pedido', input: { label: 'Motivo', placeholder: 'Ej. nos quedamos sin producto, fuera de horario…', required: true } });
    if (reason) await run('reject', () => api.post<OrderView>(`/orders/${order.id}/reject`, { reason }), 'Pedido rechazado');
    if (reason) onAccepted?.();
  };
  const cancel = async () => {
    const reason = await confirm({ title: `Cancelar ${order.folio}`, description: 'El pedido se cerrará y se notificará al cliente.', danger: true, confirmText: 'Cancelar pedido', cancelText: 'Volver', input: { label: 'Motivo de cancelación', required: true } });
    if (reason) await run('cancel', () => api.post<OrderView>(`/orders/${order.id}/cancel`, { reason }), 'Pedido cancelado');
  };
  const reprint = () => run('reprint', () => api.post<{ ok: boolean }>(`/orders/${order.id}/reprint`), 'Enviado a imprimir');
  const togglePaid = () => run('paid', () => api.patch<OrderView>(`/orders/${order.id}/paid`, { paid: !order.paid }), order.paid ? 'Marcado como no pagado' : 'Marcado como pagado');
  const delivered = async () => {
    if (order.paymentMethod === 'EFECTIVO' && !order.paid && !compact) {
      // el repartidor cobra; sólo informativo
    }
    await setStatus(isDelivery ? 'ENTREGADO' : 'RECOGIDO', isDelivery ? 'Pedido entregado' : 'Pedido recogido');
  };

  const acts: ActionDef[] = [];
  if (s === 'NUEVO') {
    acts.push({ key: 'accept', label: 'Aceptar', icon: <Check className="h-5 w-5" />, variant: 'primary', primary: true, onClick: () => setAcceptOpen(true) });
    acts.push({ key: 'reject', label: 'Rechazar', icon: <X className="h-4 w-4" />, variant: 'outline', primary: true, onClick: reject });
  }
  if (s === 'ACEPTADO') {
    acts.push({ key: 'EN_PREPARACION', label: 'En preparación', short: 'Preparar', icon: <ChefHat className="h-4 w-4" />, variant: 'primary', primary: true, onClick: () => setStatus('EN_PREPARACION', 'En preparación') });
    acts.push({ key: 'LISTO', label: 'Listo', icon: <PackageCheck className="h-4 w-4" />, variant: 'outline', primary: !compact, onClick: () => setStatus('LISTO', 'Pedido listo') });
  }
  if (s === 'EN_PREPARACION') acts.push({ key: 'LISTO', label: 'Listo', icon: <PackageCheck className="h-4 w-4" />, variant: 'success', primary: true, onClick: () => setStatus('LISTO', 'Pedido listo') });
  if (s === 'LISTO') {
    if (isDelivery) {
      if (!order.driverId) acts.push({ key: 'driver', label: 'Asignar repartidor', short: 'Repartidor', icon: <UserPlus className="h-4 w-4" />, variant: 'primary', primary: true, onClick: () => setDriverOpen(true) });
      acts.push({ key: 'EN_CAMINO', label: 'En camino', icon: <Truck className="h-4 w-4" />, variant: order.driverId ? 'primary' : 'outline', primary: true, onClick: () => setStatus('EN_CAMINO', 'Pedido en camino') });
    } else acts.push({ key: 'RECOGIDO', label: 'Recogido', icon: <CheckCheck className="h-4 w-4" />, variant: 'success', primary: true, onClick: delivered });
  }
  if (s === 'EN_CAMINO') acts.push({ key: 'ENTREGADO', label: 'Entregado', icon: <CheckCheck className="h-4 w-4" />, variant: 'success', primary: true, onClick: delivered });
  if (!closed && isDelivery && !(s === 'LISTO' && !order.driverId))
    acts.push({ key: 'driver', label: order.driverId ? 'Cambiar repartidor' : 'Asignar repartidor', icon: <Bike className="h-4 w-4" />, variant: 'outline', onClick: () => setDriverOpen(true) });
  if (!['RECHAZADO', 'CANCELADO'].includes(s)) acts.push({ key: 'paid', label: order.paid ? 'Marcar no pagado' : 'Marcar pagado', icon: <CircleDollarSign className="h-4 w-4" />, variant: 'outline', onClick: togglePaid });
  if (s !== 'NUEVO') acts.push({ key: 'reprint', label: 'Reimprimir', icon: <Printer className="h-4 w-4" />, variant: 'outline', onClick: reprint });
  if (!closed && s !== 'NUEVO') acts.push({ key: 'cancel', label: 'Cancelar pedido', icon: <Ban className="h-4 w-4" />, variant: 'danger', onClick: cancel });

  const primary = acts.filter((a) => a.primary);
  const secondary = acts.filter((a) => !a.primary);

  return (
    <>
      {compact ? (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {primary.map((a, i) =>
            i === 0 ? (
              <Button key={a.key} size="lg" variant={a.variant} icon={primary.length + (secondary.length ? 1 : 0) > 2 ? undefined : a.icon} loading={busy === a.key} onClick={a.onClick} className="min-w-0 flex-1 whitespace-nowrap !h-11 !px-2 !text-sm">
                {a.short ?? a.label}
              </Button>
            ) : (
              <Button key={a.key} size="lg" variant="outline" loading={busy === a.key} onClick={a.onClick} aria-label={a.label} title={a.label} className={clsx('!h-11 !w-11 !px-0', a.key === 'reject' && 'text-danger')}>
                {busy === a.key ? null : a.icon}
              </Button>
            ),
          )}
          {secondary.length > 0 && (
            <Button variant="outline" size="lg" aria-label="Más acciones" className="!h-11 !w-11 !px-0" onClick={() => setMoreOpen(true)}><MoreHorizontal className="h-5 w-5" /></Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {primary.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {primary.map((a) => (
                <Button key={a.key} size="xl" variant={a.variant} icon={a.icon} loading={busy === a.key} onClick={a.onClick} className="min-w-[8rem] flex-1">{a.label}</Button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {secondary.map((a) => (
              <Button key={a.key} variant={a.variant === 'danger' ? 'ghost' : 'outline'} icon={a.icon} loading={busy === a.key} onClick={a.onClick} className={clsx(a.variant === 'danger' && 'text-danger hover:bg-danger/10')}>{a.label}</Button>
            ))}
          </div>
        </div>
      )}
      <AcceptModal order={order} open={acceptOpen} onClose={() => setAcceptOpen(false)} onDone={onAccepted} />
      <DriverPickerModal order={order} open={driverOpen} onClose={() => setDriverOpen(false)} />
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={`${order.folio} · ${order.customerName}`} size="sm">
        <div className="-mx-2 space-y-1">
          {secondary.map((a) => (
            <button key={a.key} onClick={() => { setMoreOpen(false); a.onClick(); }} className={clsx('flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium hover:bg-surface-sunken', a.variant === 'danger' && 'text-danger')}>
              {a.icon}{a.label}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
