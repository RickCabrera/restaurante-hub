import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, MessageCircle, Pencil, Phone, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, money } from '@/lib/format';
import { Avatar, Button, EmptyState, ErrorState, Input, Modal, PageLoader, StatCard, Textarea, confirm, toast } from '@/ui';
import {
  AddressSearch, ChannelIcon, fmtPhone, MapView, OrderStatusBadge, PinPicker, telLink, waLink, type Address, type CustomerDetail,
} from '@/features/delivery-common';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api.get<CustomerDetail>(`/customers/${id}`) });
  const [editAddr, setEditAddr] = useState<Address | 'new' | null>(null);
  const [editInfo, setEditInfo] = useState(false);

  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  const pins = c.addresses.filter((a) => a.lat != null && a.lng != null);

  const removeAddr = async (a: Address) => {
    if (!(await confirm({ title: '¿Eliminar dirección?', description: a.text, danger: true, confirmText: 'Eliminar' }))) return;
    try {
      await api.del(`/customers/${c.id}/addresses/${a.id}`);
      await qc.invalidateQueries({ queryKey: ['customer', id] });
    } catch (e) {
      toast.fromError(e);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/admin/clientes" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-mute hover:text-ink"><ArrowLeft className="h-4 w-4" />Clientes</Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Avatar name={c.name || '?'} size={56} color="rgb(var(--brand))" />
        <div className="min-w-0 flex-1">
          <h1 className="h-display truncate text-2xl font-bold sm:text-3xl">{c.name || 'Sin nombre'}</h1>
          <p className="text-sm text-ink-mute">{fmtPhone(c.phone)} · cliente desde {fmtDate(c.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <a href={telLink(c.phone)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-sunken"><Phone className="h-4 w-4" />Llamar</a>
          <a href={waLink(c.phone)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-sunken"><MessageCircle className="h-4 w-4 text-ok" />WhatsApp</a>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Pedidos" value={c.stats.ordersCount} hint={c.stats.cancelledCount ? `${c.stats.cancelledCount} cancelados` : undefined} />
        <StatCard label="Total gastado" value={money(c.stats.totalSpentCents)} />
        <StatCard label="Ticket promedio" value={money(c.stats.avgTicketCents)} />
        <StatCard label="Último pedido" value={<span className="text-lg">{c.stats.lastOrderAt ? fmtDate(c.stats.lastOrderAt) : '—'}</span>} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="h-display font-semibold">Notas y etiquetas</h2>
              <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditInfo(true)}>Editar</Button>
            </div>
            {c.tags.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5">{c.tags.map((t) => <span key={t} className="chip bg-brand/15 text-brand">{t}</span>)}</div>
            ) : null}
            <p className="whitespace-pre-wrap text-sm text-ink-soft">{c.notes || <span className="text-ink-mute">Sin notas. Ej. “Alérgico al cacahuate”, “Siempre pide salsa extra”.</span>}</p>
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="h-display font-semibold">Direcciones</h2>
              <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setEditAddr('new')}>Agregar</Button>
            </div>
            {pins.length > 0 && <MapView className="mb-3" height={220} markers={pins.map((a, i) => ({ id: a.id, lat: a.lat!, lng: a.lng!, label: String(i + 1), popup: a.text }))} />}
            {!c.addresses.length ? (
              <p className="py-4 text-center text-sm text-ink-mute">Sin direcciones guardadas.</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.addresses.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-2.5">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <div className="min-w-0 flex-1 text-sm">
                      {a.label && <p className="text-xs font-bold uppercase text-ink-mute">{a.label}</p>}
                      <p className="font-medium">{a.text}</p>
                      {a.references && <p className="text-ink-mute">{a.references}</p>}
                      {a.lat == null && <p className="text-xs text-warn">Sin ubicación en mapa</p>}
                    </div>
                    <button className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken" aria-label="Editar dirección" onClick={() => setEditAddr(a)}><Pencil className="h-4 w-4" /></button>
                    <button className="grid h-8 w-8 place-items-center rounded-lg text-danger hover:bg-danger/10" aria-label="Eliminar dirección" onClick={() => removeAddr(a)}><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="card min-w-0 p-4">
          <h2 className="h-display mb-2 font-semibold">Pedidos recientes</h2>
          {!c.recentOrders.length ? (
            <EmptyState title="Sin pedidos" className="py-8" />
          ) : (
            <ul className="-mx-2 divide-y divide-line">
              {c.recentOrders.map((o) => (
                <li key={o.id}>
                  <Link to={`/admin/pedidos/${o.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-sunken">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-sunken text-ink-soft"><ChannelIcon channel={o.channel} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="font-semibold">{o.folio}</span><OrderStatusBadge status={o.status} /></span>
                      <span className="block text-xs text-ink-mute">{fmtDateTime(o.createdAt)}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{money(o.totalCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <InfoEditor open={editInfo} customer={c} onClose={() => setEditInfo(false)} />
      <AddressEditor open={!!editAddr} customerId={c.id} address={editAddr === 'new' ? null : editAddr} onClose={() => setEditAddr(null)} />
    </div>
  );
}

function InfoEditor({ open, customer, onClose }: { open: boolean; customer: CustomerDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tag, setTag] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(customer.name ?? '');
    setNotes(customer.notes ?? '');
    setTags(customer.tags);
    setTag('');
  }, [open, customer]);
  const addTag = () => {
    const t = tag.trim();
    if (t && !tags.includes(t) && tags.length < 20) setTags([...tags, t.slice(0, 30)]);
    setTag('');
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/customers/${customer.id}`, { name: name.trim() || null, notes: notes.trim() || null, tags });
      await qc.invalidateQueries({ queryKey: ['customer', customer.id] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Cliente actualizado');
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Editar cliente" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Guardar</Button></>}>
      <div className="space-y-4">
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <Textarea label="Notas" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Preferencias, alergias, indicaciones…" />
        <div>
          <span className="label">Etiquetas</span>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="chip bg-brand/15 text-brand">{t}<button aria-label={`Quitar ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}><X className="h-3 w-3" /></button></span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="VIP, Frecuente, Oficina…" maxLength={30} />
            <Button variant="outline" onClick={addTag} disabled={!tag.trim()}>Agregar</Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['VIP', 'Frecuente', 'Mayoreo', 'Problemas de pago'].filter((s) => !tags.includes(s)).map((s) => (
              <button key={s} className="chip border border-dashed border-line text-ink-mute hover:text-ink" onClick={() => setTags([...tags, s])}>+ {s}</button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AddressEditor({ open, customerId, address, onClose }: { open: boolean; customerId: string; address: Address | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [refs, setRefs] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLabel(address?.label ?? '');
    setText(address?.text ?? '');
    setRefs(address?.references ?? '');
    setPin(address?.lat != null && address.lng != null ? { lat: address.lat, lng: address.lng } : null);
  }, [open, address]);
  const save = async () => {
    if (text.trim().length < 3) return toast.error('Escribe la dirección');
    setSaving(true);
    try {
      const body = { label: label.trim() || undefined, text: text.trim(), references: refs.trim() || undefined, lat: pin?.lat, lng: pin?.lng };
      if (address) await api.patch(`/customers/${customerId}/addresses/${address.id}`, body);
      else await api.post(`/customers/${customerId}/addresses`, body);
      await qc.invalidateQueries({ queryKey: ['customer', customerId] });
      toast.success('Dirección guardada');
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={address ? 'Editar dirección' : 'Nueva dirección'} size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Guardar</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {['Casa', 'Oficina', 'Trabajo'].map((l) => (
            <button key={l} onClick={() => setLabel(label === l ? '' : l)} className={label === l ? 'chip h-8 bg-brand px-3 text-white' : 'chip h-8 border border-line px-3 text-ink-soft'}>{l}</button>
          ))}
        </div>
        <AddressSearch label="Dirección" value={text} onChange={setText} onPick={(p) => setPin({ lat: p.lat, lng: p.lng })} />
        <Input label="Referencias" value={refs} onChange={(e) => setRefs(e.target.value)} maxLength={300} placeholder="Entre calles, color de fachada…" />
        <PinPicker value={pin} onChange={setPin} height={240} />
      </div>
    </Modal>
  );
}
