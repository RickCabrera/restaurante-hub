import { Global, Module } from '@nestjs/common';
import { TokenService } from '../auth/token.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../common/services/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { JobsService } from '../jobs/jobs.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappClient } from '../whatsapp/client/whatsapp.client';

/**
 * Servicios transversales disponibles en toda la API sin importar módulos:
 * tokens, configuración del negocio, bitácora, tiempo real, colas, archivos, notificaciones y cliente de WhatsApp.
 */
@Global()
@Module({
  providers: [
    TokenService, SettingsService, AuditService, RealtimeService, RealtimeGateway,
    JobsService, StorageService, NotificationsService, WhatsappClient,
  ],
  exports: [
    TokenService, SettingsService, AuditService, RealtimeService,
    JobsService, StorageService, NotificationsService, WhatsappClient,
  ],
})
export class CoreModule {}
