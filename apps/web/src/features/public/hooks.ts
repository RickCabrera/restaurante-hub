import { useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { applyBrand } from '@/lib/theme';
import { useRealtime } from '@/lib/socket';
import { RT } from '@rh/shared';
import { setSeo, useDebounced } from './lib';
import type { PublicMenu, Quote, SavedAddress } from './types';
import { useCart } from './cart';

export function usePublicMenu(slug: string, channel: 'web' | 'qr', branchId?: string | null) {
  const q = useQuery({
    queryKey: ['public-menu', slug, channel, branchId ?? null],
    queryFn: () => api.get<PublicMenu>(`/public/${encodeURIComponent(slug)}/menu`, { channel, branchId: branchId ?? undefined }, { anonymous: true }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
  const b = q.data?.business;
  useEffect(() => {
    if (!b) return;
    applyBrand(b.primaryColor);
    setSeo({
      title: channel === 'qr' ? `Menú · ${b.name}` : `${b.name} · Pide en línea`,
      description:
        channel === 'qr'
          ? `Consulta el menú de ${b.name}.`
          : `Pide a domicilio o pasa a recoger en ${b.name}. Menú, precios y seguimiento de tu pedido en tiempo real.`,
      image: b.logoUrl,
    });
  }, [b, channel]);
  // Cambios de menú / horario en vivo (si el socket anónimo los recibe); si no, el refetch periódico cubre.
  useRealtime([RT.MENU_CHANGED, RT.STORE_STATUS], () => void q.refetch());
  return q;
}

/** Cuerpo de cotización/pedido a partir del carrito. */
export function useQuoteBody(opts: { address?: SavedAddress | null; branchId?: string | null }) {
  const { lines, type, couponCode, customer } = useCart();
  const a = opts.address;
  return {
    branchId: opts.branchId ?? undefined,
    type,
    lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, modifiers: l.modifiers.map((m) => ({ modifierId: m.modifierId, quantity: 1 })), note: l.note })),
    address:
      type === 'DOMICILIO' && a && a.text.trim().length >= 3
        ? { text: a.text.trim(), references: a.references?.trim() || undefined, lat: a.lat, lng: a.lng }
        : undefined,
    couponCode: couponCode.trim() || undefined,
    customerPhone: /^\d{10}$/.test(customer.phone) ? customer.phone : undefined,
  };
}
export type QuoteBody = ReturnType<typeof useQuoteBody>;

export function useQuote(slug: string, body: QuoteBody, enabled = true) {
  const debounced = useDebounced(JSON.stringify(body), 350);
  return useQuery({
    queryKey: ['public-quote', slug, debounced],
    queryFn: ({ signal }) => api.post<Quote>(`/public/${encodeURIComponent(slug)}/orders/quote`, JSON.parse(debounced), { anonymous: true, signal }),
    enabled: enabled && body.lines.length > 0 && (JSON.parse(debounced) as QuoteBody).lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}
