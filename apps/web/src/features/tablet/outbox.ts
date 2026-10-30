import Dexie, { type Table } from 'dexie';
import { create } from 'zustand';
import { api, ApiError } from '@/lib/api';
import type { Requisition } from '@/features/common-req/types';

/** Requisición pendiente de enviar (TAB-05). El API es idempotente por clientRequestId. */
export interface OutboxEntry {
  clientRequestId: string;
  body: {
    clientRequestId: string;
    priority: 'NORMAL' | 'URGENTE';
    note?: string;
    userId?: string;
    items: { supplyId: string; quantity: number; note?: string }[];
  };
  createdAt: number;
  attempts: number;
  lastError?: string;
}

class OutboxDb extends Dexie {
  outbox!: Table<OutboxEntry, string>;
  constructor() {
    super('rh-tablet');
    this.version(1).stores({ outbox: 'clientRequestId, createdAt' });
  }
}

let db: OutboxDb | null = null;
function getDb(): OutboxDb | null {
  try {
    db ??= new OutboxDb();
    return db;
  } catch {
    return null;
  }
}

// Respaldo en localStorage si IndexedDB no está disponible.
const LS_KEY = 'rh.tablet.outbox';
const ls = {
  all(): OutboxEntry[] {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
    } catch {
      return [];
    }
  },
  save(v: OutboxEntry[]) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};

async function all(): Promise<OutboxEntry[]> {
  const d = getDb();
  if (d) {
    try {
      return await d.outbox.orderBy('createdAt').toArray();
    } catch {
      /* cae al respaldo */
    }
  }
  return ls.all();
}
async function put(e: OutboxEntry) {
  const d = getDb();
  if (d) {
    try {
      await d.outbox.put(e);
      return;
    } catch {
      /* respaldo */
    }
  }
  ls.save([...ls.all().filter((x) => x.clientRequestId !== e.clientRequestId), e]);
}
async function del(id: string) {
  const d = getDb();
  if (d) {
    try {
      await d.outbox.delete(id);
    } catch {
      /* respaldo */
    }
  }
  ls.save(ls.all().filter((x) => x.clientRequestId !== id));
}

export const useOutbox = create<{ count: number; flushing: boolean }>(() => ({ count: 0, flushing: false }));

async function refreshCount() {
  useOutbox.setState({ count: (await all()).length });
}

export const outbox = {
  add: async (body: OutboxEntry['body']) => {
    await put({ clientRequestId: body.clientRequestId, body, createdAt: Date.now(), attempts: 0 });
    await refreshCount();
  },
  refreshCount,
  /** Intenta enviar todo. Devuelve las requisiciones que se lograron enviar. */
  flush: async (): Promise<Requisition[]> => {
    if (useOutbox.getState().flushing) return [];
    useOutbox.setState({ flushing: true });
    const sent: Requisition[] = [];
    try {
      for (const e of await all()) {
        try {
          const r = await api.post<Requisition>('/requisitions', e.body);
          sent.push(r);
          await del(e.clientRequestId);
        } catch (err) {
          if (err instanceof ApiError && err.status === 0) break; // sigue sin red
          if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429) {
            // rechazo definitivo (insumo ya no disponible, etc.): se descarta tras 3 intentos
            if (e.attempts >= 2) await del(e.clientRequestId);
            else await put({ ...e, attempts: e.attempts + 1, lastError: err.message });
          } else {
            await put({ ...e, attempts: e.attempts + 1, lastError: (err as Error).message });
          }
        }
      }
    } finally {
      await refreshCount();
      useOutbox.setState({ flushing: false });
    }
    return sent;
  },
};
