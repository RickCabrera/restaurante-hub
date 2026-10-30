import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from '../common/decorators';
import { DB, Db } from '../db/db.module';
import { JobsService } from '../jobs/jobs.service';
import { StorageService } from '../storage/storage.service';
import { WhatsappClient } from '../whatsapp/client/whatsapp.client';
import { loadEnv } from '../config/env';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
    private readonly wa: WhatsappClient,
  ) {}

  @Public()
  @Get()
  async health() {
    let database = 'ok';
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      database = 'error';
    }
    const env = loadEnv();
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      database,
      queue: this.jobs.mode,
      storage: this.storage.mode,
      whatsapp: this.wa.simulated ? 'simulador' : 'conectado',
      maps: env.GOOGLE_MAPS_API_KEY ? 'google' : 'openstreetmap',
      push: env.VAPID_PUBLIC_KEY ? 'activo' : 'inactivo',
      version: process.env.npm_package_version ?? '1.0.0',
    };
  }
}
