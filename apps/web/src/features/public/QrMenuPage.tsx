import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike } from 'lucide-react';
import { Hero } from './Hero';
import { MenuList } from './MenuList';
import { ProductSheet } from './ProductSheet';
import { usePublicMenu } from './hooks';
import { useSlug } from './lib';
import { PublicError, PublicSkeleton } from './states';
import type { PubCategory, PubProduct } from './types';

/** /menu-qr — menú de solo consulta para mesas (WEB-04). */
export function QrMenuPage() {
  const slug = useSlug();
  const [branchId, setBranchId] = useState<string | null>(null);
  const q = usePublicMenu(slug, 'qr', branchId);
  const [open, setOpen] = useState<{ p: PubProduct; c: PubCategory } | null>(null);
  if (q.isLoading) return <PublicSkeleton />;
  if (q.error || !q.data) return <PublicError error={q.error} onRetry={() => q.refetch()} />;
  const menu = q.data;
  const branch = menu.branches.find((b) => b.id === (branchId ?? menu.branchId)) ?? menu.branches[0];
  const canDeliver = menu.branches.some((b) => b.acceptsDelivery || b.acceptsPickup);
  const pedir = `/pedir${slug !== 'demo' ? `?n=${encodeURIComponent(slug)}` : ''}`;

  return (
    <div className="min-h-full bg-surface">
      <Hero business={menu.business} branch={branch} branches={menu.branches} subtitle="Menú" compact />
      {menu.branches.length > 1 && (
        <div className="mx-auto max-w-5xl px-4 pt-3 sm:px-6">
          <select value={branch?.id ?? ''} onChange={(e) => setBranchId(e.target.value)} className="input h-10 w-auto" aria-label="Sucursal">
            {menu.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      <div className="mx-auto max-w-3xl px-4 pb-32 sm:px-6">
        {menu.categories.length ? (
          <MenuList categories={menu.categories} onOpen={(p, c) => setOpen({ p, c })} readOnly />
        ) : (
          <p className="py-20 text-center text-ink-mute">El menú se está actualizando.</p>
        )}
        <p className="mt-10 text-center text-xs text-ink-mute">Precios en {menu.business.currency} con IVA incluido. Pregunta a tu mesero por alergias.</p>
      </div>
      {canDeliver && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(14px,env(safe-area-inset-bottom))]">
          <Link to={pedir} className="mx-auto flex h-14 max-w-md items-center justify-center gap-2 rounded-2xl bg-ink font-semibold text-surface shadow-lift">
            <Bike className="h-5 w-5" /> Pedir a domicilio
          </Link>
        </div>
      )}
      {open && <ProductSheet product={open.p} categoryName={open.c.name} onClose={() => setOpen(null)} readOnly />}
    </div>
  );
}
