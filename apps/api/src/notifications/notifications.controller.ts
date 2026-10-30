import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentActor } from '../common/decorators';
import { zbody } from '../common/pipes/zod.pipe';
import { Actor, actorUserId } from '../common/actor';
import { NotificationsService } from './notifications.service';

const PushSubSchema = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) });

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  async list(@CurrentActor() actor: Actor, @Query('unread') unread?: string, @Query('limit') limit?: string) {
    const uid = actorUserId(actor);
    if (!uid) return { items: [], unread: 0 };
    const [items, count] = await Promise.all([
      this.svc.list(uid, { unreadOnly: unread === '1', limit: limit ? Number(limit) : undefined }),
      this.svc.unreadCount(uid),
    ]);
    return { items, unread: count };
  }

  @Post('read')
  @HttpCode(200)
  async read(@CurrentActor() actor: Actor, @Body(zbody(z.object({ ids: z.array(z.string()).optional() }))) dto: { ids?: string[] }) {
    const uid = actorUserId(actor);
    if (uid) await this.svc.markRead(uid, dto.ids);
    return { ok: true };
  }

  @Get('push/public-key')
  publicKey() {
    return { publicKey: this.svc.vapidPublicKey };
  }

  @Post('push/subscribe')
  @HttpCode(200)
  async subscribe(@CurrentActor() actor: Actor, @Body(zbody(PushSubSchema)) dto: z.infer<typeof PushSubSchema>) {
    const uid = actorUserId(actor);
    if (uid) await this.svc.subscribePush(uid, dto);
    return { ok: !!uid };
  }

  @Delete('push/subscribe')
  async unsubscribe(@Body(zbody(z.object({ endpoint: z.string() }))) dto: { endpoint: string }) {
    await this.svc.unsubscribePush(dto.endpoint);
    return { ok: true };
  }
}
