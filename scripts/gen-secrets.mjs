// Genera secretos aleatorios para producción: node scripts/gen-secrets.mjs
import { randomBytes } from 'node:crypto';
const r = (n) => randomBytes(n).toString('base64url');
console.log(`JWT_SECRET=${r(48)}`);
console.log(`WHATSAPP_VERIFY_TOKEN=${r(24)}`);
