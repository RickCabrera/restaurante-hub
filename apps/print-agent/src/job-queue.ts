// Cola de trabajos: serializa por impresora, timeout por trabajo y deduplicación.

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`El trabajo excedió ${Math.round(ms / 1000)} s`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(ms)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Ejecuta tareas en serie por clave (una impresora a la vez), en paralelo entre claves. */
export class KeyedSerialQueue {
  private tails = new Map<string, Promise<unknown>>();
  private pending = new Map<string, number>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
    const next = prev.catch(() => undefined).then(task);
    const tail = next.finally(() => {
      const n = (this.pending.get(key) ?? 1) - 1;
      if (n <= 0) {
        this.pending.delete(key);
        if (this.tails.get(key) === tail) this.tails.delete(key);
      } else this.pending.set(key, n);
    });
    this.tails.set(key, tail.catch(() => undefined));
    return next;
  }

  size(key?: string): number {
    if (key) return this.pending.get(key) ?? 0;
    let n = 0;
    for (const v of this.pending.values()) n += v;
    return n;
  }

  async drain(): Promise<void> {
    await Promise.all([...this.tails.values()].map((p) => p.catch(() => undefined)));
  }
}

/** Recuerda IDs procesados durante `ttlMs` (evita imprimir dos veces un reenvío). */
export class RecentIds {
  private map = new Map<string, number>();
  constructor(private ttlMs = 10 * 60_000, private now: () => number = Date.now) {}

  has(id: string): boolean {
    this.prune();
    return this.map.has(id);
  }
  add(id: string) {
    this.prune();
    this.map.set(id, this.now());
  }
  delete(id: string) {
    this.map.delete(id);
  }
  private prune() {
    const limit = this.now() - this.ttlMs;
    for (const [k, t] of this.map) {
      if (t < limit) this.map.delete(k);
      else break; // orden de inserción ≈ orden temporal
    }
  }
}
