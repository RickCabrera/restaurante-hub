import type { ReactNode } from 'react';
import { ChefHat } from 'lucide-react';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-brand/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-white shadow-lift">
            <ChefHat className="h-6 w-6" />
          </div>
          <div>
            <p className="h-display text-xl font-bold">Restaurante Hub</p>
            <p className="text-xs text-ink-mute">Requisiciones · Delivery · Punto de venta</p>
          </div>
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="h-display text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mb-6 mt-1 text-sm text-ink-mute">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
