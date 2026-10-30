import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, Logger, Param, Post, Query, Req, Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { z } from 'zod';
import { Audit, CurrentActor, Public, RequiresModule, Roles } from '../../common/decorators';
import { zbody } from '../../common/pipes/zod.pipe';
import type { Actor } from '../../common/actor';
import { actorUserId } from '../../common/actor';
import { loadEnv } from '../../config/env';
import { JobsService } from '../../jobs/jobs.service';
import { SettingsService } from '../../settings/settings.service';
import { normalizePhone, WhatsappClient } from '../../whatsapp/client/whatsapp.client';
import { BotService } from './bot.service';
import { ConversationsService, WaSender } from './conversations.service';
import { describeInbound, InboundEvent, parseMetaWebhook } from './webhook-parser';
import type { Inbound } from './bot/types';

const SimInboundSchema = z
  .object({
    phone: z.string().regex(/^\+?\d{10,15}$/, 'Teléfono inválido'),
    name: z.string().trim().max(80).optional(),
    text: z.string().max(4096).optional(),
    buttonId: z.string().max(256).optional(),
    listId: z.string().max(256).optional(),
    title: z.string().max(100).optional(),
    location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), address: z.string().max(300).optional(), name: z.string().max(100).optional() }).optional(),
    image: z.object({ caption: z.string().max(500).optional() }).optional(),
  })
  .refine((b) => b.text != null || b.buttonId || b.listId || b.location || b.image, { message: 'Envía text, buttonId, listId, location o image' });

const ConversationListSchema = z.object({
  humanMode: z.enum(['1', '0', 'true', 'false']).optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const MessagesQuerySchema = z.object({ before: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) });
const ReplySchema = z.object({ text: z.string().trim().min(1).max(4096) });
const HumanSchema = z.object({ on: z.boolean() });

/** Webhook de Meta (público, verificado por firma). */
@Controller('whatsapp/webhook')
export class WhatsappWebhookController {
  private readonly log = new Logger('WhatsappWebhook');
  private readonly env = loadEnv();

  constructor(
    private readonly client: WhatsappClient,
    private readonly jobs: JobsService,
    private readonly settings: SettingsService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string, @Res() res: Response) {
    if (mode === 'subscribe' && token && token === this.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).type('text/plain').send(challenge ?? '');
      return;
    }
    res.status(403).send('Token de verificación inválido');
  }

  @Public()
  @SkipThrottle()
  @Post()
  @HttpCode(200)
  async receive(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-hub-signature-256') sig: string | undefined, @Body() body: unknown) {
    if (!this.client.verifySignature(req.rawBody, sig)) {
      this.log.warn('Firma X-Hub-Signature-256 inválida');
      throw new ForbiddenException('Firma inválida');
    }
    // Responder rápido: el procesamiento va a la cola.
    // Un solo negocio: DEFAULT_BUSINESS_SLUG. Multi-negocio (futuro): mapear metadata.phone_number_id → negocio.
    const events = parseMetaWebhook(body);
    if (!events.length) return { ok: true, received: 0 };
    const b = await this.settings.getBySlug().catch(() => null);
    if (!b) {
      this.log.warn('Webhook recibido pero no hay negocio por defecto');
      return { ok: true, received: 0 };
    }
    for (const e of events) {
      if (e.type === 'message') {
        await this.jobs.add('wa.inbound', { businessId: b.id, event: serialize(e) }, { jobId: `wa-in-${e.waMessageId}`, attempts: 2 });
      } else {
        await this.jobs.add('wa.status', { waMessageId: e.waMessageId, status: e.status, error: e.error }, { attempts: 2 });
      }
    }
    return { ok: true, received: events.length };
  }
}

type SerializedInbound = Omit<InboundEvent, 'timestamp'> & { timestamp: string };
function serialize(e: InboundEvent): SerializedInbound {
  return { ...e, timestamp: e.timestamp.toISOString() };
}

/** Bandeja (WAB-04), simulador (WAB-07) y estado de la conexión. */
@RequiresModule('delivery')
@Controller('whatsapp')
export class WhatsappController {
  private readonly env = loadEnv();

  constructor(
    private readonly client: WhatsappClient,
    private readonly bot: BotService,
    private readonly convs: ConversationsService,
    private readonly sender: WaSender,
  ) {}

  @Roles('ADMIN')
  @Get('status')
  status() {
    return {
      mode: this.client.simulated ? 'simulador' : 'conectado',
      phoneNumberId: this.env.WHATSAPP_PHONE_NUMBER_ID ?? null,
      verifyTokenConfigured: !!process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_VERIFY_TOKEN !== 'cambia-este-token',
      appSecretConfigured: !!this.env.WHATSAPP_APP_SECRET,
      webhookUrl: `${this.env.API_URL.replace(/\/$/, '')}/api/whatsapp/webhook`,
      templateLanguage: this.env.WHATSAPP_TEMPLATE_LANG,
    };
  }

  @Roles('ADMIN', 'CASHIER')
  @Get('conversations')
  list(@CurrentActor() a: Actor, @Query(zbody(ConversationListSchema)) q: z.infer<typeof ConversationListSchema>) {
    const humanMode = q.humanMode == null ? undefined : q.humanMode === '1' || q.humanMode === 'true';
    return this.convs.list(a.businessId, { humanMode, q: q.q, limit: q.limit, offset: q.offset });
  }

  @Roles('ADMIN', 'CASHIER')
  @Get('conversations/:id')
  async get(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.convs.view(await this.convs.get(a.businessId, id));
  }

  @Roles('ADMIN', 'CASHIER')
  @Get('conversations/:id/messages')
  messages(@CurrentActor() a: Actor, @Param('id') id: string, @Query(zbody(MessagesQuerySchema)) q: z.infer<typeof MessagesQuerySchema>) {
    return this.convs.messages(a.businessId, id, q);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post('conversations/:id/reply')
  @Audit('whatsapp.reply', 'wa_conversation')
  async reply(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(ReplySchema)) dto: z.infer<typeof ReplySchema>) {
    const conv = await this.convs.get(a.businessId, id);
    this.convs.ensureWindow(conv, this.client.simulated);
    const msg = await this.sender.send(a.businessId, conv, { kind: 'text', body: dto.text }, { userId: actorUserId(a) });
    if (msg.status === 'failed') throw new BadRequestException(`No se pudo enviar: ${msg.error ?? 'error desconocido'}`);
    await this.convs.update(conv.id, { unreadCount: 0 });
    return msg;
  }

  @Roles('ADMIN', 'CASHIER')
  @Post('conversations/:id/human')
  @HttpCode(200)
  @Audit('whatsapp.human', 'wa_conversation')
  human(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(HumanSchema)) dto: z.infer<typeof HumanSchema>) {
    return this.bot.setHuman(a.businessId, id, dto.on);
  }

  @Roles('ADMIN', 'CASHIER')
  @Post('conversations/:id/read')
  @HttpCode(200)
  read(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.convs.markRead(a.businessId, id);
  }

  /** Simulador: mismo pipeline que el webhook, síncrono (respuestas en la respuesta HTTP y por Socket.IO wa.sim.out). */
  @Roles('ADMIN')
  @Post('simulator/inbound')
  @HttpCode(200)
  async simulate(@CurrentActor() a: Actor, @Body(zbody(SimInboundSchema)) dto: z.infer<typeof SimInboundSchema>) {
    let inbound: Inbound;
    let kind = 'text';
    if (dto.location) {
      inbound = { kind: 'location', ...dto.location };
      kind = 'location';
    } else if (dto.buttonId) {
      inbound = { kind: 'button', id: dto.buttonId, title: dto.title };
      kind = 'button_reply';
    } else if (dto.listId) {
      inbound = { kind: 'list', id: dto.listId, title: dto.title };
      kind = 'list_reply';
    } else if (dto.image) {
      inbound = { kind: 'image', caption: dto.image.caption ?? null };
      kind = 'image';
    } else inbound = { kind: 'text', text: dto.text ?? '' };
    const r = await this.bot.processInbound(a.businessId, {
      from: dto.phone,
      profileName: dto.name ?? null,
      waMessageId: this.bot.newSimMessageId(),
      inbound,
      kind,
      body: describeInbound(inbound),
    });
    return { ...r, phone: normalizePhone(dto.phone) };
  }
}
