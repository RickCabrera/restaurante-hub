import type { Role } from '@rh/shared';

export interface UserActor {
  kind: 'user';
  userId: string;
  businessId: string;
  role: Role;
  name: string;
}

export interface StaffInfo {
  userId: string;
  name: string;
  role: Role;
}

/** purpose: "AREA" (tablet de requisiciones) | "KDS" (pantalla de cocina) | "POS" (caja/comandero) */
export type DevicePurpose = 'AREA' | 'KDS' | 'POS';

export interface DeviceActor {
  kind: 'device';
  deviceId: string;
  businessId: string;
  areaId: string | null;
  purpose: DevicePurpose;
  name: string;
  /** Persona identificada con PIN en la tablet (opcional) */
  staff?: StaffInfo;
}

export interface AgentActor {
  kind: 'agent';
  agentId: string;
  businessId: string;
  name: string;
  agentKind: string;
}

export type Actor = UserActor | DeviceActor | AgentActor;

/** Rol efectivo para autorización: rol del usuario o del personal identificado con PIN. */
export function effectiveRole(a: Actor): Role | null {
  if (a.kind === 'user') return a.role;
  if (a.kind === 'device') return a.staff?.role ?? null;
  return null;
}

export function actorName(a: Actor): string {
  if (a.kind === 'device') return a.staff ? `${a.staff.name} (${a.name})` : a.name;
  return a.name;
}

export function actorUserId(a: Actor): string | null {
  if (a.kind === 'user') return a.userId;
  if (a.kind === 'device') return a.staff?.userId ?? null;
  return null;
}

export function isManager(a: Actor): boolean {
  const r = effectiveRole(a);
  return r === 'OWNER' || r === 'ADMIN';
}
