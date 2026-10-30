import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShoppingBag, Timer } from 'lucide-react';
import { money } from '@/lib/format';
import { toast } from '@/ui';
import { sounds, vibrate } from '@/lib/sound';
import { cartCount, useCart } from './cart';
import { CartPanel } from './CartPanel';
import { Checkout } from './Checkout';
import { Hero } from './Hero';
import { MenuList } from './MenuList';
import { ProductSheet } from './ProductSheet';
import { useQuote, useQuoteBody, usePublicMenu } from './hooks';
import { lineTotal, mxPhone, useSlug } from './lib';
import { PublicError, PublicSkeleton } from './states';
import { Sheet } from './ui';
import type { PubCategory, PubProduct } from './types';

/** /pedir — menú web público con carrito y checkout (WEB-01/02). */
export function OrderPage() {
  const slug = useSlug();
  const [params, setParams] = useSearchParams();
  const cart = useCart();
  const { load, lines, type, setType, branchId, setBranch, setCustomer, customer } = cart;
  useEffect(() => load(slug), [slug, load]);

  const sessionToken = params.get('s');
  const telParam = params.get('tel');
  useEffect(() => {
    if (telParam && cart.slug === slug) {
      const p = mxPhone(telParam);
      if (p.length === 10 && p !== customer.phone) setCustomer({ phone: p });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telParam, cart.slug, slug]);

  const menuQ = usePublicMenu(slug, 'web', branchId);
  const menu = menuQ.data;
  const branch = menu?.branches.find((b) => b.id === (branchId ?? menu.branchId)) ?? menu?.branches[0];

  // Respetar acceptsDelivery / acceptsPickup
  useEffect(() => {
    if (!branch) return;
    if (type === 'DOMICILIO' && !branch.acceptsDelivery && branch.acceptsPickup) setType('PASAR_A_RECOGER');
    if (type === 'PASAR_A_RECOGER' && !branch.acceptsPickup && branch.acceptsDelivery) setType('DOMICILIO');
  }, [branch, type, setType]);

  const step = params.get('paso') === 'pagar' ? 'checkout' : 'menu';
  const goCheckout = () => {
    const p = new URLSearchParams(params);
    p.set('paso', 'pagar');
    setParams(p);
    setCartOpen(false);
    window.scrollTo({ top: 0 });
  };
  const backToMenu = () => {
    const p = new URLSearchParams(params);
    p.delete('paso');
    setParams(p);
  };

  const [open, setOpen] = useState<{ p: PubProduct; c: PubCategory } | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [bump, setBump] = useState(0);

  const catOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of menu?.categories ?? []) for (const p of c.products) m.set(p.id, c.name);
    return (id: string) => m.get(id) ?? '';
  }, [menu]);
  const countFor = useCallback((pid: string) => lines.filter((l) => l.productId === pid).reduce((s, l) => s + l.quantity, 0), [lines]);

  // Si el carrito trae productos que ya no existen en el menú, se quitan
  useEffect(() => {
    if (!menu || !lines.length) return;
    const ids = new Set(menu.categories.flatMap((c) => c.products.map((p) => p.id)));
    const gone = lines.filter((l) => !ids.has(l.productId));
    if (gone.length) {
      gone.forEach((l) => cart.remove(l.key));
      toast.info('Actualizamos tu pedido', `${gone.map((g) => g.name).join(', ')} ya no está disponible`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

  const body = useQuoteBody({ address: null, branchId: branch?.id });
  const quoteQ = useQuote(slug, { ...body, address: undefined }, step === 'menu' && (cartOpen || window.innerWidth >= 1024));

  if (menuQ.isLoading) return <PublicSkeleton />;
  if (menuQ.error || !menu) return <PublicError error={menuQ.error} onRetry={() => menuQ.refetch()} />;

  const count = cartCount(lines);
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const closed = branch ? !branch.isOpen : true;
  const closedReason = closed ? `Cerrado · abrimos ${branch?.nextOpeningText ?? 'pronto'}` : null;

  if (step === 'checkout' && lines.length > 0) {
    return (
      <div className="min-h-full bg-surface">
        <Checkout slug={slug} menu={menu} branch={branch} sessionToken={sessionToken} onBack={backToMenu} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-surface">
      <Hero
        business={menu.business}
        branch={branch}
        branches={menu.branches}
        onBranch={(id) => setBranch(id)}
        type={type}
        onType={setType}
      />

      {closed && (
        <div className="mx-auto mt-4 max-w-5xl px-4 sm:px-6">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-raised px-4 py-3 text-sm">
            <Timer className="h-5 w-5 shrink-0 text-warn" />
            <p>
              <b>Estamos cerrados.</b> <span className="text-ink-soft">{branch?.nextOpeningText ? `Abrimos ${branch.nextOpeningText}.` : ''} Puedes ver el menú y armar tu pedido.</span>
            </p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-8">
        <main className="pb-32 lg:pb-16">
          {menu.categories.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-5xl">🍽️</p>
              <p className="mt-3 font-semibold">El menú se está preparando</p>
              <p className="text-sm text-ink-mute">Vuelve en un momento.</p>
            </div>
          ) : (
            <MenuList categories={menu.categories} onOpen={(p, c) => setOpen({ p, c })} countFor={countFor} />
          )}
          <footer className="mt-12 border-t border-line pt-6 text-center text-xs text-ink-mute">
            <p>{menu.business.name}{menu.business.address ? ` · ${menu.business.address}` : ''}</p>
            {menu.business.privacyNoticeUrl && (
              <a className="mt-1 inline-block underline" href={menu.business.privacyNoticeUrl} target="_blank" rel="noreferrer">Aviso de privacidad</a>
            )}
            <p className="mt-2 opacity-70">Precios en {menu.business.currency} con IVA incluido.</p>
          </footer>
        </main>

        {/* Carrito lateral en escritorio */}
        <aside className="hidden lg:block">
          <div className="sticky top-4 mt-6 rounded-3xl border border-line bg-surface-raised p-5 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="h-display text-xl font-bold">Tu pedido</h2>
              {count > 0 && <span className="chip bg-brand/15 text-brand">{count} {count === 1 ? 'producto' : 'productos'}</span>}
            </div>
            <div className="max-h-[calc(100vh-140px)] overflow-y-auto scroll-thin pr-1">
              <CartPanel quote={quoteQ.data} quoteLoading={quoteQ.isFetching} onCheckout={goCheckout} checkoutDisabledReason={closedReason} categoryOf={catOf} />
            </div>
          </div>
        </aside>
      </div>

      {/* Botón flotante del carrito (celular / tablet) */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(14px,env(safe-area-inset-bottom))] lg:hidden">
          <button
            key={bump}
            onClick={() => setCartOpen(true)}
            className="mx-auto flex h-14 w-full max-w-lg animate-pop items-center gap-3 rounded-2xl bg-brand pl-3 pr-5 text-white shadow-lift active:scale-[0.98]"
          >
            <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-white/20">
              <ShoppingBag className="h-5 w-5" />
              <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[11px] font-bold text-brand">{count}</span>
            </span>
            <span className="flex-1 text-left text-base font-semibold">Ver mi pedido</span>
            <span className="text-base font-bold tabular-nums">{money(subtotal)}</span>
          </button>
        </div>
      )}

      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title="Tu pedido" labelledBy="cart-title">
        <div className="px-5 pb-5">
          <CartPanel quote={quoteQ.data} quoteLoading={quoteQ.isFetching} onCheckout={goCheckout} checkoutDisabledReason={closedReason} categoryOf={catOf} />
        </div>
      </Sheet>

      {open && (
        <ProductSheet
          product={open.p}
          categoryName={open.c.name}
          onClose={() => setOpen(null)}
          onAdd={(l) => {
            cart.add(l);
            setOpen(null);
            setBump((b) => b + 1);
            sounds.success();
            vibrate(12);
          }}
        />
      )}
    </div>
  );
}

