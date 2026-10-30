import { Injectable, Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { Actor } from '../common/actor';

export type ClientHandler = (socket: Socket, actor: Actor | null, payload: any) => unknown | Promise<unknown>;
export type LifecycleHandler = (socket: Socket, actor: Actor) => void | Promise<void>;

/** Nombres de salas (rooms) de Socket.IO. */
export const Rooms = {
  business: (bid: string) => `business:${bid}`,
  managers: (bid: string) => `managers:${bid}`,
  area: (areaId: string) => `area:${areaId}`,
  kds: (areaId: string) => `kds:${areaId}`,
  user: (userId: string) => `user:${userId}`,
  device: (deviceId: string) => `device:${deviceId}`,
  agent: (agentId: string) => `agent:${agentId}`,
  agents: (bid: string) => `agents:${bid}`,
  drivers: (bid: string) => `drivers:${bid}`,
  pos: (bid: string) => `pos:${bid}`,
  order: (publicToken: string) => `order:${publicToken}`,
  waSim: (bid: string, phone: string) => `wasim:${bid}:${phone}`,
};

/**
 * Fachada de tiempo real para el resto de módulos.
 *  - emit(room, event, payload): envía a una sala.
 *  - handle(event, fn): registra un manejador de mensajes cliente→servidor (ack soportado).
 *  - onConnect/onDisconnect: ganchos de ciclo de vida (p.ej. marcar tablet/agente en línea).
 */
@Injectable()
export class RealtimeService {
  private readonly log = new Logger('Realtime');
  server: Server | null = null;
  readonly handlers = new Map<string, ClientHandler>();
  readonly connectHooks: LifecycleHandler[] = [];
  readonly disconnectHooks: LifecycleHandler[] = [];

  emit(room: string | string[], event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(room).emit(event, payload);
  }

  toBusiness(bid: string, event: string, payload: unknown) {
    this.emit(Rooms.business(bid), event, payload);
  }

  toManagers(bid: string, event: string, payload: unknown) {
    this.emit(Rooms.managers(bid), event, payload);
  }

  handle(event: string, fn: ClientHandler) {
    if (this.handlers.has(event)) this.log.warn(`Manejador duplicado para ${event}`);
    this.handlers.set(event, fn);
  }

  onConnect(fn: LifecycleHandler) {
    this.connectHooks.push(fn);
  }

  onDisconnect(fn: LifecycleHandler) {
    this.disconnectHooks.push(fn);
  }

  /** ¿Hay algún socket conectado en la sala? (p.ej. agente de impresión en línea) */
  async roomSize(room: string): Promise<number> {
    if (!this.server) return 0;
    const sockets = await this.server.in(room).fetchSockets();
    return sockets.length;
  }
}
