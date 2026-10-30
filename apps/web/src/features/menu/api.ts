import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CategoryRow, MenuModifierGroup, ProductRow } from '@/features/delivery-common';

export const mk = {
  products: ['menu-admin', 'products'] as const,
  categories: ['menu-admin', 'categories'] as const,
  groups: ['menu-admin', 'groups'] as const,
};

export const useProducts = () => useQuery({ queryKey: mk.products, queryFn: () => api.get<ProductRow[]>('/menu/products') });
export const useCategories = () => useQuery({ queryKey: mk.categories, queryFn: () => api.get<CategoryRow[]>('/menu/categories') });
export const useGroups = () => useQuery({ queryKey: mk.groups, queryFn: () => api.get<MenuModifierGroup[]>('/menu/modifier-groups') });

export const CHANNEL_FLAGS = [
  { key: 'showInWeb', label: 'Web' },
  { key: 'showInWhatsapp', label: 'WhatsApp' },
  { key: 'showInQr', label: 'QR' },
  { key: 'showInPos', label: 'POS' },
] as const;
