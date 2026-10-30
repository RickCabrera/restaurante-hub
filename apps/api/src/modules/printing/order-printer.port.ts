/**
 * Puerto de impresión que usan Delivery y POS.
 * Lo implementa PrintingService (modules/printing) y se exporta globalmente.
 */
export interface PrintOrderOptions {
  /** imprimir comandas por área de producción (default true) */
  kitchen?: boolean;
  /** imprimir ticket de cliente/repartidor en impresoras con printsCustomerTicket (default true) */
  customer?: boolean;
  reprint?: boolean;
}

export abstract class OrderPrinter {
  /** Comandas + ticket de un pedido de delivery. */
  abstract printOrder(orderId: string, opts?: PrintOrderOptions): Promise<void>;
}
