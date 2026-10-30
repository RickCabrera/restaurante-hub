import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertCircle, ArrowLeft, Banknote, Bike, Check, ChevronRight, CreditCard, Crosshair, Landmark, Loader2, MapPin, ShoppingBag, Timer } from 'lucide-react';
import type { PaymentMethod } from '@rh/shared';
import { api, ApiError } from '@/lib/api';
import { money } from '@/lib/format';
import { toast } from '@/ui';
import { sounds } from '@/lib/sound';
import { useCart } from './cart';
import { QuoteAlerts, QuoteSummary, CouponField } from './CartPanel';
import { MapPin as MapPinView } from './MapPin';
import { useQuote, useQuoteBody } from './hooks';
import { mxPhone, useDebounced, paymentLabels, lineTotal } from './lib';
import type { Coverage, GeoResult, GeoSuggestion, PubBranch, PublicMenu, Quote, SavedAddress, TrackingView } from './types';

const PAY_ICON: Record<PaymentMethod, ReactNode> = {
  EFECTIVO: <Banknote className="h-5 w-5" />,
  TARJETA: <CreditCard className="h-5 w-5" />,
  TRANSFERENCIA: <Landmark className="h-5 w-5" />,
};

function cashOptions(total: number): number[] {
  const out = new Set<number>([total]);
  for (const step of [5000, 10000, 20000, 50000, 100000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total) out.add(v);
    if (out.size >= 4) break;
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

export function Checkout({
  slug,
  menu,
  branch,
  sessionToken,
  onBack,
}: {
  slug: string;
  menu: PublicMenu;
  branch?: PubBranch;
  sessionToken?: string | null;
  onBack: () => void;
}) {
  const nav = useNavigate();
  const { lines, type, setType, customer, setCustomer, clear } = useCart();
  const isDelivery = type === 'DOMICILIO';
  const b = menu.business;

  const [name, setName] = useState(customer.name ?? '');
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [addr, setAddr] = useState<SavedAddress>(customer.address ?? { text: '' });
  const [pay, setPay] = useState<PaymentMethod>(customer.paymentMethod && b.paymentMethods.includes(customer.paymentMethod) ? customer.paymentMethod : b.paymentMethods[0] ?? 'EFECTIVO');
  const [cash, setCash] = useState<number | null>(null);
  const [cashCustom, setCashCustom] = useState('');
  const [notes, setNotes] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverQuote, setServerQuote] = useState<Quote | null>(null);

  // Guarda nombre/teléfono mientras escribe (para la siguiente visita)
  useEffect(() => {
    const t = setTimeout(() => setCustomer({ name: name.trim(), phone: mxPhone(phone) }), 400);
    return () => clearTimeout(t);
  }, [name, phone, setCustomer]);

  const hasCoords = addr.lat != null && addr.lng != null;
  const coverage = useQuery({
    queryKey: ['public-coverage', slug, addr.lat, addr.lng],
    queryFn: () => api.get<Coverage>(`/public/${slug}/coverage`, { lat: addr.lat, lng: addr.lng }, { anonymous: true }),
    enabled: isDelivery && hasCoords,
    staleTime: 60_000,
  });
  const cov = coverage.data;

  const body = useQuoteBody({ address: isDelivery ? addr : null, branchId: cov && cov.covered ? cov.branchId : branch?.id });
  const quoteQ = useQuote(slug, body);
  const quote = serverQuote ?? quoteQ.data;
  useEffect(() => setServerQuote(null), [quoteQ.data]);

  const total = quote?.totalCents ?? lines.reduce((s, l) => s + lineTotal(l), 0);
  const cashChoices = useMemo(() => cashOptions(total), [total]);
  const cashGiven = cash ?? (cashCustom ? Math.round(Number(cashCustom) * 100) : null);

  const phoneDigits = phone.replace(/\D/g, '');
  const phoneOk = phoneDigits.length === 10 || (phoneDigits.length > 10 && phoneDigits.length <= 13 && phoneDigits.startsWith('52'));
  const nameOk = name.trim().length >= 2;
  const addrOk = !isDelivery || (addr.text.trim().length >= 5 && (!cov || cov.covered));
  const cashOk = pay !== 'EFECTIVO' || cashGiven == null || cashGiven >= total;
  const privacyOk = !b.privacyNoticeUrl || privacy;
  const closed = branch ? !branch.isOpen : false;
  const blocking = quote?.errors.filter((e) => !(e.code === 'ADDRESS_REQUIRED' && !tried)) ?? [];
  const canSubmit = !closed && nameOk && phoneOk && addrOk && cashOk && privacyOk && !sending && lines.length > 0 && (!quote || quote.canOrder || blocking.length === 0);

  const submit = async () => {
    setTried(true);
    if (!canSubmit) {
      const first = document.querySelector('[data-invalid="true"]');
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSending(true);
    try {
      const res = await api.post<TrackingView>(
        `/public/${slug}/orders`,
        {
          ...body,
          customerPhone: mxPhone(phone),
          customer: { phone: mxPhone(phone), name: name.trim() },
          paymentMethod: pay,
          cashGivenCents: pay === 'EFECTIVO' && cashGiven ? cashGiven : undefined,
          notes: notes.trim() || undefined,
          acceptPrivacy: b.privacyNoticeUrl ? privacy : undefined,
          sessionToken: sessionToken || undefined,
        },
        { anonymous: true },
      );
      setCustomer({ name: name.trim(), phone: mxPhone(phone), address: isDelivery ? addr : customer.address, paymentMethod: pay });
      clear();
      sounds.success();
      nav(`/pedido/${res.publicToken}${slug !== 'demo' ? `?n=${encodeURIComponent(slug)}` : ''}`, { replace: false, state: { justPlaced: true } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.data?.quote) {
        setServerQuote(e.data.quote as Quote);
        toast.error(e.data.message ?? 'No pudimos tomar tu pedido');
        document.getElementById('checkout-summary')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else toast.fromError(e, 'No pudimos enviar tu pedido');
      sounds.error();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-40 pt-3 sm:px-6 lg:pb-16">
      <div className="sticky top-0 z-20 -mx-4 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-2 backdrop-blur-md sm:-mx-6 sm:px-4">
        <button onClick={onBack} className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-sunken" aria-label="Regresar al menú">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="h-display truncate text-lg font-bold leading-tight">Finalizar pedido</h1>
          <p className="truncate text-xs text-ink-mute">{b.name}{branch && menu.branches.length > 1 ? ` · ${branch.name}` : ''}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="space-y-4">
          {closed && (
            <div className="flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm">
              <Timer className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
              <div>
                <p className="font-semibold text-ink">Por ahora estamos cerrados</p>
                <p className="text-ink-soft">{branch?.nextOpeningText ? `Abrimos ${branch.nextOpeningText}. ` : ''}Puedes armar tu pedido y enviarlo cuando abramos.</p>
              </div>
            </div>
          )}

          <Step n={1} title="Tus datos" done={nameOk && phoneOk}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block" data-invalid={tried && !phoneOk}>
                <span className="label">Celular (WhatsApp)</span>
                <div className={clsx('flex items-center rounded-xl border bg-surface-raised focus-within:ring-2 focus-within:ring-brand/40', tried && !phoneOk ? 'border-danger' : 'border-line')}>
                  <span className="pl-3.5 pr-1 text-ink-mute">+52</span>
                  <input
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, '').slice(0, 14))}
                    placeholder="55 1234 5678"
                    className="h-11 w-full flex-1 rounded-xl bg-transparent px-2 text-ink placeholder:text-ink-mute focus:outline-none"
                  />
                </div>
                <span className={clsx('mt-1 block text-xs', tried && !phoneOk ? 'text-danger' : 'text-ink-mute')}>
                  {tried && !phoneOk ? 'Escribe 10 dígitos' : 'Te avisaremos del estado de tu pedido'}
                </span>
              </label>
              <label className="block" data-invalid={tried && !nameOk}>
                <span className="label">Nombre</span>
                <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} autoComplete="name" placeholder="¿A nombre de quién?" className={clsx('input', tried && !nameOk && 'border-danger')} />
                {tried && !nameOk && <span className="mt-1 block text-xs text-danger">Escribe tu nombre</span>}
              </label>
            </div>
          </Step>

          <Step n={2} title={isDelivery ? '¿A dónde lo llevamos?' : 'Recoges en'} done={isDelivery ? addrOk && hasCoords : true}>
            <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-xl bg-surface-sunken p-1">
              {(['DOMICILIO', 'PASAR_A_RECOGER'] as const).map((t) => {
                const allowed = t === 'DOMICILIO' ? menu.branches.some((x) => x.acceptsDelivery) : menu.branches.some((x) => x.acceptsPickup);
                return (
                  <button
                    key={t}
                    disabled={!allowed}
                    onClick={() => setType(t)}
                    className={clsx('flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition disabled:opacity-40', type === t ? 'bg-surface-raised shadow-card' : 'text-ink-mute')}
                  >
                    {t === 'DOMICILIO' ? <Bike className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                    {t === 'DOMICILIO' ? 'Domicilio' : 'Pasar a recoger'}
                  </button>
                );
              })}
            </div>
            {isDelivery ? (
              <AddressBlock slug={slug} value={addr} onChange={setAddr} coverage={cov} coverageLoading={coverage.isFetching} tried={tried} onPickup={() => setType('PASAR_A_RECOGER')} />
            ) : (
              <div className="flex items-start gap-3 rounded-2xl bg-surface-sunken/70 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white"><ShoppingBag className="h-5 w-5" /></span>
                <div className="text-sm">
                  <p className="font-semibold">{branch?.name ?? b.name}</p>
                  <p className="text-ink-soft">{branch?.address ?? b.address}</p>
                  <p className="mt-1 text-ink-mute">Listo en aproximadamente {quote?.estimatedMinutes ?? branch?.prepMinutes ?? 25} min</p>
                </div>
              </div>
            )}
          </Step>

          <Step n={3} title="¿Cómo pagas?" done={cashOk}>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Método de pago">
              {b.paymentMethods.map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={pay === m}
                  onClick={() => setPay(m)}
                  className={clsx(
                    'flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left transition',
                    pay === m ? 'border-brand bg-brand/10' : 'border-line bg-surface-raised hover:border-ink-mute/40',
                  )}
                >
                  <span className={clsx('grid h-9 w-9 place-items-center rounded-full', pay === m ? 'bg-brand text-white' : 'bg-surface-sunken text-ink-soft')}>{PAY_ICON[m]}</span>
                  <span className="text-sm font-semibold leading-tight">{paymentLabels[m]}</span>
                </button>
              ))}
            </div>
            {pay === 'EFECTIVO' && (
              <div className="mt-4" data-invalid={tried && !cashOk}>
                <p className="label">¿Con cuánto pagas? <span className="font-normal text-ink-mute">(para llevar tu cambio)</span></p>
                <div className="flex flex-wrap gap-2">
                  {cashChoices.map((v, i) => (
                    <button
                      key={v}
                      onClick={() => {
                        setCash(cash === v ? null : v);
                        setCashCustom('');
                      }}
                      className={clsx('h-10 rounded-full border px-4 text-sm font-semibold tabular-nums transition', cash === v ? 'border-brand bg-brand text-white' : 'border-line bg-surface-raised')}
                    >
                      {i === 0 ? `Exacto ${money(v)}` : money(v)}
                    </button>
                  ))}
                  <label className={clsx('flex h-10 items-center rounded-full border px-3 text-sm', cashCustom ? 'border-brand' : 'border-line', 'bg-surface-raised')}>
                    <span className="text-ink-mute">$</span>
                    <input
                      inputMode="decimal"
                      value={cashCustom}
                      onChange={(e) => {
                        setCashCustom(e.target.value.replace(/[^\d.]/g, '').slice(0, 7));
                        setCash(null);
                      }}
                      placeholder="Otro"
                      aria-label="Otra cantidad"
                      className="w-16 bg-transparent px-1 tabular-nums focus:outline-none"
                    />
                  </label>
                </div>
                {cashGiven != null && cashGiven > total && <p className="mt-2 text-sm text-ok">Tu cambio: <b className="tabular-nums">{money(cashGiven - total)}</b></p>}
                {cashGiven != null && cashGiven < total && <p className="mt-2 text-sm text-danger">La cantidad es menor al total ({money(total)})</p>}
              </div>
            )}
            {pay === 'TARJETA' && <p className="mt-3 text-sm text-ink-mute">{isDelivery ? 'El repartidor lleva terminal. Aceptamos débito y crédito.' : 'Paga con tarjeta al recoger.'}</p>}
            {pay === 'TRANSFERENCIA' && (
              <div className="mt-3 rounded-2xl border border-dashed border-line bg-surface-sunken/60 p-4 text-sm">
                <p className="font-semibold">Datos para transferir</p>
                <p className="mt-1 whitespace-pre-line text-ink-soft">{b.transferInfo ?? 'Te enviaremos los datos por WhatsApp.'}</p>
                <p className="mt-2 text-xs text-ink-mute">Envía tu comprobante por WhatsApp con tu folio.</p>
              </div>
            )}
          </Step>

          <Step n={4} title="Notas para el pedido" optional>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} rows={2} placeholder="Ej. tocar el timbre, sin cubiertos" className="input h-auto py-2.5" />
          </Step>
        </div>

        <aside id="checkout-summary" className="lg:sticky lg:top-20">
          <div className="card p-4">
            <h2 className="h-display text-lg font-bold">Tu pedido</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {lines.map((l) => (
                <li key={l.key} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-semibold tabular-nums">{l.quantity}×</span> {l.name}
                    {l.modifiers.length > 0 && <span className="block truncate text-xs text-ink-mute">{l.modifiers.map((m) => m.name).join(' · ')}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">{money(lineTotal(l))}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-line pt-3"><CouponField quote={quote} /></div>
            <div className="mt-3"><QuoteSummary quote={quote} loading={quoteQ.isFetching} isDelivery={isDelivery} /></div>
            {quote?.estimatedMinutes != null && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-mute"><Timer className="h-3.5 w-3.5" /> Tiempo estimado: {quote.estimatedMinutes} min</p>
            )}
            <div className="mt-3"><QuoteAlerts quote={quote} ignore={tried ? ['COUPON_INVALID'] : ['ADDRESS_REQUIRED', 'COUPON_INVALID']} /></div>
            {b.privacyNoticeUrl && (
              <label className={clsx('mt-3 flex items-start gap-2 text-sm', tried && !privacy && 'text-danger')} data-invalid={tried && !privacy}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
                <span>
                  Acepto el{' '}
                  <a href={b.privacyNoticeUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">aviso de privacidad</a>
                </span>
              </label>
            )}
            <div className="hidden lg:block">
              <SubmitButton onClick={submit} sending={sending} disabled={!canSubmit && (tried || blocking.length > 0)} closed={closed} total={total} reason={closed ? `Abrimos ${branch?.nextOpeningText ?? 'pronto'}` : null} />
            </div>
          </div>
        </aside>
      </div>

      {/* CTA fija en celular */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised/95 px-4 pt-3 backdrop-blur pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
        <SubmitButton onClick={submit} sending={sending} disabled={!canSubmit && (tried || blocking.length > 0)} closed={closed} total={total} reason={closed ? `Abrimos ${branch?.nextOpeningText ?? 'pronto'}` : null} />
      </div>
    </div>
  );
}

function SubmitButton({ onClick, sending, disabled, closed, total, reason }: { onClick: () => void; sending: boolean; disabled: boolean; closed: boolean; total: number; reason: string | null }) {
  return (
    <button
      onClick={onClick}
      disabled={sending || closed}
      className={clsx(
        'mt-4 flex h-14 w-full items-center justify-between gap-2 rounded-2xl px-5 text-base font-semibold text-white shadow-lift transition active:scale-[0.98] lg:mt-4',
        closed ? 'bg-ink-mute' : 'bg-brand',
        disabled && 'opacity-70',
        'max-lg:mt-0',
      )}
    >
      <span className="flex items-center gap-2">{sending && <Loader2 className="h-5 w-5 animate-spin" />}{closed ? reason : sending ? 'Enviando…' : 'Hacer pedido'}</span>
      {!closed && <span className="tabular-nums">{money(total)}</span>}
    </button>
  );
}

function Step({ n, title, done, optional, children }: { n: number; title: string; done?: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={clsx('grid h-7 w-7 place-items-center rounded-full text-sm font-bold', done ? 'bg-ok text-white' : 'bg-surface-sunken text-ink-soft')}>
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
        </span>
        <h2 className="h-display text-lg font-bold">{title}</h2>
        {optional && <span className="text-xs text-ink-mute">Opcional</span>}
      </div>
      {children}
    </section>
  );
}

function AddressBlock({
  slug,
  value,
  onChange,
  coverage,
  coverageLoading,
  tried,
  onPickup,
}: {
  slug: string;
  value: SavedAddress;
  onChange: (a: SavedAddress) => void;
  coverage?: Coverage;
  coverageLoading: boolean;
  tried: boolean;
  onPickup: () => void;
}) {
  const [text, setText] = useState(value.text);
  const [focused, setFocused] = useState(false);
  const [locating, setLocating] = useState(false);
  const [picked, setPicked] = useState(!!(value.lat && value.lng));
  const debounced = useDebounced(text.trim(), 350);
  const boxRef = useRef<HTMLDivElement>(null);

  const sugg = useQuery({
    queryKey: ['public-autocomplete', slug, debounced],
    queryFn: () => api.get<{ suggestions: GeoSuggestion[] }>(`/public/${slug}/geo/autocomplete`, { q: debounced }, { anonymous: true }),
    enabled: focused && !picked && debounced.length >= 4,
    staleTime: 60_000,
    retry: false,
  });

  const choose = async (s: GeoSuggestion) => {
    setText(s.description);
    setPicked(true);
    setFocused(false);
    let lat = s.lat;
    let lng = s.lng;
    if (lat == null || lng == null) {
      const g = await api.get<{ result: GeoResult | null }>(`/public/${slug}/geo/geocode`, { q: s.description }, { anonymous: true }).catch(() => null);
      lat = g?.result?.lat;
      lng = g?.result?.lng;
    }
    onChange({ ...value, text: s.description, lat, lng });
  };

  const geocodeTyped = async () => {
    if (picked || text.trim().length < 5) return;
    const g = await api.get<{ result: GeoResult | null }>(`/public/${slug}/geo/geocode`, { q: text.trim() }, { anonymous: true }).catch(() => null);
    if (g?.result) {
      setPicked(true);
      onChange({ ...value, text: text.trim(), lat: g.result.lat, lng: g.result.lng });
    } else onChange({ ...value, text: text.trim(), lat: undefined, lng: undefined });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error('Tu navegador no permite obtener la ubicación');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const r = await api.get<{ result: GeoResult | null }>(`/public/${slug}/geo/reverse`, { lat, lng }, { anonymous: true }).catch(() => null);
        const t = r?.result?.formatted ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setText(t);
        setPicked(true);
        onChange({ ...value, text: t, lat, lng });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === err.PERMISSION_DENIED ? 'Permite el acceso a tu ubicación para usarla' : 'No pudimos obtener tu ubicación');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  const moved = async (lat: number, lng: number) => {
    onChange({ ...value, lat, lng });
  };

  const items = sugg.data?.suggestions ?? [];
  const showList = focused && !picked && debounced.length >= 4;
  const bad = tried && (value.text.trim().length < 5 || (coverage && !coverage.covered));

  return (
    <div className="space-y-3">
      <div ref={boxRef} className="relative" data-invalid={bad}>
        <label className="label" htmlFor="addr-input">Calle, número y colonia</label>
        <div className={clsx('flex items-center gap-2 rounded-xl border bg-surface-raised pl-3 focus-within:ring-2 focus-within:ring-brand/40', bad ? 'border-danger' : 'border-line')}>
          <MapPin className="h-4 w-4 shrink-0 text-ink-mute" />
          <input
            id="addr-input"
            value={text}
            autoComplete="street-address"
            onChange={(e) => {
              setText(e.target.value);
              setPicked(false);
              setFocused(true);
              onChange({ ...value, text: e.target.value, lat: undefined, lng: undefined });
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => {
              setFocused(false);
              void geocodeTyped();
            }, 180)}
            placeholder="Ej. Madero 15, Centro"
            className="h-11 w-full flex-1 bg-transparent pr-3 text-ink placeholder:text-ink-mute focus:outline-none"
            aria-autocomplete="list"
            aria-expanded={showList}
          />
          {sugg.isFetching && <Loader2 className="mr-3 h-4 w-4 animate-spin text-ink-mute" />}
        </div>
        {showList && (items.length > 0 || !sugg.isFetching) && (
          <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-lift" role="listbox">
            {items.map((s) => (
              <li key={s.placeId}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void choose(s)} className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm hover:bg-surface-sunken">
                  <MapPin className="h-4 w-4 shrink-0 text-brand" />
                  <span className="flex-1">{s.description}</span>
                  <ChevronRight className="h-4 w-4 text-ink-mute" />
                </button>
              </li>
            ))}
            {!items.length && <li className="px-3 py-3 text-sm text-ink-mute">No encontramos esa dirección. Revisa calle y colonia o usa tu ubicación.</li>}
          </ul>
        )}
      </div>

      <button type="button" onClick={useMyLocation} disabled={locating} className="flex items-center gap-2 text-sm font-semibold text-brand disabled:opacity-60">
        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Usar mi ubicación actual
      </button>

      {value.lat != null && value.lng != null && <MapPinView lat={value.lat} lng={value.lng} onMove={moved} height={190} />}

      {value.lat != null && value.lng != null && (
        <div aria-live="polite">
          {coverageLoading && !coverage ? (
            <p className="flex items-center gap-2 text-sm text-ink-mute"><Loader2 className="h-4 w-4 animate-spin" /> Revisando cobertura…</p>
          ) : coverage?.covered ? (
            <div className="flex items-center gap-3 rounded-2xl bg-ok/10 px-4 py-3 text-sm">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-ok text-white"><Check className="h-4 w-4" strokeWidth={3} /></span>
              <div className="flex-1">
                <p className="font-semibold text-ink">¡Sí llegamos! · {coverage.zone.name}</p>
                <p className="text-ink-soft">
                  Envío {coverage.feeCents === 0 ? 'gratis' : money(coverage.feeCents)} · ~{coverage.etaMinutes} min
                  {coverage.minOrderCents > 0 && ` · mínimo ${money(coverage.minOrderCents)}`}
                  {coverage.freeFromCents ? ` · envío gratis desde ${money(coverage.freeFromCents)}` : ''}
                </p>
              </div>
            </div>
          ) : coverage && !coverage.covered ? (
            <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-danger"><AlertCircle className="h-4 w-4" /> Fuera de zona — ¿pasas a recoger?</p>
              <p className="mt-0.5 text-ink-soft">{coverage.message}</p>
              <button onClick={onPickup} className="mt-2 inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-surface">
                <ShoppingBag className="h-4 w-4" /> Cambiar a pasar a recoger
              </button>
            </div>
          ) : null}
        </div>
      )}
      {tried && value.text.trim().length < 5 && <p className="text-xs text-danger">Escribe tu dirección de entrega</p>}

      <label className="block">
        <span className="label">Referencias <span className="font-normal text-ink-mute">(opcional)</span></span>
        <input
          value={value.references ?? ''}
          onChange={(e) => onChange({ ...value, references: e.target.value.slice(0, 300) })}
          placeholder="Ej. casa azul, entre Bolívar e Isabel la Católica, depto 4"
          className="input"
        />
      </label>
    </div>
  );
}
