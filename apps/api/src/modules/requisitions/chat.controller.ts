import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AllowDevice, Audit, CurrentActor, RequiresModule, Roles } from '../../common/decorators';
import { zbody } from '../../common/pipes/zod.pipe';
import type { Actor } from '../../common/actor';
import { isManager } from '../../common/actor';
import { ChatService } from './chat.service';
import { BroadcastSchema, MessagesQuery, QuickMessageSchema, ReorderSchema, SendMessageBody, UpdateQuickMessageSchema, zq } from './dto';

/** MSG-01..04 · Chat interno áreas ↔ dueña */
@RequiresModule('requisitions')
@Controller('chat')
export class ChatController {
  constructor(private readonly svc: ChatService) {}

  @AllowDevice('AREA')
  @Get('conversations')
  conversations(@CurrentActor() a: Actor) {
    return this.svc.listConversations(a);
  }

  @AllowDevice('AREA')
  @Get('unread')
  unread(@CurrentActor() a: Actor) {
    return this.svc.unreadTotal(a);
  }

  @AllowDevice('AREA')
  @Get('conversations/:id/messages')
  messages(@CurrentActor() a: Actor, @Param('id') id: string, @Query(zq(MessagesQuery)) q: z.infer<typeof MessagesQuery>) {
    return this.svc.listMessages(a, id, q);
  }

  @AllowDevice('AREA')
  @Post('conversations/:id/read')
  @HttpCode(200)
  read(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.markRead(a, id);
  }

  @AllowDevice('AREA')
  @Post('messages')
  send(@CurrentActor() a: Actor, @Body(zbody(SendMessageBody)) dto: z.infer<typeof SendMessageBody>) {
    return this.svc.send(a, dto);
  }

  @Roles('ADMIN')
  @Post('broadcast')
  broadcast(@CurrentActor() a: Actor, @Body(zbody(BroadcastSchema)) dto: z.infer<typeof BroadcastSchema>) {
    return this.svc.broadcast(a, dto);
  }

  // ---------------------------------------------------------- mensajes rápidos
  /** Tablets y personal ven los activos; la dueña puede pedir ?all=1. */
  @AllowDevice('AREA')
  @Get('quick-messages')
  quick(@CurrentActor() a: Actor, @Query('all') all?: string) {
    return this.svc.listQuickMessages(a, all === '1' && isManager(a));
  }

  @Roles('ADMIN')
  @Post('quick-messages')
  @Audit('quick_message.create', 'quick_message')
  createQuick(@CurrentActor() a: Actor, @Body(zbody(QuickMessageSchema)) dto: z.infer<typeof QuickMessageSchema>) {
    return this.svc.createQuickMessage(a, dto);
  }

  @Roles('ADMIN')
  @Post('quick-messages/reorder')
  @HttpCode(200)
  reorderQuick(@CurrentActor() a: Actor, @Body(zbody(ReorderSchema)) dto: z.infer<typeof ReorderSchema>) {
    return this.svc.reorderQuickMessages(a, dto.ids);
  }

  @Roles('ADMIN')
  @Patch('quick-messages/:id')
  @Audit('quick_message.update', 'quick_message')
  updateQuick(@CurrentActor() a: Actor, @Param('id') id: string, @Body(zbody(UpdateQuickMessageSchema)) dto: z.infer<typeof UpdateQuickMessageSchema>) {
    return this.svc.updateQuickMessage(a, id, dto);
  }

  @Roles('ADMIN')
  @Delete('quick-messages/:id')
  @Audit('quick_message.delete', 'quick_message')
  deleteQuick(@CurrentActor() a: Actor, @Param('id') id: string) {
    return this.svc.deleteQuickMessage(a, id);
  }
}
