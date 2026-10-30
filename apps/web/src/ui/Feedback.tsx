import type { ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, Inbox } from 'lucide-react';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className ?? 'h-5 w-5')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[40vh] w-full flex-col items-center justify-center gap-3 text-ink-mute">
      <Spinner className="h-8 w-8 text-brand" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3 py-14 text-center', className)}>
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-sunken text-ink-mute">{icon ?? <Inbox className="h-7 w-7" />}</div>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-ink-mute">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Ocurrió un error';
  return (
    <EmptyState
      icon={<AlertTriangle className="h-7 w-7 text-danger" />}
      title="No se pudo cargar"
      description={msg}
      action={onRetry && <button className="text-sm font-semibold text-brand" onClick={onRetry}>Reintentar</button>}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-surface-sunken', className)} />;
}
