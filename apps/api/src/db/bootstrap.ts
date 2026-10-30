/* eslint-disable no-console */
// Alta inicial automática al arrancar (sin terminal): si BOOTSTRAP_OWNER_EMAIL y BOOTSTRAP_OWNER_PASSWORD
// están definidas y el negocio no tiene esa cuenta, crea negocio + sucursal + dueña. Idempotente.
// Variables: BOOTSTRAP_BUSINESS_NAME, BOOTSTRAP_BUSINESS_SLUG (o DEFAULT_BUSINESS_SLUG), BOOTSTRAP_OWNER_NAME,
//            BOOTSTRAP_OWNER_EMAIL, BOOTSTRAP_OWNER_PASSWORD, BOOTSTRAP_OWNER_PHONE.
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { createDb } from './db.module';
import * as s from './schema';

export interface OwnerInput {
  businessName: string;
  slug: string;
  ownerName: string;
  email: string;
  password: string;
  phone?: string | null;
  /** si la cuenta existe, actualizar contraseña */
  updateExisting: boolean;
}

export async function ensureOwner(databaseUrl: string, input: OwnerInput) {
  const { db, pool } = createDb(databaseUrl);
  try {
    const slug = input.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const email = input.email.toLowerCase();
    if (input.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    let biz = await db.query.businesses.findFirst({ where: eq(s.businesses.slug, slug) });
    if (!biz) {
      [biz] = await db
        .insert(s.businesses)
        .values({ name: input.businessName, slug, settings: { modules: { requisitions: true, delivery: true, pos: false } } })
        .returning();
      const day = [{ open: '09:00', close: '22:00' }];
      await db.insert(s.branches).values({
        businessId: biz.id, name: 'Sucursal principal',
        hours: { '0': day, '1': day, '2': day, '3': day, '4': day, '5': day, '6': day },
      });
      await db.insert(s.conversations).values({ businessId: biz.id, type: 'GENERAL', title: 'Todos' });
      await db.insert(s.quickMessages).values([
        { businessId: biz.id, text: 'Se acabó el gas', icon: 'flame', urgent: true, sortOrder: 1 },
        { businessId: biz.id, text: 'Falta hielo', icon: 'snowflake', sortOrder: 2 },
        { businessId: biz.id, text: 'Llegó el proveedor', icon: 'truck', sortOrder: 3 },
        { businessId: biz.id, text: 'Equipo descompuesto', icon: 'wrench', urgent: true, sortOrder: 4 },
        { businessId: biz.id, text: 'Recibido, gracias', icon: 'check', sortOrder: 5 },
      ]);
      console.log(`[bootstrap] Negocio creado: ${biz.name} (${slug})`);
    }
    const existing = await db.query.users.findFirst({ where: and(eq(s.users.businessId, biz.id), eq(s.users.email, email)) });
    if (existing) {
      if (input.updateExisting) {
        await db.update(s.users).set({ passwordHash: await bcrypt.hash(input.password, 10), role: 'OWNER', active: true, failedLogins: 0, lockedUntil: null }).where(eq(s.users.id, existing.id));
        console.log(`[bootstrap] Cuenta actualizada: ${email}`);
      }
      return;
    }
    await db.insert(s.users).values({
      businessId: biz.id, name: input.ownerName, email, phone: input.phone ?? null,
      passwordHash: await bcrypt.hash(input.password, 10), role: 'OWNER', avatarColor: '#E85D04',
    });
    console.log(`[bootstrap] Cuenta de la dueña creada: ${email}`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  const e = process.env;
  if (!e.DATABASE_URL || !e.BOOTSTRAP_OWNER_EMAIL || !e.BOOTSTRAP_OWNER_PASSWORD) {
    process.exit(0); // nada que hacer
  }
  ensureOwner(e.DATABASE_URL, {
    businessName: e.BOOTSTRAP_BUSINESS_NAME ?? 'Mi restaurante',
    slug: e.BOOTSTRAP_BUSINESS_SLUG ?? e.DEFAULT_BUSINESS_SLUG ?? 'principal',
    ownerName: e.BOOTSTRAP_OWNER_NAME ?? 'Dueña',
    email: e.BOOTSTRAP_OWNER_EMAIL,
    password: e.BOOTSTRAP_OWNER_PASSWORD,
    phone: e.BOOTSTRAP_OWNER_PHONE ?? null,
    updateExisting: false,
  }).catch((err) => {
    console.error('[bootstrap]', err.message ?? err);
    process.exit(1);
  });
}
