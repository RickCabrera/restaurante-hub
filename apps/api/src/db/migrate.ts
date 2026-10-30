// Aplica migraciones pendientes (se ejecuta en cada deploy antes de arrancar la API).
import path from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no está definida');
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  console.log(`[migrate] aplicando migraciones desde ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log('[migrate] listo');
  await pool.end();
}

main().catch((e) => {
  console.error('[migrate] error', e);
  process.exit(1);
});
