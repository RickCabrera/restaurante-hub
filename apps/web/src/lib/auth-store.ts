import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Role } from '@rh/shared';

export interface PublicUser {
  id: string;
  businessId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  avatarColor: string;
  active: boolean;
  areaIds?: string[];
}

export interface AreaInfo {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  /** AREA = tablet de requisiciones · KDS = pantalla de cocina · POS = caja/comandero */
  purpose: 'AREA' | 'KDS' | 'POS';
  area: AreaInfo | null;
}

export interface StaffInfo {
  id: string;
  name: string;
  role: Role;
  avatarColor: string;
}

export interface BusinessInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  timezone: string;
  currency: string;
  modules: { requisitions?: boolean; delivery?: boolean; pos?: boolean };
  requirePin: boolean;
  tips: number[];
}

export type Session =
  | { kind: 'user'; accessToken: string; refreshToken: string; user: PublicUser }
  | { kind: 'device'; deviceToken: string; device: DeviceInfo };

interface AuthState {
  session: Session | null;
  staff: { token: string; staff: StaffInfo; at: number } | null;
  business: BusinessInfo | null;
  setUserSession: (s: { accessToken: string; refreshToken: string; user: PublicUser }) => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
  setDeviceSession: (deviceToken: string, device: DeviceInfo) => void;
  setStaff: (token: string, staff: StaffInfo) => void;
  clearStaff: () => void;
  setBusiness: (b: BusinessInfo) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      staff: null,
      business: null,
      setUserSession: (s) => set({ session: { kind: 'user', ...s }, staff: null }),
      updateTokens: (accessToken, refreshToken) =>
        set((st) => (st.session?.kind === 'user' ? { session: { ...st.session, accessToken, refreshToken } } : st)),
      setDeviceSession: (deviceToken, device) => set({ session: { kind: 'device', deviceToken, device }, staff: null }),
      setStaff: (token, staff) => set({ staff: { token, staff, at: Date.now() } }),
      clearStaff: () => set({ staff: null }),
      setBusiness: (business) => set({ business }),
      logout: () => set({ session: null, staff: null, business: null }),
    }),
    { name: 'rh.auth', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

/** Rol efectivo: usuario, o personal identificado con PIN en un dispositivo. */
export function useEffectiveRole(): Role | null {
  return useAuth((s) => (s.session?.kind === 'user' ? s.session.user.role : s.staff?.staff.role ?? null));
}

export function isManagerRole(r: Role | null | undefined) {
  return r === 'OWNER' || r === 'ADMIN';
}

export function getAuthHeader(): string | null {
  const s = useAuth.getState().session;
  if (!s) return null;
  return s.kind === 'user' ? `Bearer ${s.accessToken}` : `Device ${s.deviceToken}`;
}
