/* eslint-disable no-console */
// Alta manual de la dueña (o cambio de contraseña) desde terminal:
//   BUSINESS_NAME="La Cocina" BUSINESS_SLUG=lacocina OWNER_NAME="María" OWNER_EMAIL=maria@correo.com \
//   OWNER_PASSWORD='contraseña-segura' pnpm create:owner
// En Railway no hace falta: usa las variables BOOTSTRAP_* (ver docs/DEPLOY.md).
import { ensureOwner } from '../src/db/bootstrap';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta la variable ${k}`);
  return v;
};

ensureOwner(need('DATABASE_URL'), {
  businessName: process.env.BUSINESS_NAME ?? 'Mi restaurante',
  slug: process.env.BUSINESS_SLUG ?? process.env.DEFAULT_BUSINESS_SLUG ?? 'principal',
  ownerName: process.env.OWNER_NAME ?? 'Dueña',
  email: need('OWNER_EMAIL'),
  password: need('OWNER_PASSWORD'),
  phone: process.env.OWNER_PHONE ?? null,
  updateExisting: true,
}).catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
