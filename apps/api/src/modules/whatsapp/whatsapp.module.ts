import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { isManager } from '../../common/actor';
import { JobsService } from '../../jobs/jobs.service';
import { RealtimeService, Rooms } from '../../realtime/realtime.service';
import { normalizePhone } from '../../whatsapp/client/whatsapp.client';
import { DeliveryModule } from '../delivery/delivery.module';
import { BotService } from './bot.service';
import { ConversationsService, WaSender } from './conversations.service';
import { WhatsappController, WhatsappWebhookController } from './whatsapp.controller';
import type { InboundEvent } from './webhook-parser';

/**
 * Módulo B — Bot de WhatsApp (WAB-01..07): webhook de Meta, motor conversacional,
 * bandeja con traspaso a humano, avisos de estado del pedido y simulador.
 */
@Module({
  imports: [DeliveryModule],
  controllers: [WhatsappWebhookController, WhatsappController],
  providers: [ConversationsService, WaSender, BotService],
  exports: [ConversationsService, WaSender, BotService],
})
export class WhatsappModule implements OnModuleInit {
  private readonly log = new Logger('WhatsappModule');

  constructor(
    private readonly jobs: JobsService,
    private readonly rt: RealtimeService,
    private readonly bot: BotService,
    private readonly convs: ConversationsService,
  ) {}

  onModuleInit() {
    this.jobs.register<{ businessId: string; event: Omit<InboundEvent, 'timestamp'> & { timestamp: string } }>('wa.inbound', async ({ businessId, event }) => {
      await this.bot.processInbound(businessId, {
        from: event.from,
        profileName: event.profileName,
        waMessageId: event.waMessageId,
        inbound: event.inbound,
        body: event.body,
        kind: event.metaType,
        raw: event.raw,
        at: new Date(event.timestamp),
      });
    });
    this.jobs.register<{ waMessageId: string; status: string; error: string | null }>('wa.status', async (d) => {
      const m = await this.convs.updateStatus(d.waMessageId, d.status, d.error);
      if (m) {
        const c = await this.convs.findById(m.conversationId);
        if (c) await this.convs.emit(c.businessId, c, m);
      }
    });

    // Simulador: la página /dev/whatsapp se une a la sala donde el cliente emite wa.sim.out
    this.rt.handle('wasim.join', async (socket, actor, payload: { phone?: string }) => {
      if (!actor || !isManager(actor)) throw new Error('Solo administradores');
      const phone = normalizePhone(String(payload?.phone ?? ''));
      if (phone.length < 12) throw new Error('Teléfono inválido');
      await socket.join(Rooms.waSim(actor.businessId, phone));
      return { room: Rooms.waSim(actor.businessId, phone), phone };
    });
    this.rt.handle('wasim.leave', async (socket, actor, payload: { phone?: string }) => {
      if (!actor) return false;
      await socket.leave(Rooms.waSim(actor.businessId, normalizePhone(String(payload?.phone ?? ''))));
      return true;
    });
    this.log.log('Bot de WhatsApp listo');
  }
}
