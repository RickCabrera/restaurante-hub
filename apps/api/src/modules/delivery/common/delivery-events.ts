import { Injectable, Logger } from '@nestjs/common';
import type { OrderStatus } from '@rh/shared';

/** Pedido mínimo que necesitan los suscriptores (bot de WhatsApp, etc.). */
export interface OrderEventInfo {
  id: string;
  businessId: string;
  folio: string;
  publicToken: string;
  channel: string;
  type: string;
  status: OrderStatus;
  customerId: string;
  customerName: string;
  customerPhone: string;
  totalCents: number;
  estimatedMinutes: number | null;
  rejectReason: string | null;
  cancelReason: string | null;
  driverName: string | null;
}

export interface DeliveryEventMap {
  /** sessionToken: pedido web iniciado desde el bot; fromBot: lo creó el propio bot */
  'order.created': { order: OrderEventInfo; sessionToken?: string | null; fromBot: boolean };
  'order.status': { order: OrderEventInfo; previous: OrderStatus };
  'loyalty.coupon': { businessId: string; customerId: string; phone: string; name: string | null; code: string; description: string };
}

type Handler<K extends keyof DeliveryEventMap> = (p: DeliveryEventMap[K]) => Promise<void> | void;

/**
 * Bus de eventos interno del módulo Delivery. Evita dependencias circulares:
 * WhatsappModule se suscribe para avisar al cliente sin que Delivery dependa de él.
 * Los manejadores se ejecutan en segundo plano y sus errores nunca rompen el flujo del pedido.
 */
@Injectable()
export class DeliveryEvents {
  private readonly log = new Logger('DeliveryEvents');
  private readonly handlers = new Map<string, Handler<any>[]>();

  on<K extends keyof DeliveryEventMap>(event: K, fn: Handler<K>) {
    const list = this.handlers.get(event) ?? [];
    list.push(fn);
    this.handlers.set(event, list);
  }

  /** Ejecuta manejadores y espera (útil en pruebas); nunca lanza. */
  async emit<K extends keyof DeliveryEventMap>(event: K, payload: DeliveryEventMap[K]): Promise<void> {
    for (const fn of this.handlers.get(event) ?? []) {
      try {
        await fn(payload);
      } catch (e) {
        this.log.warn(`Manejador de ${event} falló: ${(e as Error).message}`);
      }
    }
  }
}
