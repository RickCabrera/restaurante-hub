import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { loadEnv } from '../config/env';

export type Db = NodePgDatabase<typeof schema>;
/** Transacción o conexión: ambos exponen la misma API de consultas. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');
export const InjectDb = () => Inject(DB);

export function createDb(url: string): { pool: Pool; db: Db } {
  const pool = new Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { pool, db };
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => new Pool({ connectionString: loadEnv().DATABASE_URL, max: 10 }),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool, { schema, casing: 'snake_case' }),
    },
  ],
  exports: [DB, PG_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  async onApplicationShutdown() {
    await this.pool.end().catch(() => undefined);
  }
}
