import { ApiError } from '@/lib/api';
import { Skeleton } from '@/ui';

export function PublicSkeleton() {
  return (
    <div className="min-h-full bg-surface" aria-busy="true" aria-label="Cargando menú">
      <div className="h-44 animate-pulse bg-brand/40" />
      <div className="mx-auto -mt-11 max-w-5xl px-4 sm:px-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="mt-6 flex gap-2">
          {[80, 110, 70, 90].map((w, i) => (
            <div key={i} style={{ width: w }}><Skeleton className="h-8 rounded-full" /></div>
          ))}
        </div>
        <Skeleton className="mt-8 h-7 w-40" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[130px] w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PublicError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div className="grid min-h-full place-items-center bg-surface px-6 py-16 text-center">
      <div className="max-w-sm">
        <p className="text-6xl">{notFound ? '🔎' : '📡'}</p>
        <h1 className="h-display mt-4 text-2xl font-bold">{notFound ? 'No encontramos este restaurante' : 'No pudimos cargar el menú'}</h1>
        <p className="mt-2 text-ink-mute">
          {notFound ? (error as Error).message || 'Revisa el enlace que te compartieron.' : 'Revisa tu conexión a internet e inténtalo de nuevo.'}
        </p>
        {onRetry && !notFound && (
          <button onClick={onRetry} className="mt-6 h-12 rounded-2xl bg-brand px-6 font-semibold text-white">Reintentar</button>
        )}
      </div>
    </div>
  );
}
