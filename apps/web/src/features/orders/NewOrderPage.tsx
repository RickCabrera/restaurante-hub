import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  AlertCircle, ArrowLeft, Bike, CheckCircle2, MapPin, Minus, Phone, Plus, Search, ShoppingBag, Store, Tag, Trash2, UserCheck,
} from 'lucide-react';
import type { PaymentMethod } from '@rh/shared';
import { api, ApiError } from '@/lib/api';
import { money } from '@/lib/format';
import { assetUrl } from '@/lib/config';
import { sounds } from '@/lib/sound';
import { Button, EmptyState, Input, PageHeader, Skeleton, Spinner, Textarea, toast } from '@/ui';
import {
  AddressSearch, MoneyInput, PinPicker, ProductModal, phoneDigits, useMenu, useBranches,
  type CartLine, type CustomerDetail, type MenuProduct, type OrderView, type Quote,
} from '@/features/delivery-common';

interface CartItem { key: string; line: CartLine; product: MenuProduct; unitCents: number; summary: string[] }

const PAYMENTS: { value: PaymentMethod; label: string }[] = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TARJETA', label: 'Tarjeta' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
];

function Seg<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; icon?: React.ReactNode }[] }) {
  return (
    <div className="grid gap-1 rounded-xl bg-surface-sunken p-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
      {items.map((it) => (
        <button key={it.value} type="button" onClick={() => onChange(it.value)} aria-pressed={value === it.value}
          className={clsx('flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition', value === it.value ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-mute hover:text-ink')}>
          {it.icon}{it.label}
        </button>
      ))}
    </div>
  );
}

export function NewOrderPage() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<'TELEFONO' | 'MOSTRADOR'>('TELEFONO');
  const [type, setType] = useState<'DOMICILIO' | 'PASAR_A_RECOGER'>('DOMICILIO');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState<CustomerDetail | null | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [addrId, setAddrId] = useState<string | 'new'>('new');
  const [addrText, setAddrText] = useState('');
  const [addrRefs, setAddrRefs] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editing, setEditing] = useState<{ product: MenuProduct; item?: CartItem } | null>(null);
  const [coupon, setCoupon] = useState('');
  const [couponApplied, setCouponApplied] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('EFECTIVO');
  const [cashGiven, setCashGiven] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [menuQ, setMenuQ] = useState('');
  const [cat, setCat] = useState<string>('');

  const branches = useBranches();
  const branchId = branches.data?.find((b) => b.active)?.id;
  const menu = useMenu(channel === 'MOSTRADOR' ? 'pos' : 'pos');

  // --- búsqueda de cliente por teléfono
  const digits = phoneDigits(phone);
  const lookup = async (p = digits) => {
    if (p.length < 10) return;
    setSearching(true);
    try {
      const c = await api.get<CustomerDetail | null>(`/customers/by-phone/${p}`);
      setCustomer(c ?? null);
      if (c) {
        if (c.name) setName(c.name);
        const first = c.addresses?.[0];
        if (first) {
          setAddrId(first.id);
        } else setAddrId('new');
      } else setAddrId('new');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setCustomer(null);
      else toast.fromError(e);
    } finally {
      setSearching(false);
    }
  };
  useEffect(() => {
    setCustomer(undefined);
    if (digits.length >= 10) {
      const t = setTimeout(() => lookup(digits), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const savedAddr = customer?.addresses?.find((a) => a.id === addrId);
  const address = type !== 'DOMICILIO'
    ? undefined
    : savedAddr
      ? { id: savedAddr.id, text: savedAddr.text, references: savedAddr.references ?? undefined, lat: savedAddr.lat ?? undefined, lng: savedAddr.lng ?? undefined }
      : addrText.trim().length >= 3
        ? { text: addrText.trim(), references: addrRefs.trim() || undefined, lat: pin?.lat, lng: pin?.lng }
        : undefined;

  // --- cotización en vivo (debounce)
  const body = useMemo(() => ({
    branchId,
    channel,
    type,
    lines: cart.map((c) => c.line),
    address,
    couponCode: couponApplied || undefined,
    customerPhone: digits.length >= 10 ? digits : undefined,
  }), [branchId, channel, type, cart, JSON.stringify(address), couponApplied, digits]); // eslint-disable-line react-hooks/exhaustive-deps
  const reqId = useRef(0);
  useEffect(() => {
    if (!cart.length) {
      setQuote(null);
      return;
    }
    const id = ++reqId.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await api.post<Quote>('/orders/quote', body);
        if (id === reqId.current) setQuote(q);
      } catch (e) {
        if (id === reqId.current) toast.fromError(e);
      } finally {
        if (id === reqId.current) setQuoting(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [body, cart.length]);

  const localSubtotal = cart.reduce((s, c) => s + c.unitCents * c.line.quantity, 0);
  const total = quote?.totalCents ?? localSubtotal;
  const couponError = quote?.errors.find((e) => e.code.startsWith('COUPON'));
  const blocking = quote?.errors.filter((e) => !e.code.startsWith('COUPON')) ?? [];

  const missing: string[] = [];
  if (digits.length < 10) missing.push('teléfono del cliente');
  if (!name.trim()) missing.push('nombre');
  if (!cart.length) missing.push('productos');
  if (type === 'DOMICILIO' && !address) missing.push('dirección');
  const canSubmit = !missing.length && !!quote?.canOrder && !quoting && !couponError;

  const submit = async () => {
    if (!canSubmit) return;
    if (payment === 'EFECTIVO' && cashGiven != null && cashGiven < total) return toast.error('El efectivo es menor que el total');
    setSubmitting(true);
    try {
      const o = await api.post<OrderView>('/orders', {
        ...body,
        customer: { phone: digits, name: name.trim() },
        paymentMethod: payment,
        cashGivenCents: payment === 'EFECTIVO' && cashGiven ? cashGiven : undefined,
        notes: notes.trim() || undefined,
        acceptPrivacy: true,
      });
      sounds.success();
      toast.success(`Pedido ${o.folio} creado`);
      navigate(`/admin/pedidos/${o.id}`, { replace: true });
    } catch (e) {
      sounds.error();
      if (e instanceof ApiError && e.data?.quote) setQuote(e.data.quote as Quote);
      toast.fromError(e);
    } finally {
      setSubmitting(false);
    }
  };

  // --- menú
  const categories = menu.data ?? [];
  const products = useMemo(() => {
    const t = menuQ.trim().toLowerCase();
    return categories
      .filter((c) => !cat || c.id === cat || t)
      .map((c) => ({ ...c, products: c.products.filter((p) => !t || p.name.toLowerCase().includes(t)) }))
      .filter((c) => c.products.length);
  }, [categories, cat, menuQ]);

  const addProduct = (p: MenuProduct) => {
    if (!p.available) return;
    if (!p.modifierGroups.length) {
      setCart((c) => {
        const ex = c.find((x) => x.product.id === p.id && !x.line.modifiers.length && !x.line.note);
        if (ex) return c.map((x) => (x === ex ? { ...x, line: { ...x.line, quantity: x.line.quantity + 1 } } : x));
        return [...c, { key: crypto.randomUUID(), product: p, unitCents: p.priceCents, summary: [], line: { productId: p.id, quantity: 1, modifiers: [] } }];
      });
      sounds.tap();
    } else setEditing({ product: p });
  };
  const changeQty = (key: string, d: number) => setCart((c) => c.flatMap((x) => (x.key !== key ? [x] : x.line.quantity + d <= 0 ? [] : [{ ...x, line: { ...x.line, quantity: Math.min(99, x.line.quantity + d) } }])));

  return (
    <div className="mx-auto max-w-7xl">
      <Link to="/admin/pedidos" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-mute hover:text-ink"><ArrowLeft className="h-4 w-4" />Pedidos</Link>
      <PageHeader title="Nuevo pedido" subtitle="Captura de pedido por teléfono o en mostrador" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {/* Cliente */}
          <section className="card space-y-3 p-4">
            <h2 className="h-display font-semibold">1. Cliente</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Seg value={channel} onChange={setChannel} items={[{ value: 'TELEFONO', label: 'Teléfono', icon: <Phone className="h-4 w-4" /> }, { value: 'MOSTRADOR', label: 'Mostrador', icon: <Store className="h-4 w-4" /> }]} />
              <Seg value={type} onChange={setType} items={[{ value: 'DOMICILIO', label: 'Domicilio', icon: <Bike className="h-4 w-4" /> }, { value: 'PASAR_A_RECOGER', label: 'Recoger', icon: <ShoppingBag className="h-4 w-4" /> }]} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="label">Teléfono (10 dígitos)</span>
                <div className="relative">
                  <input className="input pr-10 tabular-nums" inputMode="tel" autoFocus placeholder="55 1234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Teléfono" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute">{searching ? <Spinner className="h-4 w-4" /> : customer ? <UserCheck className="h-4 w-4 text-ok" /> : <Search className="h-4 w-4" />}</span>
                </div>
                <p className="mt-1 text-xs text-ink-mute">
                  {customer ? <span className="text-ok">Cliente frecuente · {customer.ordersCount} pedido{customer.ordersCount === 1 ? '' : 's'}</span> : customer === null ? 'Cliente nuevo: se registrará con este pedido' : 'Buscamos al cliente al escribir su número'}
                </p>
              </div>
              <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del cliente" maxLength={80} />
            </div>
            {customer?.notes && <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn"><b>Nota del cliente:</b> {customer.notes}</p>}

            {type === 'DOMICILIO' && (
              <div className="space-y-3 border-t border-line pt-3">
                <span className="label !mb-0">Dirección de entrega</span>
                {!!customer?.addresses?.length && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {customer.addresses.map((a) => (
                      <button key={a.id} type="button" onClick={() => setAddrId(a.id)}
                        className={clsx('flex gap-2 rounded-2xl border-2 p-3 text-left text-sm transition', addrId === a.id ? 'border-brand bg-brand/10' : 'border-line hover:border-brand/40')}>
                        <MapPin className={clsx('mt-0.5 h-4 w-4 shrink-0', addrId === a.id ? 'text-brand' : 'text-ink-mute')} />
                        <span className="min-w-0">
                          {a.label && <span className="block text-xs font-bold uppercase text-ink-mute">{a.label}</span>}
                          <span className="block font-medium">{a.text}</span>
                          {a.references && <span className="block text-xs text-ink-mute">{a.references}</span>}
                        </span>
                      </button>
                    ))}
                    <button type="button" onClick={() => setAddrId('new')} className={clsx('flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-3 text-sm font-semibold', addrId === 'new' ? 'border-brand text-brand' : 'border-line text-ink-mute')}>
                      <Plus className="h-4 w-4" />Otra dirección
                    </button>
                  </div>
                )}
                {addrId === 'new' && (
                  <div className="space-y-3">
                    <AddressSearch value={addrText} onChange={(v) => { setAddrText(v); }} onPick={(p) => { setPin({ lat: p.lat, lng: p.lng }); setShowMap(true); }} />
                    <Input label="Referencias" value={addrRefs} onChange={(e) => setAddrRefs(e.target.value)} placeholder="Entre calles, color de fachada, interior…" maxLength={300} />
                    {showMap || pin ? (
                      <PinPicker value={pin} onChange={setPin} height={220} />
                    ) : (
                      <button type="button" onClick={() => setShowMap(true)} className="text-sm font-semibold text-brand">+ Marcar en el mapa (opcional)</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Menú */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="h-display mr-auto font-semibold">2. Productos</h2>
              <div className="relative w-full sm:w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
                <input className="input h-10 pl-9" placeholder="Buscar producto" value={menuQ} onChange={(e) => setMenuQ(e.target.value)} aria-label="Buscar producto" />
              </div>
            </div>
            <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-thin">
              <button onClick={() => setCat('')} className={clsx('chip h-9 shrink-0 border px-3 text-sm', !cat ? 'border-brand bg-brand text-white' : 'border-line bg-surface-raised text-ink-soft')}>Todo</button>
              {categories.map((c) => (
                <button key={c.id} onClick={() => setCat(c.id)} className={clsx('chip h-9 shrink-0 border px-3 text-sm', cat === c.id ? 'border-brand bg-brand text-white' : 'border-line bg-surface-raised text-ink-soft')}>{c.name}</button>
              ))}
            </div>
            {menu.isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}</div>
            ) : !products.length ? (
              <EmptyState title="Sin productos" description={menuQ ? 'Prueba con otro nombre.' : 'Agrega productos en Menú.'} />
            ) : (
              <div className="space-y-4">
                {products.map((c) => (
                  <div key={c.id}>
                    {(!cat || menuQ) && <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-mute">{c.name}</p>}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                      {c.products.map((p) => {
                        const inCart = cart.filter((x) => x.product.id === p.id).reduce((s, x) => s + x.line.quantity, 0);
                        return (
                          <button key={p.id} disabled={!p.available} onClick={() => addProduct(p)}
                            className={clsx('relative flex min-h-[88px] flex-col rounded-2xl border p-2.5 text-left transition active:scale-[.98]', p.available ? 'border-line bg-surface-raised hover:border-brand/50' : 'border-line bg-surface-sunken opacity-60')}>
                            {p.imageUrl && <img src={assetUrl(p.imageUrl)} alt="" className="mb-1.5 h-16 w-full rounded-xl object-cover" />}
                            <span className="line-clamp-2 text-sm font-semibold leading-tight">{p.name}</span>
                            <span className="mt-auto flex items-center justify-between gap-1 pt-1 text-sm tabular-nums text-ink-mute">
                              {p.available ? money(p.priceCents) : 'Agotado'}
                              {p.modifierGroups.length > 0 && p.available && <span className="text-[10px] font-semibold uppercase tracking-wide text-brand" title="Tiene opciones">+ opc.</span>}
                            </span>
                            {inCart > 0 && <span className="absolute right-1.5 top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">{inCart}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Carrito / resumen */}
        <aside className="min-w-0 lg:self-start">
          <section className="card flex flex-col p-4">
            <h2 className="h-display mb-2 font-semibold">3. Resumen</h2>
            <div className="-mx-1 max-h-[40vh] overflow-y-auto px-1 scroll-thin">
              {!cart.length ? (
                <p className="py-8 text-center text-sm text-ink-mute">Toca un producto para agregarlo.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {cart.map((c, i) => {
                    const err = quote?.errors.find((e) => e.lineIndex === i);
                    return (
                      <li key={c.key} className="py-2.5">
                        <div className="flex items-start gap-2">
                          <button className="min-w-0 flex-1 text-left" onClick={() => c.product.modifierGroups.length && setEditing({ product: c.product, item: c })}>
                            <p className="text-sm font-semibold">{c.product.name}</p>
                            {c.summary.length > 0 && <p className="text-xs text-ink-mute">{c.summary.join(', ')}</p>}
                            {c.line.note && <p className="text-xs text-warn">“{c.line.note}”</p>}
                            {err && <p className="text-xs font-medium text-danger">{err.message}</p>}
                          </button>
                          <span className="text-sm font-semibold tabular-nums">{money(c.unitCents * c.line.quantity)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1">
                          <button className="grid h-8 w-8 place-items-center rounded-lg bg-surface-sunken" aria-label="Menos" onClick={() => changeQty(c.key, -1)}>{c.line.quantity === 1 ? <Trash2 className="h-3.5 w-3.5 text-danger" /> : <Minus className="h-3.5 w-3.5" />}</button>
                          <span className="w-8 text-center text-sm font-bold tabular-nums">{c.line.quantity}</span>
                          <button className="grid h-8 w-8 place-items-center rounded-lg bg-surface-sunken" aria-label="Más" onClick={() => changeQty(c.key, 1)}><Plus className="h-3.5 w-3.5" /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-3 space-y-3 border-t border-line pt-3">
              <div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
                    <input className="input h-10 pl-9 uppercase" placeholder="Cupón" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} aria-label="Cupón" onKeyDown={(e) => e.key === 'Enter' && setCouponApplied(coupon.trim())} />
                  </div>
                  {couponApplied && couponApplied === coupon.trim() ? (
                    <Button variant="ghost" size="md" onClick={() => { setCoupon(''); setCouponApplied(''); }}>Quitar</Button>
                  ) : (
                    <Button variant="outline" size="md" disabled={!coupon.trim()} onClick={() => setCouponApplied(coupon.trim())}>Aplicar</Button>
                  )}
                </div>
                {couponError && <p className="mt-1 text-xs font-medium text-danger">{couponError.message}</p>}
                {quote?.coupon && <p className="mt-1 text-xs font-medium text-ok">Cupón {quote.coupon.code} aplicado</p>}
              </div>

              <div>
                <span className="label">Pago</span>
                <Seg value={payment} onChange={setPayment} items={PAYMENTS} />
                {payment === 'EFECTIVO' && (
                  <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2">
                    <MoneyInput label="Paga con" valueCents={cashGiven} onChangeCents={setCashGiven} placeholder={(total / 100).toFixed(0)} />
                    <div className="pb-2.5 text-right text-sm">
                      <span className="block text-xs text-ink-mute">Cambio</span>
                      <span className={clsx('font-bold tabular-nums', cashGiven != null && cashGiven < total ? 'text-danger' : 'text-brand')}>{cashGiven != null ? money(Math.max(0, cashGiven - total)) : '—'}</span>
                    </div>
                  </div>
                )}
              </div>
              <Textarea label="Notas del pedido (opcional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Tocar el timbre, sin cubiertos…" />

              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-ink-mute">Subtotal</dt><dd className="tabular-nums">{money(quote?.subtotalCents ?? localSubtotal)}</dd></div>
                {(quote?.appliedPromotions ?? []).map((p) => (
                  <div key={p.id} className="flex justify-between text-ok"><dt>{p.name}</dt><dd className="tabular-nums">−{money(p.discountCents)}</dd></div>
                ))}
                {!!quote?.coupon?.discountCents && <div className="flex justify-between text-ok"><dt>Cupón {quote.coupon.code}</dt><dd className="tabular-nums">−{money(quote.coupon.discountCents)}</dd></div>}
                {type === 'DOMICILIO' && (
                  <div className="flex justify-between"><dt className="text-ink-mute">Envío{quote?.zone ? ` · ${quote.zone.name}` : ''}</dt><dd className="tabular-nums">{quote ? (quote.deliveryFeeCents ? money(quote.deliveryFeeCents) : quote.zone ? 'Gratis' : '—') : '—'}</dd></div>
                )}
                <div className="flex items-baseline justify-between pt-1 text-lg font-bold"><dt>Total</dt><dd className="tabular-nums">{quoting ? <Spinner className="inline h-4 w-4" /> : money(total)}</dd></div>
                {quote?.estimatedMinutes && <p className="text-right text-xs text-ink-mute">Tiempo estimado: {quote.estimatedMinutes} min</p>}
              </dl>

              {blocking.filter((e) => e.lineIndex == null).map((e) => (
                <p key={e.code} className="flex items-start gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{e.message}</p>
              ))}
              {quote?.warnings.map((w) => <p key={w} className="rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">{w}</p>)}

              <Button size="xl" block disabled={!canSubmit} loading={submitting} onClick={submit} icon={<CheckCircle2 className="h-5 w-5" />}>
                Crear pedido{cart.length ? ` · ${money(total)}` : ''}
              </Button>
              {missing.length > 0 && <p className="text-center text-xs text-ink-mute">Falta: {missing.join(', ')}</p>}
            </div>
          </section>
        </aside>
      </div>

      <ProductModal
        product={editing?.product ?? null}
        open={!!editing}
        initial={editing?.item?.line}
        addLabel={editing?.item ? 'Guardar' : 'Agregar'}
        onClose={() => setEditing(null)}
        onAdd={(line, unit, summary) => {
          const item = editing?.item;
          if (item) setCart((c) => c.map((x) => (x.key === item.key ? { ...x, line, unitCents: unit, summary } : x)));
          else setCart((c) => [...c, { key: crypto.randomUUID(), product: editing!.product, line, unitCents: unit, summary }]);
          sounds.tap();
        }}
      />
    </div>
  );
}
