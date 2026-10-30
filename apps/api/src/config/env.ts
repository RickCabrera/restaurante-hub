import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  /** Opcional: sin Redis las colas corren en el mismo proceso */
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  /** URL pública de la app web (links en notificaciones, WhatsApp, QR) */
  APP_URL: z.string().default('http://localhost:5173'),
  /** URL pública de la API */
  API_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('*'),
  /** Slug del negocio por defecto (instalaciones de un solo restaurante) */
  DEFAULT_BUSINESS_SLUG: z.string().default('demo'),
  /** Sirve la app web compilada desde la API (un solo servicio en Railway) */
  SERVE_WEB: bool.default(false),
  WEB_DIST_PATH: z.string().optional(),

  // Web Push
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),

  // WhatsApp Cloud API (vacío => modo simulador)
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().default('cambia-este-token'),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_TEMPLATE_LANG: z.string().default('es_MX'),

  // Google Maps (vacío => geocodificación con OpenStreetMap/Nominatim)
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  // Almacenamiento S3 compatible (vacío => disco local ./uploads)
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
  UPLOADS_DIR: z.string().default('./uploads'),

  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // Falla rápido: no arranca con configuración incompleta
    throw new Error(`Configuración inválida:\n${msg}`);
  }
  cached = parsed.data;
  return cached;
}

/** Solo para pruebas */
export function resetEnvCache() {
  cached = null;
}

export const ENV = Symbol('ENV');
