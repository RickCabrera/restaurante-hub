import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import type { Actor } from '../common/actor';
import { isManager } from '../common/actor';
import { RealtimeService, Rooms } from './realtime.service';

/**
 * Gateway único en el namespace /rt.
 * Conexión: io(API_URL + '/rt', { auth: { token: 'Bearer xxx' | 'Device xxx' | 'Agent xxx', staffToken? } })
 * Sin token: socket anónimo que solo puede seguir pedidos públicos ('order.watch') y el simulador de WhatsApp.
 */
@WebSocketGateway({ namespace: '/rt', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger('RealtimeGateway');

  constructor(private readonly rt: RealtimeService, private readonly tokens: TokenService) {}

  afterInit(server: Server) {
    this.rt.server = server;
  }

  async handleConnection(socket: Socket) {
    const auth = (socket.handshake.auth ?? {}) as { token?: string; staffToken?: string };
    const header = auth.token ?? (socket.handshake.headers['authorization'] as string | undefined);
    let actor: Actor | null = null;
    try {
      actor = await this.tokens.resolve(header, auth.staffToken);
    } catch (e) {
      this.log.warn(`Error resolviendo actor: ${(e as Error).message}`);
    }
    if (header && !actor) {
      socket.emit('auth.error', { message: 'Credenciales inválidas' });
      socket.disconnect(true);
      return;
    }
    socket.data.actor = actor;

    if (actor) {
      const rooms = [Rooms.business(actor.businessId)];
      if (actor.kind === 'user') {
        rooms.push(Rooms.user(actor.userId));
        if (isManager(actor)) rooms.push(Rooms.managers(actor.businessId));
        if (actor.role === 'DRIVER') rooms.push(Rooms.drivers(actor.businessId));
        if (['CASHIER', 'WAITER', 'ADMIN', 'OWNER'].includes(actor.role)) rooms.push(Rooms.pos(actor.businessId));
      } else if (actor.kind === 'device') {
        rooms.push(Rooms.device(actor.deviceId));
        if (actor.areaId) rooms.push(Rooms.area(actor.areaId));
        if (actor.purpose === 'KDS' && actor.areaId) rooms.push(Rooms.kds(actor.areaId));
        if (actor.purpose === 'POS') rooms.push(Rooms.pos(actor.businessId));
        if (actor.staff) rooms.push(Rooms.user(actor.staff.userId));
      } else if (actor.kind === 'agent') {
        rooms.push(Rooms.agent(actor.agentId), Rooms.agents(actor.businessId));
      }
      await socket.join(rooms);
      for (const h of this.rt.connectHooks) {
        try {
          await h(socket, actor);
        } catch (e) {
          this.log.warn(`connect hook: ${(e as Error).message}`);
        }
      }
    }

    // Despacho genérico de mensajes cliente → servidor hacia manejadores registrados.
    socket.onAny(async (event: string, ...args: unknown[]) => {
      const fn = this.rt.handlers.get(event);
      const ack = typeof args[args.length - 1] === 'function' ? (args.pop() as (r: unknown) => void) : null;
      if (!fn) return ack?.({ ok: false, error: 'Evento desconocido' });
      try {
        const result = await fn(socket, socket.data.actor ?? null, args[0]);
        ack?.({ ok: true, data: result ?? null });
      } catch (e) {
        ack?.({ ok: false, error: (e as Error).message });
      }
    });

    socket.emit('ready', { actor: actor ? { kind: actor.kind, businessId: actor.businessId } : null });
  }

  async handleDisconnect(socket: Socket) {
    const actor = socket.data.actor as Actor | null;
    if (!actor) return;
    for (const h of this.rt.disconnectHooks) {
      try {
        await h(socket, actor);
      } catch (e) {
        this.log.warn(`disconnect hook: ${(e as Error).message}`);
      }
    }
  }
}
