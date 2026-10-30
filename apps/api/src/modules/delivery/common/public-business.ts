import { Injectable, NotFoundException } from '@nestjs/common';
import { SettingsService } from '../../../settings/settings.service';

/** Resuelve el negocio de los endpoints públicos (/public/:slug/...) y valida que delivery esté activo. */
@Injectable()
export class PublicBusinessResolver {
  constructor(private readonly settings: SettingsService) {}

  async resolve(slug: string) {
    const b = await this.settings.getBySlug(slug).catch(() => null);
    if (!b) throw new NotFoundException('Negocio no encontrado');
    const s = await this.settings.getSettings(b.id);
    if (!s.modules.delivery) throw new NotFoundException('Pedidos en línea no disponibles');
    return { business: await this.settings.getBusiness(b.id), settings: s };
  }
}
