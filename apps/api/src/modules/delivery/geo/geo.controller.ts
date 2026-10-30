import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequiresModule } from '../../../common/decorators';
import { zbody } from '../../../common/pipes/zod.pipe';
import { GeoQuerySchema, LatLngQuerySchema } from '../common/dto';
import { GeoService } from './geo.service';

@RequiresModule('delivery')
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('geocode')
  async geocode(@Query(zbody(GeoQuerySchema)) q: z.infer<typeof GeoQuerySchema>) {
    const bias = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined;
    return { provider: this.geo.provider, result: await this.geo.geocode(q.q, bias) };
  }

  @Get('reverse')
  async reverse(@Query(zbody(LatLngQuerySchema)) q: z.infer<typeof LatLngQuerySchema>) {
    return { provider: this.geo.provider, result: await this.geo.reverse(q.lat, q.lng) };
  }

  @Get('autocomplete')
  async autocomplete(@Query(zbody(GeoQuerySchema)) q: z.infer<typeof GeoQuerySchema>) {
    const bias = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined;
    return { provider: this.geo.provider, suggestions: await this.geo.autocomplete(q.q, bias) };
  }
}
