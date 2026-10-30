import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Tablet, Server } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, type PublicUser } from '@/lib/auth-store';
import { getBusinessSlug } from '@/lib/config';
import { homePathFor } from '@/app/session';
import { Button, Input, toast } from '@/ui';
import { AuthShell } from './AuthShell';

export function LoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setUserSession = useAuth((s) => s.setUserSession);
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<{ accessToken: string; refreshToken: string; user: PublicUser }>(
        '/auth/login',
        { login, password, business: getBusinessSlug() },
        { anonymous: true },
      );
      setUserSession(r);
      const me = await api.get('/auth/me');
      useAuth.getState().setBusiness(me.business);
      toast.success(`¡Hola, ${r.user.name.split(' ')[0]}!`);
      navigate(homePathFor(), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Iniciar sesión" subtitle="Panel de la dueña, caja y repartidores">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Correo o teléfono" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus />
        <Input label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" block loading={loading}>
          Entrar
        </Button>
      </form>
      <div className="mt-6 grid gap-2 border-t border-line pt-5">
        <Link to="/emparejar" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-sunken">
          <Tablet className="h-5 w-5 text-brand" />
          Configurar esta tablet (cocina, barra, caja o pantalla)
        </Link>
        <Link to="/servidor" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface-sunken">
          <Server className="h-5 w-5 text-ink-mute" />
          Cambiar servidor
        </Link>
      </div>
    </AuthShell>
  );
}
