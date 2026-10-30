import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Check, Copy, Percent, Plus, Tag, Ticket, Trash2, Truck, Gift, DollarSign } from 'lucide-react';
import type { OrderChannel } from '@rh/shared';
import { api } from '@/lib/api';
import { fmtDate, money } from '@/lib/format';
import { Button, EmptyState, ErrorState, Input, Modal, PageHeader, Skeleton, Tabs, Toggle, confirm, toast } from '@/ui';
import { CHANNEL_LABEL, MoneyInput, useMenu, WEEKDAY_LONG, WEEKDAY_SHORT, type Coupon, type Promotion, type PromotionKind } from '@/features/delivery-common';

const CHANNELS: OrderChannel[] = ['WHATSAPP', 'WEB', 'TELEFONO', 'MOSTRADOR'];

const KINDS: { value: PromotionKind; label: string; hint: string; icon: React.ReactNode }[] = [
  { value: 'PERCENT_OFF', label: '% de descuento', hint: 'Ej. 15% en hamburguesas', icon: <Percent className="h-5 w-5" /> },
  { value: 'AMOUNT_OFF', label: 'Monto de descuento', hint: 'Ej. $30 menos', icon: <DollarSign className="h-5 w-5" /> },
  { value: 'BUY_X_GET_Y', label: 'Compra X lleva Y', hint: '2x1, 3x2…', icon: <Gift className="h-5 w-5" /> },
  { value: 'FREE_DELIVERY', label: 'Envío gratis', hint: 'Sobre un monto mínimo', icon: <Truck className="h-5 w-5" /> },
];

/** Fecha ISO → YYYY-MM-DD local para inputs; y vuelta. */
const toInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA') : '');
const fromInput = (v: string, end = false) => (v ? new Date(`${v}T${end ? '23:59:59' : '00:00:00'}`).toISOString() : null);

function promoSummary(p: Promotion): string {
  switch (p.kind) {
    case 'PERCENT_OFF': return `${p.value}% de descuento`;
    case 'AMOUNT_OFF': return `${money(p.value)} de descuento`;
    case 'BUY_X_GET_Y': return `${p.buyQty}x${(p.buyQty ?? 0) - (p.getQty ?? 0)} (compra ${p.buyQty}, paga ${(p.buyQty ?? 0) - (p.getQty ?? 0)})`;
    case 'FREE_DELIVERY': return 'Envío gratis';
  }
}
function whenSummary(x: { weekdays?: number[]; timeFrom?: string | null; timeTo?: string | null; startsAt: string | null; endsAt: string | null }): string {
  const parts: string[] = [];
  if (x.weekdays?.length && x.weekdays.length < 7) parts.push(x.weekdays.length === 1 ? `Cada ${WEEKDAY_LONG[x.weekdays[0]].toLowerCase()}` : x.weekdays.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_SHORT[d]).join(', '));
  if (x.timeFrom || x.timeTo) parts.push(`${x.timeFrom ?? '00:00'}–${x.timeTo ?? '24:00'}`);
  if (x.startsAt || x.endsAt) parts.push(`${x.startsAt ? fmtDate(x.startsAt) : '…'} al ${x.endsAt ? fmtDate(x.endsAt) : '…'}`);
  return parts.join(' · ') || 'Siempre';
}

export function PromosPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'promociones' | 'cupones') ?? 'promociones';
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Promociones y cupones" subtitle="Descuentos automáticos y códigos para tus clientes" />
      <Tabs className="mb-4 w-fit" value={tab} onChange={(v) => setParams(v === 'promociones' ? {} : { tab: v }, { replace: true })}
        items={[{ value: 'promociones', label: <><Tag className="h-4 w-4" />Promociones</> }, { value: 'cupones', label: <><Ticket className="h-4 w-4" />Cupones</> }]} />
      {tab === 'promociones' ? <PromotionsTab /> : <CouponsTab />}
    </div>
  );
}

function ChannelChips({ value, onChange }: { value: OrderChannel[]; onChange: (v: OrderChannel[]) => void }) {
  return (
    <div>
      <span className="label">Canales</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange([])} className={clsx('chip h-9 border px-3 text-sm', !value.length ? 'border-brand bg-brand text-white' : 'border-line text-ink-soft')}>Todos</button>
        {CHANNELS.map((c) => {
          const on = value.includes(c);
          return (
            <button key={c} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== c) : [...value, c])}
              className={clsx('chip h-9 border px-3 text-sm', on ? 'border-brand bg-brand/15 text-brand' : 'border-line text-ink-soft')}>
              {on && <Check className="h-3.5 w-3.5" />}{CHANNEL_LABEL[c]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActiveDot({ active, masc }: { active: boolean; masc?: boolean }) {
  return <span className={clsx('chip', active ? 'bg-ok/15 text-ok' : 'bg-surface-sunken text-ink-mute')}>{active ? (masc ? 'Activo' : 'Activa') : masc ? 'Pausado' : 'Pausada'}</span>;
}

// ---------------- Promociones ----------------
function PromotionsTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['promotions'], queryFn: () => api.get<Promotion[]>('/promotions') });
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null);
  const toggle = async (p: Promotion) => {
    qc.setQueryData<Promotion[]>(['promotions'], (o) => o?.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)));
    try {
      await api.patch(`/promotions/${p.id}`, { active: !p.active });
    } catch (e) {
      toast.fromError(e);
      void qc.invalidateQueries({ queryKey: ['promotions'] });
    }
  };
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  return (
    <>
      <div className="mb-3 flex justify-end"><Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Promoción</Button></div>
      {list.isLoading ? <Skeleton className="h-32" /> : !list.data?.length ? (
        <EmptyState icon={<Tag className="h-7 w-7" />} title="Sin promociones" description="Ej. “Martes de tacos 2x1” o “Envío gratis en pedidos de $300+”. Se aplican solas al cotizar." action={<Button onClick={() => setEditing('new')}>Crear promoción</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((p) => (
            <article key={p.id} className={clsx('card flex gap-3 p-4', !p.active && 'opacity-70')}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand/15 text-brand">{KINDS.find((k) => k.value === p.kind)?.icon}</span>
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(p)}>
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-ink-soft">{promoSummary(p)}{p.minOrderCents ? ` · mín. ${money(p.minOrderCents)}` : ''}</p>
                <p className="mt-0.5 text-xs text-ink-mute">{whenSummary(p)}{p.channels.length ? ` · ${p.channels.map((c) => CHANNEL_LABEL[c]).join(', ')}` : ''}</p>
              </button>
              <div className="flex flex-col items-end gap-2">
                <ActiveDot active={p.active} />
                <Toggle checked={p.active} onChange={() => toggle(p)} />
              </div>
            </article>
          ))}
        </div>
      )}
      <PromotionEditor open={!!editing} promo={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    </>
  );
}

type PromoDraft = Omit<Promotion, 'id'>;
const emptyPromo = (): PromoDraft => ({ name: '', kind: 'PERCENT_OFF', value: 10, buyQty: 2, getQty: 1, minOrderCents: 0, productIds: [], categoryIds: [], weekdays: [], timeFrom: null, timeTo: null, channels: [], startsAt: null, endsAt: null, active: true });

function PromotionEditor({ open, promo, onClose }: { open: boolean; promo: Promotion | null; onClose: () => void }) {
  const qc = useQueryClient();
  const menu = useMenu('pos');
  const [d, setD] = useState<PromoDraft>(emptyPromo());
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (promo) {
      const { id: _id, ...rest } = promo;
      setD({ ...emptyPromo(), ...rest, buyQty: rest.buyQty ?? 2, getQty: rest.getQty ?? 1 });
    } else setD(emptyPromo());
  }, [open, promo]);
  const set = <K extends keyof PromoDraft>(k: K, v: PromoDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const cats = menu.data ?? [];
  const allProducts = useMemo(() => cats.flatMap((c) => c.products.map((p) => ({ ...p, cat: c.name }))), [cats]);
  const applies = d.kind !== 'FREE_DELIVERY';

  const save = async () => {
    if (!d.name.trim()) return toast.error('Ponle nombre a la promoción');
    if (d.kind === 'BUY_X_GET_Y' && (!d.buyQty || !d.getQty || d.getQty >= d.buyQty)) return toast.error('En “Compra X lleva Y”, lo gratis debe ser menor que lo que compra');
    if (d.kind === 'PERCENT_OFF' && (d.value <= 0 || d.value > 100)) return toast.error('El porcentaje debe ser de 1 a 100');
    setSaving(true);
    try {
      const body = { ...d, name: d.name.trim(), value: d.kind === 'BUY_X_GET_Y' || d.kind === 'FREE_DELIVERY' ? 0 : d.value, buyQty: d.kind === 'BUY_X_GET_Y' ? d.buyQty : null, getQty: d.kind === 'BUY_X_GET_Y' ? d.getQty : null, timeFrom: d.timeFrom || null, timeTo: d.timeTo || null };
      if (promo) await api.patch(`/promotions/${promo.id}`, body);
      else await api.post('/promotions', body);
      await qc.invalidateQueries({ queryKey: ['promotions'] });
      toast.success('Promoción guardada');
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!promo || !(await confirm({ title: `¿Eliminar “${promo.name}”?`, danger: true, confirmText: 'Eliminar' }))) return;
    try {
      await api.del(`/promotions/${promo.id}`);
      await qc.invalidateQueries({ queryKey: ['promotions'] });
      onClose();
    } catch (e) {
      toast.fromError(e);
    }
  };

  const toggleIn = (k: 'productIds' | 'categoryIds' | 'weekdays', v: string | number) =>
    setD((x) => ({ ...x, [k]: (x[k] as (string | number)[]).includes(v) ? (x[k] as (string | number)[]).filter((y) => y !== v) : [...(x[k] as (string | number)[]), v] }));

  return (
    <Modal open={open} onClose={onClose} title={promo ? 'Editar promoción' : 'Nueva promoción'} size="lg"
      footer={<>{promo && <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Eliminar</Button>}<Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Guardar</Button></>}>
      <div className="space-y-5">
        <Input label="Nombre (lo ve el cliente)" value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder="Martes de tacos 2x1" />
        <div>
          <span className="label">Tipo de promoción</span>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button key={k.value} type="button" onClick={() => set('kind', k.value)} aria-pressed={d.kind === k.value}
                className={clsx('flex items-start gap-2 rounded-2xl border-2 p-3 text-left transition', d.kind === k.value ? 'border-brand bg-brand/10' : 'border-line hover:border-brand/40')}>
                <span className={d.kind === k.value ? 'text-brand' : 'text-ink-mute'}>{k.icon}</span>
                <span><span className="block text-sm font-semibold">{k.label}</span><span className="block text-xs text-ink-mute">{k.hint}</span></span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {d.kind === 'PERCENT_OFF' && <Input label="Porcentaje" type="number" min={1} max={100} value={d.value} onChange={(e) => set('value', Math.max(0, Math.min(100, +e.target.value || 0)))} />}
          {d.kind === 'AMOUNT_OFF' && <MoneyInput label="Descuento" valueCents={d.value} onChangeCents={(c) => set('value', c ?? 0)} />}
          {d.kind === 'BUY_X_GET_Y' && (
            <div className="sm:col-span-2">
              <div className="mb-2 flex flex-wrap gap-2">
                {[[2, 1, '2x1'], [3, 1, '3x2'], [4, 1, '4x3']].map(([b, g, l]) => (
                  <button key={l} type="button" onClick={() => setD((x) => ({ ...x, buyQty: b as number, getQty: g as number }))} className={clsx('chip h-9 border px-3 text-sm', d.buyQty === b && d.getQty === g ? 'border-brand bg-brand text-white' : 'border-line text-ink-soft')}>{l}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Lleva (piezas)" type="number" min={2} max={20} value={d.buyQty ?? 2} onChange={(e) => set('buyQty', Math.max(2, +e.target.value || 2))} />
                <Input label="Gratis" type="number" min={1} max={19} value={d.getQty ?? 1} onChange={(e) => set('getQty', Math.max(1, +e.target.value || 1))} />
              </div>
              <p className="mt-1 text-xs text-ink-mute">Lleva {d.buyQty}, paga {(d.buyQty ?? 0) - (d.getQty ?? 0)}. Se regala el más barato.</p>
            </div>
          )}
          <MoneyInput label="Pedido mínimo" hint="0 = sin mínimo" valueCents={d.minOrderCents} onChangeCents={(c) => set('minOrderCents', c ?? 0)} />
        </div>

        {applies && (
          <div>
            <span className="label">¿A qué aplica?</span>
            <p className="mb-2 text-xs text-ink-mute">Si no eliges nada, aplica a todo el menú.</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {cats.map((c) => {
                const on = d.categoryIds.includes(c.id);
                return <button key={c.id} type="button" onClick={() => toggleIn('categoryIds', c.id)} aria-pressed={on} className={clsx('chip h-8 border px-3', on ? 'border-brand bg-brand text-white' : 'border-line text-ink-soft')}>{c.name}</button>;
              })}
            </div>
            <details className="rounded-2xl border border-line">
              <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">Productos específicos {d.productIds.length ? `(${d.productIds.length})` : ''}</summary>
              <div className="max-h-56 space-y-0.5 overflow-y-auto px-2 pb-2 scroll-thin">
                {allProducts.map((p) => {
                  const on = d.productIds.includes(p.id);
                  return (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-sunken">
                      <input type="checkbox" checked={on} onChange={() => toggleIn('productIds', p.id)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                      <span className="flex-1">{p.name}</span><span className="text-xs text-ink-mute">{p.cat}</span>
                    </label>
                  );
                })}
              </div>
            </details>
          </div>
        )}

        <div>
          <span className="label">Días</span>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
              const on = d.weekdays.includes(wd);
              return <button key={wd} type="button" aria-pressed={on} onClick={() => toggleIn('weekdays', wd)} className={clsx('h-10 w-12 rounded-xl border text-sm font-semibold', on ? 'border-brand bg-brand text-white' : 'border-line text-ink-soft')}>{WEEKDAY_SHORT[wd]}</button>;
            })}
          </div>
          <p className="mt-1 text-xs text-ink-mute">{d.weekdays.length ? '' : 'Ninguno marcado = todos los días.'}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label><span className="label">Desde la hora</span><input type="time" className="input" value={d.timeFrom ?? ''} onChange={(e) => set('timeFrom', e.target.value || null)} /></label>
          <label><span className="label">Hasta la hora</span><input type="time" className="input" value={d.timeTo ?? ''} onChange={(e) => set('timeTo', e.target.value || null)} /></label>
          <label><span className="label">Inicia</span><input type="date" className="input" value={toInput(d.startsAt)} onChange={(e) => set('startsAt', fromInput(e.target.value))} /></label>
          <label><span className="label">Termina</span><input type="date" className="input" value={toInput(d.endsAt)} onChange={(e) => set('endsAt', fromInput(e.target.value, true))} /></label>
        </div>
        <ChannelChips value={d.channels} onChange={(v) => set('channels', v)} />
        <Toggle label="Activa" checked={d.active} onChange={(v) => set('active', v)} />
      </div>
    </Modal>
  );
}

// ---------------- Cupones ----------------
function CouponsTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['coupons'], queryFn: () => api.get<Coupon[]>('/coupons') });
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Código ${code} copiado`);
    } catch {
      window.prompt('Copia el código', code);
    }
  };
  const toggle = async (c: Coupon) => {
    qc.setQueryData<Coupon[]>(['coupons'], (o) => o?.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)));
    try {
      await api.patch(`/coupons/${c.id}`, { active: !c.active });
    } catch (e) {
      toast.fromError(e);
      void qc.invalidateQueries({ queryKey: ['coupons'] });
    }
  };
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  return (
    <>
      <div className="mb-3 flex justify-end"><Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Cupón</Button></div>
      {list.isLoading ? <Skeleton className="h-32" /> : !list.data?.length ? (
        <EmptyState icon={<Ticket className="h-7 w-7" />} title="Sin cupones" description="Crea códigos como BIENVENIDO o ENVIOGRATIS para compartir por WhatsApp." action={<Button onClick={() => setEditing('new')}>Crear cupón</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((c) => (
            <article key={c.id} className={clsx('card relative overflow-hidden p-4', !c.active && 'opacity-70')}>
              <div className="flex items-start gap-3">
                <button onClick={() => setEditing(c)} className="min-w-0 flex-1 text-left">
                  <p className="font-mono text-lg font-bold tracking-wider">{c.code}</p>
                  <p className="text-sm text-ink-soft">
                    {c.discountType === 'PERCENT' ? (c.value ? `${c.value}% de descuento` : '') : c.value ? `${money(c.value)} de descuento` : ''}
                    {c.freeDelivery ? (c.value ? ' + envío gratis' : 'Envío gratis') : ''}
                    {c.maxDiscountCents ? ` (tope ${money(c.maxDiscountCents)})` : ''}
                  </p>
                  {c.description && <p className="text-xs text-ink-mute">{c.description}</p>}
                  <p className="mt-1 text-xs text-ink-mute">
                    Usado {c.usesCount}{c.maxUses ? ` de ${c.maxUses}` : ''} {c.usesCount === 1 && !c.maxUses ? 'vez' : 'veces'}
                    {c.maxUsesPerCustomer ? ` · ${c.maxUsesPerCustomer} por cliente` : ''}
                    {c.minOrderCents ? ` · mín. ${money(c.minOrderCents)}` : ''}
                    {' · '}{whenSummary(c)}
                  </p>
                </button>
                <div className="flex flex-col items-end gap-2">
                  <ActiveDot masc active={c.active} />
                  <Toggle checked={c.active} onChange={() => toggle(c)} />
                </div>
              </div>
              <Button size="sm" variant="outline" className="mt-3" icon={<Copy className="h-4 w-4" />} onClick={() => copy(c.code)}>Copiar código</Button>
            </article>
          ))}
        </div>
      )}
      <CouponEditor open={!!editing} coupon={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    </>
  );
}

type CouponDraft = Omit<Coupon, 'id' | 'usesCount'>;
const emptyCoupon = (): CouponDraft => ({ code: '', description: '', discountType: 'PERCENT', value: 10, maxDiscountCents: null, minOrderCents: 0, freeDelivery: false, startsAt: null, endsAt: null, maxUses: null, maxUsesPerCustomer: 1, channels: [], active: true });

function CouponEditor({ open, coupon, onClose }: { open: boolean; coupon: Coupon | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<CouponDraft>(emptyCoupon());
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (coupon) {
      const { id: _i, usesCount: _u, ...rest } = coupon;
      setD({ ...rest, description: rest.description ?? '' });
    } else setD(emptyCoupon());
  }, [open, coupon]);
  const set = <K extends keyof CouponDraft>(k: K, v: CouponDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!/^[A-Z0-9_-]{3,30}$/.test(d.code)) return toast.error('Código inválido', '3 a 30 letras, números, guion o guion bajo');
    if (d.discountType === 'PERCENT' && d.value > 100) return toast.error('El porcentaje debe ser de 0 a 100');
    if (!d.value && !d.freeDelivery) return toast.error('El cupón no da ningún beneficio', 'Pon un descuento o activa envío gratis');
    setSaving(true);
    try {
      const { code, ...rest } = d;
      const body = { ...rest, description: d.description?.trim() || null };
      if (coupon) await api.patch(`/coupons/${coupon.id}`, body);
      else await api.post('/coupons', { code, ...body });
      await qc.invalidateQueries({ queryKey: ['coupons'] });
      toast.success('Cupón guardado');
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!coupon || !(await confirm({ title: `¿Eliminar ${coupon.code}?`, danger: true, confirmText: 'Eliminar' }))) return;
    try {
      await api.del(`/coupons/${coupon.id}`);
      await qc.invalidateQueries({ queryKey: ['coupons'] });
      onClose();
    } catch (e) {
      toast.fromError(e);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={coupon ? `Cupón ${coupon.code}` : 'Nuevo cupón'} size="lg"
      footer={<>{coupon && <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>Eliminar</Button>}<Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Guardar</Button></>}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Código" value={d.code} disabled={!!coupon} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} maxLength={30} placeholder="BIENVENIDO" className="[&_input]:font-mono [&_input]:uppercase [&_input]:tracking-wider" hint={coupon ? 'El código no se puede cambiar' : undefined} />
          <Input label="Descripción (opcional)" value={d.description ?? ''} onChange={(e) => set('description', e.target.value)} maxLength={200} placeholder="10% en tu primer pedido" />
        </div>
        <div>
          <span className="label">Descuento</span>
          <div className="mb-2 grid w-full max-w-xs grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1">
            {(['PERCENT', 'AMOUNT'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setD((x) => ({ ...x, discountType: t, value: t === 'PERCENT' ? 10 : 5000 }))} className={clsx('h-9 rounded-lg text-sm font-semibold', d.discountType === t ? 'bg-surface-raised shadow-sm' : 'text-ink-mute')}>{t === 'PERCENT' ? 'Porcentaje' : 'Monto fijo'}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {d.discountType === 'PERCENT' ? (
              <Input label="Porcentaje (%)" type="number" min={0} max={100} value={d.value} onChange={(e) => set('value', Math.max(0, Math.min(100, +e.target.value || 0)))} />
            ) : (
              <MoneyInput label="Monto" valueCents={d.value} onChangeCents={(c) => set('value', c ?? 0)} />
            )}
            {d.discountType === 'PERCENT' && <MoneyInput label="Descuento máximo" hint="Vacío = sin tope" valueCents={d.maxDiscountCents} onChangeCents={(c) => set('maxDiscountCents', c)} placeholder="—" />}
            <MoneyInput label="Pedido mínimo" valueCents={d.minOrderCents} onChangeCents={(c) => set('minOrderCents', c ?? 0)} />
          </div>
        </div>
        <Toggle label="Envío gratis" description="Además (o en lugar) del descuento." checked={d.freeDelivery} onChange={(v) => set('freeDelivery', v)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Usos totales" type="number" min={1} placeholder="Ilimitado" value={d.maxUses ?? ''} onChange={(e) => set('maxUses', e.target.value ? Math.max(1, +e.target.value) : null)} />
          <Input label="Usos por cliente" type="number" min={1} placeholder="Ilimitado" value={d.maxUsesPerCustomer ?? ''} onChange={(e) => set('maxUsesPerCustomer', e.target.value ? Math.max(1, +e.target.value) : null)} />
          <label><span className="label">Válido desde</span><input type="date" className="input" value={toInput(d.startsAt)} onChange={(e) => set('startsAt', fromInput(e.target.value))} /></label>
          <label><span className="label">Válido hasta</span><input type="date" className="input" value={toInput(d.endsAt)} onChange={(e) => set('endsAt', fromInput(e.target.value, true))} /></label>
        </div>
        <ChannelChips value={d.channels} onChange={(v) => set('channels', v)} />
        <Toggle label="Activo" checked={d.active} onChange={(v) => set('active', v)} />
        {coupon && <p className="text-sm text-ink-mute">Se ha usado {coupon.usesCount} {coupon.usesCount === 1 ? 'vez' : 'veces'}.</p>}
      </div>
    </Modal>
  );
}
