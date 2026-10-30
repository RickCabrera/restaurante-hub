import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { loadEnv } from '../config/env';

/**
 * Respaldo diario de la base de datos (OPS-05).
 * Se activa con BACKUP_S3_BUCKET (bucket PRIVADO; usa las mismas credenciales S3_*).
 * pg_dump → gzip → s3://BACKUP_S3_BUCKET/backups/AAAA-MM-DD.sql.gz, conservando BACKUP_RETENTION_DAYS (30).
 */
@Injectable()
export class BackupService {
  private readonly log = new Logger('Backup');
  private readonly env = loadEnv();
  private readonly bucket = process.env.BACKUP_S3_BUCKET;
  private readonly retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);

  private client(): S3Client | null {
    const e = this.env;
    if (!this.bucket || !e.S3_ACCESS_KEY || !e.S3_SECRET_KEY) return null;
    return new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      forcePathStyle: !!e.S3_ENDPOINT,
      credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
    });
  }

  // 04:10 hora del servidor (UTC en Railway ≈ 22:10 CDMX)
  @Cron('10 4 * * *')
  async nightly() {
    if (!this.client()) return;
    try {
      await this.run();
    } catch (e) {
      this.log.error(`Respaldo falló: ${(e as Error).message}`);
    }
  }

  async run(): Promise<string> {
    const s3 = this.client();
    if (!s3) throw new Error('Respaldo no configurado (BACKUP_S3_BUCKET)');
    const key = `backups/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.sql.gz`;
    const body = await this.dump();
    await s3.send(new PutObjectCommand({ Bucket: this.bucket!, Key: key, Body: body, ContentType: 'application/gzip' }));
    this.log.log(`Respaldo guardado: ${key} (${Math.round(body.length / 1024)} KB)`);
    await this.prune(s3);
    return key;
  }

  private dump(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const p = spawn('pg_dump', ['--no-owner', '--no-privileges', this.env.DATABASE_URL]);
      const gz = createGzip();
      const chunks: Buffer[] = [];
      let err = '';
      p.stderr.on('data', (d) => (err += d.toString()));
      p.stdout.pipe(gz);
      gz.on('data', (c: Buffer) => chunks.push(c));
      gz.on('end', () => resolve(Buffer.concat(chunks)));
      p.on('error', reject);
      p.on('close', (code) => code !== 0 && reject(new Error(err || `pg_dump salió con código ${code}`)));
    });
  }

  private async prune(s3: S3Client) {
    const cutoff = Date.now() - this.retentionDays * 86_400_000;
    const list = await s3.send(new ListObjectsV2Command({ Bucket: this.bucket!, Prefix: 'backups/' }));
    const old = (list.Contents ?? []).filter((o) => o.LastModified && o.LastModified.getTime() < cutoff && o.Key);
    if (!old.length) return;
    await s3.send(new DeleteObjectsCommand({ Bucket: this.bucket!, Delete: { Objects: old.map((o) => ({ Key: o.Key! })) } }));
    this.log.log(`Respaldos antiguos eliminados: ${old.length}`);
  }
}
