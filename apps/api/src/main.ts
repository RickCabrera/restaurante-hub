import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv(); // falla rápido si falta configuración
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  const origins = env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((s) => s.trim());
  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix('api', { exclude: ['uploads/(.*)'] });
  app.enableShutdownHooks();

  // Imágenes en disco local (cuando no hay S3)
  app.use('/uploads', express.static(path.resolve(env.UPLOADS_DIR), { maxAge: '30d' }));

  // Opcional: servir la app web compilada desde el mismo servicio (un solo deploy en Railway)
  if (env.SERVE_WEB) {
    const dist = path.resolve(env.WEB_DIST_PATH ?? path.join(__dirname, '../../web/dist'));
    if (existsSync(dist)) {
      app.use(express.static(dist, { maxAge: '1h', index: false }));
      app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) return next();
        res.sendFile(path.join(dist, 'index.html'));
      });
    }
  }

  await app.listen(env.PORT, '0.0.0.0');
  app.get(Logger).log(`API escuchando en :${env.PORT}`);
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
