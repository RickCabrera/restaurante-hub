import { Body, Controller, Get, Patch } from '@nestjs/common';
import { z } from 'zod';
import { Audit, CurrentActor, Roles } from '../common/decorators';
import { zbody } from '../common/pipes/zod.pipe';
import type { Actor } from '../common/actor';
import { SettingsService } from './settings.service';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const UpdateBusinessSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: hex.optional(),
  accentColor: hex.optional(),
  timezone: z.string().optional(),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  settings: z
    .object({
      modules: z.object({ requisitions: z.boolean(), delivery: z.boolean(), pos: z.boolean() }).partial().optional(),
      requirePin: z.boolean().optional(),
      groupWindowMinutes: z.number().int().min(0).max(240).optional(),
      quietHours: z.object({ from: z.string(), to: z.string() }).nullable().optional(),
      transferInfo: z.string().max(500).nullable().optional(),
      privacyNoticeUrl: z.string().url().nullable().optional(),
      ticketFooter: z.string().max(200).nullable().optional(),
      tips: z.array(z.number().min(0).max(100)).max(5).optional(),
      dailySummaryHour: z.number().int().min(0).max(23).nullable().optional(),
      ownerWhatsapp: z.string().max(20).nullable().optional(),
      printOn: z.enum(['create', 'accept']).optional(),
      notifyOwnerByWhatsapp: z.boolean().optional(),
      urgentEscalationMinutes: z.number().int().min(1).max(240).optional(),
      loyalty: z
        .object({ enabled: z.boolean(), everyOrders: z.number().int().min(1), discountType: z.enum(['PERCENT', 'AMOUNT']), value: z.number().int().min(1) })
        .nullable()
        .optional(),
      bot: z
        .object({
          greeting: z.string().max(500),
          closedMessage: z.string().max(500),
          handoffMessage: z.string().max(500),
          goodbye: z.string().max(500),
          allowScheduledWhenClosed: z.boolean(),
        })
        .partial()
        .optional(),
    })
    .optional(),
});

@Controller('settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  @Get()
  async get(@CurrentActor() actor: Actor) {
    const b = await this.svc.getBusiness(actor.businessId);
    return { ...b, settings: await this.svc.getSettings(actor.businessId) };
  }

  @Roles('ADMIN')
  @Patch()
  @Audit('settings.update', 'business')
  async update(@CurrentActor() actor: Actor, @Body(zbody(UpdateBusinessSchema)) dto: z.infer<typeof UpdateBusinessSchema>) {
    const current = await this.svc.getBusiness(actor.businessId);
    const settings = dto.settings
      ? {
          ...current.settings,
          ...dto.settings,
          modules: { ...(current.settings.modules ?? {}), ...(dto.settings.modules ?? {}) },
          bot: { ...(current.settings.bot ?? {}), ...(dto.settings.bot ?? {}) },
        }
      : undefined;
    await this.svc.update(actor.businessId, { ...dto, settings } as never);
    return this.get(actor);
  }
}
