// Tipos y utilidades del punto de venta (contrato en docs/api/impresion-pos.md).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RT, type PaymentMethod, type Role } from '@rh/shared';
import { api } from '@/lib/api';
import { useAuth, useEffectiveRole } from '@/lib/auth-store';
import { useRealtime } from '@/lib/socket';

export type TicketStatus = 'ABIERTA' | 'POR_COBRAR' | 'PAGADA' | 'CANCELADA';
export type TableStatus = 'LIBRE' | 'OCUPADA' | 'POR_COBRAR';
export type TableShape = 'square' | 'round' | 'rect';

export interface TicketSummary {
  id: string;
  folio: string;
  status: TicketStatus;
  totalCents: number;
  paidCents: number;
  guests: number;
  waiterId: string | null;
  waiterName: string | null;
  openedAt: string;
}

export interface DiningTable {
  id: string;
  diningAreaId: string;
  name: string;
  capacity: number;
  posX: number;
  posY: number;
  shape: TableShape;
  status: TableStatus;
  active: boolean;
}

export interface FloorTable extends DiningTable {
  ticket: TicketSummary | null;
  tickets: TicketSummary[];
}

export interface DiningArea {
  id: string;
  name: string;
  sortOrder: number;
  branchId: string | null;
}

export interface FloorArea extends DiningArea {
  tables: FloorTable[];
}

export interface PosModifier {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
}
export interface PosModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  modifiers: PosModifier[];
}
export interface PosProduct {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  available: boolean;
  productionAreaId: string | null;
  modifierGroups: PosModifierGroup[];
}
export interface PosCategory {
  id: string;
  name: string;
  imageUrl: string | null;
  products: PosProduct[];
}

export interface TicketLine {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  modifiers: { name: string; priceCents: number; quantity: number; groupName?: string }[];
  note: string | null;
  discountCents: number;
  discountReason: string | null;
  isCourtesy: boolean;
  totalCents: number;
  sentAt: string | null;
  kdsDoneAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  tipCents: number;
  receivedCents: number | null;
  changeCents: number | null;
  reference: string | null;
  createdAt: string;
}

export interface Ticket {
  id: string;
  folio: string;
  status: TicketStatus;
  serviceType: 'MESA' | 'PARA_LLEVAR' | 'MOSTRADOR';
  label: string | null;
  tableId: string | null;
  tableName: string | null;
  diningAreaName?: string | null;
  tableLabel: string;
  guests: number;
  waiterId: string | null;
  waiterName: string | null;
  subtotalCents: number;
  discountCents: number;
  discountType: 'PERCENT' | 'AMOUNT' | null;
  discountValue: number | null;
  discountReason: string | null;
  tipCents: number;
  tipPercent: number | null;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  items?: TicketLine[];
  payments?: Payment[];
  unsentCount?: number;
  suggestedTips?: { percent: number; amountCents: number }[];
}

export interface CashMovement {
  id: string;
  type: 'ENTRADA' | 'SALIDA';
  amountCents: number;
  reason: string;
  source: string;
  createdAt: string;
}

export interface CashSummary {
  openingCents: number;
  salesByMethod: { method: PaymentMethod; label: string; amountCents: number; tipsCents: number; count: number }[];
  salesCents: number;
  tipsCents: number;
  paymentTipsCents?: number;
  discountsCents: number;
  entradasCents: number;
  salidasCents: number;
  expectedCashCents: number;
  movements: CashMovement[];
  ticketsCount: number;
  cancelledCount: number;
  cancelledLinesCount: number;
  countedCents: number | null;
  differenceCents: number | null;
}

export interface CashSession {
  id: string;
  folio: string;
  cashierId: string;
  cashierName: string | null;
  openingCents: number;
  countedCents: number | null;
  expectedCents: number | null;
  differenceCents: number | null;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  summary?: CashSummary;
}

// ---------------------------------------------------------------- roles

const CASH_ROLES: Role[] = ['OWNER', 'ADMIN', 'CASHIER'];
export function usePosRole() {
  const role = useEffectiveRole();
  const session = useAuth((s) => s.session);
  const staff = useAuth((s) => s.staff);
  const isDevice = session?.kind === 'device';
  return {
    role,
    isDevice,
    identified: !isDevice || !!staff,
    canCash: !!role && CASH_ROLES.includes(role),
    isManager: role === 'OWNER' || role === 'ADMIN',
    meId: session?.kind === 'user' ? session.user.id : staff?.staff.id ?? null,
    meName: session?.kind === 'user' ? session.user.name : staff?.staff.name ?? null,
  };
}

// ---------------------------------------------------------------- queries

export const qk = {
  floor: ['pos', 'floor'] as const,
  menu: ['pos', 'menu'] as const,
  ticket: (id: string) => ['pos', 'ticket', id] as const,
  tickets: (status: string, mine?: boolean) => ['pos', 'tickets', status, !!mine] as const,
  cashCurrent: ['pos', 'cash', 'current'] as const,
};

export function useFloor() {
  return useQuery({ queryKey: qk.floor, queryFn: () => api.get<FloorArea[]>('/pos/floor'), refetchInterval: 60_000 });
}
export function useMenu() {
  return useQuery({ queryKey: qk.menu, queryFn: () => api.get<PosCategory[]>('/pos/menu'), staleTime: 5 * 60_000 });
}
export function useTicket(id: string | undefined) {
  return useQuery({ queryKey: qk.ticket(id ?? ''), queryFn: () => api.get<Ticket>(`/pos/tickets/${id}`), enabled: !!id });
}
export function useOpenTickets(mine = false) {
  return useQuery({ queryKey: qk.tickets('open', mine), queryFn: () => api.get<Ticket[]>('/pos/tickets', { status: 'open', mine: mine ? 'true' : undefined }) });
}
export function useCurrentCash(enabled: boolean) {
  return useQuery({
    queryKey: qk.cashCurrent,
    queryFn: () => api.get<CashSession | null>('/pos/cash-sessions/current'),
    enabled,
    refetchInterval: 60_000,
  });
}

/** Mantiene la caché del POS al día con los eventos de tiempo real. */
export function usePosRealtime() {
  const qc = useQueryClient();
  useRealtime<Ticket>(RT.TICKET_UPDATED, (t) => {
    if (t?.id) qc.setQueryData(qk.ticket(t.id), (old: Ticket | undefined) => (old ? { ...old, ...t } : t));
    void qc.invalidateQueries({ queryKey: ['pos', 'tickets'] });
    void qc.invalidateQueries({ queryKey: qk.floor });
  });
  useRealtime(RT.TABLE_UPDATED, () => void qc.invalidateQueries({ queryKey: qk.floor }));
  useRealtime(RT.POS_CASH_UPDATED, () => void qc.invalidateQueries({ queryKey: ['pos', 'cash'] }));
  useRealtime(RT.MENU_CHANGED, () => void qc.invalidateQueries({ queryKey: qk.menu }));
  // la cocina marcó productos listos → refrescar la cuenta (✓ Listo)
  useRealtime<{ source?: string; id?: string }>(RT.KDS_UPDATED, (p) => {
    if (p?.source === 'TICKET' && p.id) void qc.invalidateQueries({ queryKey: qk.ticket(p.id) });
  });
}

/** Guarda la respuesta de una acción sobre la cuenta en la caché. */
export function useSetTicket() {
  const qc = useQueryClient();
  return (t: Ticket | undefined | null) => {
    if (!t?.id) return;
    qc.setQueryData(qk.ticket(t.id), t);
    void qc.invalidateQueries({ queryKey: qk.floor });
    void qc.invalidateQueries({ queryKey: ['pos', 'tickets'] });
  };
}

// ---------------------------------------------------------------- dinero

/** "125.5" → 12550 centavos */
export function pesosToCents(v: string): number {
  const n = parseFloat(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
/** 12550 → "125.50" (sin decimales si son cero) */
export function centsToInput(c: number): string {
  if (!c) return '';
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2);
}
/** Aplica una tecla del NumberPad a un texto de monto en pesos. */
export function padKey(cur: string, k: string): string {
  if (k === 'back') return cur.slice(0, -1);
  if (k === '.') return cur.includes('.') ? cur : (cur || '0') + '.';
  const [, dec] = cur.split('.');
  if (dec !== undefined && dec.length >= 2) return cur;
  if (cur.replace('.', '').length >= 8) return cur;
  if (cur === '0') return k;
  return cur + k;
}

export const lineModsText = (l: Pick<TicketLine, 'modifiers'>) =>
  l.modifiers.map((m) => (m.quantity > 1 ? `${m.quantity}× ${m.name}` : m.name)).join(', ');

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  ABIERTA: 'Abierta', POR_COBRAR: 'Por cobrar', PAGADA: 'Pagada', CANCELADA: 'Cancelada',
};
