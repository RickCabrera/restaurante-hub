import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, type DeviceInfo } from '@/lib/auth-store';
import { homePathFor } from '@/app/session';
import { Button, NumberPad, toast } from '@/ui';
import { AuthShell } from './AuthShell';

function detectPlatform(): 'web' | 'android' | 'ios' | 'desktop' {
  const w = window as unknown as { rhDesktop?: unknown; Capacitor?: { getPlatform?: () => string } };
  if (w.rhDesktop) return 'desktop';
  const p = w.Capacitor?.getPlatform?.();
  if (p === 'android' || p === 'ios') return p;
  return 'web';
}

/** La dueña genera el código en Equipo y tablets → "Emparejar tablet". */
export function PairDevicePage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const setDeviceSession = useAuth((s) => s.setDeviceSession);
  const navigate = useNavigate();

  const press = (k: string) => {
    if (k === 'back') return setCode((c) => c.slice(0, -1));
    setCode((c) => (c.length < 6 ? c + k : c));
  };

  const pair = async () => {
    setLoading(true);
    try {
      const r = await api.post<{ deviceToken: string; device: DeviceInfo }>('/auth/pair', { code, platform: detectPlatform() }, { anonymous: true });
      setDeviceSession(r.deviceToken, r.device);
      const me = await api.get('/auth/me');
      useAuth.getState().setBusiness(me.business);
      toast.success('Tablet configurada', r.device.area ? `Área: ${r.device.area.name}` : r.device.name);
      navigate(homePathFor(), { replace: true });
    } catch (e) {
      toast.fromError(e);
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Configurar tablet" subtitle="Escribe el código de 6 dígitos que aparece en el panel de la dueña (Equipo y tablets → Emparejar).">
      <div className="mb-5 flex justify-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="grid h-14 w-11 place-items-center rounded-xl border-2 border-line bg-surface-sunken font-display text-2xl font-bold">
            {code[i] ?? ''}
          </div>
        ))}
      </div>
      <NumberPad onKey={press} />
      <Button size="xl" block className="mt-5" disabled={code.length !== 6} loading={loading} onClick={pair}>
        Emparejar
      </Button>
      <Link to="/login" className="mt-4 flex items-center justify-center gap-1 text-sm text-ink-mute">
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>
    </AuthShell>
  );
}
