import { OrderStatus, OrderType, RequisitionStatus } from './enums';

/** Quién ejecuta la transición de una requisición. */
export type RequisitionActor = 'AREA' | 'MANAGER';

/** Transiciones válidas de requisición: [desde] -> { hacia: actores permitidos } */
export const REQUISITION_TRANSITIONS: Record<
  RequisitionStatus,
  Partial<Record<RequisitionStatus, RequisitionActor[]>>
> = {
  ENVIADA: {
    VISTA: ['MANAGER'],
    APROBADA: ['MANAGER'],
    APROBADA_PARCIAL: ['MANAGER'],
    RECHAZADA: ['MANAGER'],
    CANCELADA: ['AREA', 'MANAGER'],
  },
  VISTA: {
    APROBADA: ['MANAGER'],
    APROBADA_PARCIAL: ['MANAGER'],
    RECHAZADA: ['MANAGER'],
    CANCELADA: ['AREA', 'MANAGER'],
  },
  APROBADA: { EN_COMPRA: ['MANAGER'], SURTIDA: ['MANAGER'], CANCELADA: ['MANAGER'] },
  APROBADA_PARCIAL: { EN_COMPRA: ['MANAGER'], SURTIDA: ['MANAGER'], CANCELADA: ['MANAGER'] },
  EN_COMPRA: { SURTIDA: ['MANAGER'], CANCELADA: ['MANAGER'] },
  SURTIDA: { RECIBIDA: ['AREA', 'MANAGER'] },
  RECHAZADA: {},
  RECIBIDA: {},
  CANCELADA: {},
};

export function canTransitionRequisition(
  from: RequisitionStatus,
  to: RequisitionStatus,
  actor: RequisitionActor,
): boolean {
  return REQUISITION_TRANSITIONS[from]?.[to]?.includes(actor) ?? false;
}

export const REQUISITION_OPEN_STATUSES: RequisitionStatus[] = [
  RequisitionStatus.ENVIADA,
  RequisitionStatus.VISTA,
  RequisitionStatus.APROBADA,
  RequisitionStatus.APROBADA_PARCIAL,
  RequisitionStatus.EN_COMPRA,
  RequisitionStatus.SURTIDA,
];

/** Transiciones válidas de pedido de delivery. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NUEVO: ['ACEPTADO', 'RECHAZADO', 'CANCELADO'],
  ACEPTADO: ['EN_PREPARACION', 'LISTO', 'CANCELADO'],
  EN_PREPARACION: ['LISTO', 'CANCELADO'],
  LISTO: ['EN_CAMINO', 'RECOGIDO', 'ENTREGADO', 'CANCELADO'],
  EN_CAMINO: ['ENTREGADO', 'CANCELADO'],
  ENTREGADO: [],
  RECOGIDO: [],
  RECHAZADO: [],
  CANCELADO: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus, type: OrderType): boolean {
  if (!ORDER_TRANSITIONS[from]?.includes(to)) return false;
  if (type === 'PASAR_A_RECOGER' && (to === 'EN_CAMINO' || to === 'ENTREGADO')) return false;
  if (type === 'DOMICILIO' && to === 'RECOGIDO') return false;
  return true;
}

export const ORDER_ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.NUEVO,
  OrderStatus.ACEPTADO,
  OrderStatus.EN_PREPARACION,
  OrderStatus.LISTO,
  OrderStatus.EN_CAMINO,
];
