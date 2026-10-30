import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle, Beef, Bell, Check, ChefHat, Clock, Coffee, Droplets, Fish, Flame, HandHelping, IceCreamCone, MessageSquare,
  Package, Phone, Pizza, ShoppingCart, Siren, Snowflake, Store, ThumbsUp, Trash2, Truck, Warehouse, Wine, Wrench, Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { RequisitionStatusLabel, type RequisitionStatus } from '@rh/shared';

export const AREA_ICON_MAP: Record<string, LucideIcon> = {
  chef: ChefHat,
  wine: Wine,
  warehouse: Warehouse,
  coffee: Coffee,
  pizza: Pizza,
  beef: Beef,
  fish: Fish,
  'ice-cream': IceCreamCone,
  store: Store,
  truck: Truck,
};
export const AREA_ICON_LABEL: Record<string, string> = {
  chef: 'Cocina', wine: 'Barra', warehouse: 'Almacén', coffee: 'Café', pizza: 'Pizza', beef: 'Parrilla', fish: 'Mariscos',
  'ice-cream': 'Postres', store: 'Tienda', truck: 'Reparto',
};

export function AreaIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const I = AREA_ICON_MAP[icon ?? ''] ?? Store;
  return <I className={className} />;
}

/** Ícono del área sobre su color. */
export function AreaBadge({ area, size = 40, className }: { area: { color: string; icon: string; name?: string }; size?: number; className?: string }) {
  return (
    <span
      className={clsx('inline-grid shrink-0 place-items-center rounded-xl text-white', className)}
      style={{ width: size, height: size, background: area.color }}
      title={area.name}
    >
      <AreaIcon icon={area.icon} className="h-[55%] w-[55%]" />
    </span>
  );
}

export const QUICK_ICON_MAP: Record<string, LucideIcon> = {
  flame: Flame,
  snowflake: Snowflake,
  truck: Truck,
  wrench: Wrench,
  'alert-triangle': AlertTriangle,
  alert: AlertTriangle,
  phone: Phone,
  siren: Siren,
  check: Check,
  bell: Bell,
  clock: Clock,
  droplets: Droplets,
  trash: Trash2,
  package: Package,
  cart: ShoppingCart,
  zap: Zap,
  help: HandHelping,
  'thumbs-up': ThumbsUp,
};
export const QUICK_ICON_KEYS = Object.keys(QUICK_ICON_MAP).filter((k) => k !== 'alert');

export function QuickIcon({ icon, className }: { icon?: string | null; className?: string }) {
  const I = QUICK_ICON_MAP[icon ?? ''] ?? MessageSquare;
  return <I className={className} />;
}

/** Paleta de colores vivos para mensajes rápidos (tiles). Se repite por índice. */
export const QUICK_TILE_COLORS = ['#E85D04', '#0077B6', '#2A9D8F', '#7B2CBF', '#D6336C', '#B85C00', '#3A0CA3', '#2D6A4F'];

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info';
export const STATUS_TONE: Record<RequisitionStatus, Tone> = {
  ENVIADA: 'info',
  VISTA: 'info',
  APROBADA: 'ok',
  APROBADA_PARCIAL: 'warn',
  RECHAZADA: 'danger',
  EN_COMPRA: 'brand',
  SURTIDA: 'ok',
  RECIBIDA: 'neutral',
  CANCELADA: 'neutral',
};
export const statusLabel = (s: RequisitionStatus) => RequisitionStatusLabel[s] ?? s;

const toneCls: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-soft',
  brand: 'bg-brand-100 text-brand-700',
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
};
export const toneBg: Record<Tone, string> = {
  neutral: 'bg-ink-mute',
  brand: 'bg-brand',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
};

export function StatusPill({ status, className, big }: { status: RequisitionStatus; className?: string; big?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full font-semibold', big ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs', toneCls[STATUS_TONE[status]], className)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', toneBg[STATUS_TONE[status]])} />
      {statusLabel(status)}
    </span>
  );
}

/** Pasos visibles del seguimiento. */
export const STEPS = [
  { key: 'ENVIADA', label: 'Enviada' },
  { key: 'VISTA', label: 'Vista' },
  { key: 'APROBADA', label: 'Aprobada' },
  { key: 'EN_COMPRA', label: 'En compra' },
  { key: 'SURTIDA', label: 'Surtida' },
  { key: 'RECIBIDA', label: 'Recibida' },
] as const;

export function stepIndex(s: RequisitionStatus): number {
  switch (s) {
    case 'ENVIADA':
      return 0;
    case 'VISTA':
      return 1;
    case 'APROBADA':
    case 'APROBADA_PARCIAL':
      return 2;
    case 'EN_COMPRA':
      return 3;
    case 'SURTIDA':
      return 4;
    case 'RECIBIDA':
      return 5;
    default:
      return -1;
  }
}

export const OPEN_STATUSES: RequisitionStatus[] = ['ENVIADA', 'VISTA', 'APROBADA', 'APROBADA_PARCIAL', 'EN_COMPRA', 'SURTIDA'];
export const isOpen = (s: RequisitionStatus) => OPEN_STATUSES.includes(s);

export const WEEKDAYS_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const AREA_SWATCHES = ['#E85D04', '#D62828', '#D6336C', '#7B2CBF', '#3A0CA3', '#0077B6', '#2A9D8F', '#2D6A4F', '#8A6A00', '#6D4C41', '#264653', '#495057'];
