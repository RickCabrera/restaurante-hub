import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { DbModule } from './db/db.module';
import { CoreModule } from './core/core.module';
import { AuthGuard } from './common/guards/auth.guard';
import { AuditInterceptor } from './common/services/audit.interceptor';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { NotificationsController } from './notifications/notifications.controller';
import { HealthController } from './health/health.controller';
import { UploadsController } from './storage/uploads.controller';
import { SettingsController } from './settings/settings.controller';
import { FEATURE_MODULES } from './feature-modules';
import { loadEnv } from './config/env';

const env = loadEnv();

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
        transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        redact: ['req.headers.authorization', 'req.headers["x-staff-token"]', 'req.headers.cookie'],
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        customProps: () => ({ app: 'restaurante-hub-api' }),
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    ScheduleModule.forRoot(),
    DbModule,
    CoreModule,
    ...FEATURE_MODULES,
  ],
  controllers: [AuthController, NotificationsController, HealthController, UploadsController, SettingsController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
