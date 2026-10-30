import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, Bike, Boxes, ChefHat, ClipboardList, LayoutDashboard, MapPinned, MessageCircle, MessagesSquare,
  Printer, Receipt, Settings, ShoppingBag, ShoppingCart, Tag, Users, UtensilsCrossed, Wallet, Contact, Monitor,
} from 'lucide-react';
import type { ModuleKey, Role } from '@rh/shared';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  module?: ModuleKey;
  roles?: Role[];
  /** aparece en la barra inferior en celular */
  mobile?: boolean;
  section: 'general' | 'requisiciones' | 'delivery' | 'pos' | 'ajustes';
  /** clave para mostrar contador (ver useNavBadges) */
  badge?: 'requisitions' | 'orders' | 'chat' | 'whatsapp';
}

const MGR: Role[] = ['OWNER', 'ADMIN'];

export const NAV: NavItem[] = [
  { to: '/admin', label: 'Inicio', icon: LayoutDashboard, section: 'general', mobile: true, roles: MGR },
  // Requisiciones
  { to: '/admin/requisiciones', label: 'Requisiciones', icon: ClipboardList, module: 'requisitions', section: 'requisiciones', mobile: true, roles: MGR, badge: 'requisitions' },
  { to: '/admin/compras', label: 'Lista de compras', icon: ShoppingCart, module: 'requisitions', section: 'requisiciones', roles: MGR },
  { to: '/admin/insumos', label: 'Insumos', icon: Boxes, module: 'requisitions', section: 'requisiciones', roles: MGR },
  { to: '/admin/chat', label: 'Mensajes', icon: MessagesSquare, module: 'requisitions', section: 'requisiciones', mobile: true, roles: MGR, badge: 'chat' },
  // Delivery
  { to: '/admin/pedidos', label: 'Pedidos', icon: ShoppingBag, module: 'delivery', section: 'delivery', mobile: true, roles: [...MGR, 'CASHIER'], badge: 'orders' },
  { to: '/admin/whatsapp', label: 'WhatsApp', icon: MessageCircle, module: 'delivery', section: 'delivery', roles: MGR, badge: 'whatsapp' },
  { to: '/admin/menu', label: 'Menú', icon: UtensilsCrossed, module: 'delivery', section: 'delivery', roles: MGR },
  { to: '/admin/clientes', label: 'Clientes', icon: Contact, module: 'delivery', section: 'delivery', roles: [...MGR, 'CASHIER'] },
  { to: '/admin/repartidores', label: 'Repartidores', icon: Bike, module: 'delivery', section: 'delivery', roles: [...MGR, 'CASHIER'] },
  { to: '/admin/zonas', label: 'Sucursales y zonas', icon: MapPinned, module: 'delivery', section: 'delivery', roles: MGR },
  { to: '/admin/promociones', label: 'Promociones', icon: Tag, module: 'delivery', section: 'delivery', roles: MGR },
  // POS
  { to: '/pos', label: 'Punto de venta', icon: Receipt, module: 'pos', section: 'pos', roles: [...MGR, 'CASHIER', 'WAITER'] },
  { to: '/admin/caja', label: 'Caja y cortes', icon: Wallet, module: 'pos', section: 'pos', roles: [...MGR, 'CASHIER'] },
  { to: '/admin/mesas', label: 'Mesas', icon: ChefHat, module: 'pos', section: 'pos', roles: MGR },
  // Ajustes
  { to: '/kds', label: 'Pantalla de cocina', icon: Monitor, section: 'ajustes', roles: MGR },
  { to: '/admin/reportes', label: 'Reportes', icon: BarChart3, section: 'ajustes', roles: MGR },
  { to: '/admin/impresoras', label: 'Impresoras', icon: Printer, section: 'ajustes', roles: MGR },
  { to: '/admin/equipo', label: 'Equipo y tablets', icon: Users, section: 'ajustes', roles: MGR },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings, section: 'ajustes', roles: MGR },
];

export const SECTION_LABEL: Record<NavItem['section'], string> = {
  general: '',
  requisiciones: 'Requisiciones',
  delivery: 'Delivery',
  pos: 'Punto de venta',
  ajustes: 'Ajustes',
};
