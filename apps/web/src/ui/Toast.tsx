import { create } from 'zustand';
import clsx from 'clsx';
import { CheckCircle2, Info, XCircle, AlertTriangle } from 'lucide-react';

type Kind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem { id: number; kind: Kind; title: string; description?: string }

const useToasts = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, 'id'>) => void; remove: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items.slice(-3), { ...t, id }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), t.kind === 'error' ? 6000 : 3500);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) => useToasts.getState().push({ kind: 'success', title, description }),
  error: (title: string, description?: string) => useToasts.getState().push({ kind: 'error', title, description }),
  info: (title: string, description?: string) => useToasts.getState().push({ kind: 'info', title, description }),
  warning: (title: string, description?: string) => useToasts.getState().push({ kind: 'warning', title, description }),
  /** muestra el mensaje de un error de API */
  fromError: (e: unknown, fallback = 'Ocurrió un error') => useToasts.getState().push({ kind: 'error', title: e instanceof Error ? e.message : fallback }),
};

const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const colors = { success: 'text-ok', error: 'text-danger', info: 'text-info', warning: 'text-warn' };

export function Toaster() {
  const { items, remove } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-5">
      {items.map((t) => {
        const Icon = icons[t.kind];
        return (
          <button
            key={t.id}
            onClick={() => remove(t.id)}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-surface-raised px-4 py-3 text-left shadow-lift animate-slide-up"
          >
            <Icon className={clsx('mt-0.5 h-5 w-5 shrink-0', colors[t.kind])} />
            <span>
              <span className="block text-sm font-semibold">{t.title}</span>
              {t.description && <span className="block text-xs text-ink-mute">{t.description}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
