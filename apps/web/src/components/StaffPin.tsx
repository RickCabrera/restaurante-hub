import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { Role } from '@rh/shared';
import { api } from '@/lib/api';
import { useAuth, type StaffInfo } from '@/lib/auth-store';
import { Avatar, NumberPad, PageLoader, toast } from '@/ui';
import { sounds, vibrate } from '@/lib/sound';

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Dueña', ADMIN: 'Administrador', AREA_LEAD: 'Encargado', STAFF: 'Personal', CASHIER: 'Caja', WAITER: 'Mesero', DRIVER: 'Repartidor',
};
export const roleLabel = (r: Role) => ROLE_LABEL[r] ?? r;

/**
 * Pantalla "¿Quién eres?" + PIN de 4 dígitos para tablets (requisiciones / POS).
 * Al validar guarda el staffToken (se manda como X-Staff-Token en cada petición).
 */
export function StaffPin({ onDone, roles, title = '¿Quién eres?', onCancel }: { onDone?: (s: StaffInfo) => void; roles?: Role[]; title?: string; onCancel?: () => void }) {
  const staffQ = useQuery({ queryKey: ['device-staff'], queryFn: () => api.get<StaffInfo[]>('/auth/device/staff') });
  const [sel, setSel] = useState<StaffInfo | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const setStaff = useAuth((s) => s.setStaff);

  useEffect(() => {
    if (pin.length !== 4 || !sel || busy) return;
    setBusy(true);
    api
      .post<{ staffToken: string; staff: StaffInfo }>('/auth/device/pin', { userId: sel.id, pin })
      .then((r) => {
        sounds.success();
        setStaff(r.staffToken, r.staff);
        onDone?.(r.staff);
      })
      .catch((e) => {
        sounds.error();
        vibrate([60, 40, 60]);
        toast.fromError(e);
        setPin('');
      })
      .finally(() => setBusy(false));
  }, [pin, sel, busy, setStaff, onDone]);

  if (staffQ.isLoading) return <PageLoader />;
  const people = (staffQ.data ?? []).filter((p) => !roles || p.role === 'OWNER' || roles.includes(p.role));

  if (!sel) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <div className="mb-6 flex items-center gap-3">
          {onCancel && (
            <button onClick={onCancel} className="grid h-11 w-11 place-items-center rounded-xl bg-surface-sunken" aria-label="Volver">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <h2 className="h-display text-3xl font-bold">{title}</h2>
        </div>
        {people.length === 0 ? (
          <p className="text-ink-mute">No hay personal con PIN asignado. La dueña puede asignarlo en Equipo y tablets.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {people.map((p) => (
              <button
                key={p.id}
                onClick={() => setSel(p)}
                className="card flex flex-col items-center gap-3 p-5 transition active:scale-95 hover:border-brand"
              >
                <Avatar name={p.name} color={p.avatarColor} size={72} />
                <span className="text-center font-semibold leading-tight">{p.name}</span>
                <span className="text-xs text-ink-mute">{roleLabel(p.role)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center p-6">
      <button onClick={() => { setSel(null); setPin(''); }} className="mb-4 flex items-center gap-1 self-start text-sm text-ink-mute">
        <ArrowLeft className="h-4 w-4" /> Cambiar persona
      </button>
      <Avatar name={sel.name} color={sel.avatarColor} size={80} />
      <p className="mt-3 text-xl font-semibold">{sel.name}</p>
      <p className="mb-6 text-sm text-ink-mute">Escribe tu PIN</p>
      <div className="mb-6 flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className={`h-5 w-5 rounded-full border-2 ${i < pin.length ? 'border-brand bg-brand' : 'border-line'}`} />
        ))}
      </div>
      <NumberPad className="w-full" onKey={(k) => (k === 'back' ? setPin((p) => p.slice(0, -1)) : setPin((p) => (p.length < 4 ? p + k : p)))} />
    </div>
  );
}
