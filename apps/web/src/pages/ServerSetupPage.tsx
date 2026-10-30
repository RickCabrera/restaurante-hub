import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { getApiBase, setApiBase } from '@/lib/config';
import { disconnectSocket } from '@/lib/socket';
import { Button, Input, toast } from '@/ui';
import { AuthShell } from './AuthShell';

/** Para la app de Android/escritorio: dirección del servidor (Railway). Vacío = mismo origen. */
export function ServerSetupPage() {
  const [url, setUrl] = useState(getApiBase());
  const [testing, setTesting] = useState(false);
  const [ok, setOk] = useState<boolean | null>(null);
  const navigate = useNavigate();

  const test = async (u: string) => {
    setTesting(true);
    setOk(null);
    try {
      const res = await fetch(`${u.replace(/\/$/, '')}/api/health`);
      const data = await res.json();
      setOk(res.ok && data.status);
      return res.ok;
    } catch {
      setOk(false);
      return false;
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    const u = url.trim();
    if (u && !(await test(u))) return toast.error('No se pudo conectar con ese servidor');
    setApiBase(u || null);
    disconnectSocket();
    toast.success('Servidor guardado');
    navigate('/login');
  };

  return (
    <AuthShell title="Conectar servidor" subtitle="Dirección donde está instalado el sistema, por ejemplo https://mirestaurante.up.railway.app">
      <div className="space-y-4">
        <Input label="URL del servidor" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="off" />
        {ok === true && (
          <p className="flex items-center gap-2 text-sm text-ok">
            <CheckCircle2 className="h-4 w-4" /> Conexión correcta
          </p>
        )}
        {ok === false && <p className="text-sm text-danger">No responde. Revisa la dirección y tu conexión.</p>}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => test(url)} loading={testing} disabled={!url}>
            Probar
          </Button>
          <Button className="flex-1" onClick={save}>
            Guardar
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
