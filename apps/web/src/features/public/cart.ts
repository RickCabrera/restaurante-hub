import { create } from 'zustand';
import type { OrderType, PaymentMethod } from '@rh/shared';
import { lineKey, store } from './lib';
import type { CartLine, SavedAddress } from './types';

/** Datos del cliente recordados por negocio (localStorage rh.pub.<slug>.customer). */
export interface CustomerData {
  name: string;
  phone: string;
  address?: SavedAddress | null;
  paymentMethod?: PaymentMethod;
}

interface CartState {
  slug: string;
  lines: CartLine[];
  type: OrderType;
  branchId: string | null;
  couponCode: string;
  customer: CustomerData;
  load: (slug: string) => void;
  add: (l: Omit<CartLine, 'key'>) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setType: (t: OrderType) => void;
  setBranch: (id: string | null) => void;
  setCoupon: (c: string) => void;
  setCustomer: (c: Partial<CustomerData>) => void;
}

const kCart = (slug: string) => `rh.pub.${slug}.cart`;
const kCustomer = (slug: string) => `rh.pub.${slug}.customer`;

function persist(s: CartState) {
  if (!s.slug) return;
  store.set(kCart(s.slug), { lines: s.lines, type: s.type, branchId: s.branchId, couponCode: s.couponCode, at: Date.now() });
  store.set(kCustomer(s.slug), s.customer);
}

export const useCart = create<CartState>((set, get) => ({
  slug: '',
  lines: [],
  type: 'DOMICILIO',
  branchId: null,
  couponCode: '',
  customer: { name: '', phone: '' },
  load: (slug) => {
    if (get().slug === slug) return;
    const c = store.get<{ lines?: CartLine[]; type?: OrderType; branchId?: string | null; couponCode?: string; at?: number }>(kCart(slug), {});
    // el carrito caduca a los 3 días
    const fresh = c.at && Date.now() - c.at < 3 * 24 * 3600_000;
    set({
      slug,
      lines: fresh ? c.lines ?? [] : [],
      type: c.type ?? 'DOMICILIO',
      branchId: c.branchId ?? null,
      couponCode: fresh ? c.couponCode ?? '' : '',
      customer: store.get<CustomerData>(kCustomer(slug), { name: '', phone: '' }),
    });
  },
  add: (l) => {
    const key = lineKey(l.productId, l.modifiers.map((m) => m.modifierId), l.note);
    const lines = [...get().lines];
    const i = lines.findIndex((x) => x.key === key);
    if (i >= 0) lines[i] = { ...lines[i], quantity: Math.min(99, lines[i].quantity + l.quantity) };
    else lines.push({ ...l, key });
    set({ lines });
    persist(get());
  },
  setQty: (key, qty) => {
    set({ lines: qty <= 0 ? get().lines.filter((l) => l.key !== key) : get().lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, qty) } : l)) });
    persist(get());
  },
  remove: (key) => {
    set({ lines: get().lines.filter((l) => l.key !== key) });
    persist(get());
  },
  clear: () => {
    set({ lines: [], couponCode: '' });
    persist(get());
  },
  setType: (type) => {
    set({ type });
    persist(get());
  },
  setBranch: (branchId) => {
    set({ branchId });
    persist(get());
  },
  setCoupon: (couponCode) => {
    set({ couponCode });
    persist(get());
  },
  setCustomer: (c) => {
    set({ customer: { ...get().customer, ...c } });
    persist(get());
  },
}));

export const cartCount = (lines: CartLine[]) => lines.reduce((s, l) => s + l.quantity, 0);
