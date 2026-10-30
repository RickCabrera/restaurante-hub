import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createId } from '@paralleldrive/cuid2';
import { loadEnv } from '../config/env';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Almacenamiento de imágenes (íconos de insumos, fotos de platillos, logos, fotos del chat).
 * - S3 compatible (Cloudflare R2, AWS, Railway bucket) si S3_BUCKET está configurado.
 * - Disco local (./uploads, servido en /uploads) en otro caso.
 * Las imágenes se redimensionan y convierten a WebP.
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger('Storage');
  private readonly env = loadEnv();
  private readonly s3: S3Client | null;

  constructor() {
    const e = this.env;
    this.s3 =
      e.S3_BUCKET && e.S3_ACCESS_KEY && e.S3_SECRET_KEY
        ? new S3Client({
            region: e.S3_REGION,
            endpoint: e.S3_ENDPOINT,
            forcePathStyle: !!e.S3_ENDPOINT,
            credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
          })
        : null;
    this.log.log(this.s3 ? `Imágenes en S3 (${e.S3_BUCKET})` : `Imágenes en disco local (${e.UPLOADS_DIR})`);
  }

  get mode() {
    return this.s3 ? 's3' : 'local';
  }

  async saveImage(
    file: { buffer: Buffer; mimetype: string; size: number },
    opts: { folder: string; maxSize?: number },
  ): Promise<{ url: string; key: string }> {
    if (!file?.buffer) throw new BadRequestException('Archivo requerido');
    if (!ALLOWED.includes(file.mimetype)) throw new BadRequestException('Formato no permitido (JPG, PNG, WebP, GIF, SVG)');
    if (file.size > MAX_BYTES) throw new BadRequestException('La imagen excede 8 MB');

    let body: Buffer = file.buffer;
    let ext = 'webp';
    let contentType = 'image/webp';
    if (file.mimetype === 'image/svg+xml') {
      ext = 'svg';
      contentType = file.mimetype;
    } else {
      const size = opts.maxSize ?? 1024;
      body = await sharp(file.buffer).rotate().resize(size, size, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    }
    const key = `${opts.folder}/${createId()}.${ext}`;
    return { key, url: await this.putObject(key, body, contentType) };
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.env.S3_BUCKET!, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000' }),
      );
      const base = this.env.S3_PUBLIC_URL ?? `${this.env.S3_ENDPOINT}/${this.env.S3_BUCKET}`;
      return `${base.replace(/\/$/, '')}/${key}`;
    }
    const full = path.resolve(this.env.UPLOADS_DIR, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return `${this.env.API_URL.replace(/\/$/, '')}/uploads/${key}`;
  }
}
