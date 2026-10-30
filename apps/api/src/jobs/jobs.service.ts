import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { loadEnv } from '../config/env';

export type JobHandler<T = any> = (data: T) => Promise<void>;

export interface AddJobOptions {
  delayMs?: number;
  attempts?: number;
  /** id único: evita duplicados (p.ej. escalamiento de una requisición) */
  jobId?: string;
}

/**
 * Cola de trabajos en segundo plano (envío de WhatsApp, push, impresión, escalamientos).
 * - Con REDIS_URL: BullMQ (reintentos con backoff exponencial, sobrevive reinicios).
 * - Sin REDIS_URL: ejecución en el mismo proceso con reintentos simples (desarrollo / instalación mínima).
 * Los trabajos programados (cron) se manejan con @nestjs/schedule en cada módulo.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger('Jobs');
  private readonly handlers = new Map<string, JobHandler>();
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: IORedis | null = null;
  private timers = new Set<NodeJS.Timeout>();
  readonly mode: 'redis' | 'inline';

  constructor() {
    this.mode = loadEnv().REDIS_URL && process.env.NODE_ENV !== 'test' ? 'redis' : 'inline';
  }

  onModuleInit() {
    if (this.mode !== 'redis') {
      this.log.log('Colas en modo inline (sin Redis)');
      return;
    }
    this.connection = new IORedis(loadEnv().REDIS_URL!, { maxRetriesPerRequest: null });
    this.queue = new Queue(loadEnv().QUEUE_NAME, { connection: this.connection });
    this.worker = new Worker(
      loadEnv().QUEUE_NAME,
      async (job) => {
        const h = this.handlers.get(job.name);
        if (!h) throw new Error(`Sin manejador para ${job.name}`);
        await h(job.data);
      },
      { connection: this.connection, concurrency: 5 },
    );
    this.worker.on('failed', (job, err) =>
      this.log.warn(`Trabajo ${job?.name} falló (intento ${job?.attemptsMade}): ${err.message}`),
    );
    this.log.log('Colas con Redis (BullMQ)');
  }

  register<T>(name: string, handler: JobHandler<T>) {
    this.handlers.set(name, handler as JobHandler);
  }

  async add<T>(name: string, data: T, opts: AddJobOptions = {}) {
    const attempts = opts.attempts ?? 3;
    if (this.queue) {
      const o: JobsOptions = {
        attempts,
        backoff: { type: 'exponential', delay: 5_000 },
        delay: opts.delayMs,
        jobId: opts.jobId,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      };
      await this.queue.add(name, data, o);
      return;
    }
    this.runInline(name, data, attempts, opts.delayMs ?? 0);
  }

  private runInline<T>(name: string, data: T, attemptsLeft: number, delay: number) {
    const t = setTimeout(async () => {
      this.timers.delete(t);
      const h = this.handlers.get(name);
      if (!h) return this.log.warn(`Sin manejador para ${name}`);
      try {
        await h(data);
      } catch (e) {
        this.log.warn(`Trabajo ${name} falló: ${(e as Error).message}`);
        if (attemptsLeft > 1) this.runInline(name, data, attemptsLeft - 1, 5_000);
      }
    }, delay);
    this.timers.add(t);
  }

  async onApplicationShutdown() {
    for (const t of this.timers) clearTimeout(t);
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    await this.connection?.quit().catch(() => undefined);
  }
}
