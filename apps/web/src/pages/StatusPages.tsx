import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth-store';
import { Button, EmptyState } from '@/ui';

export function NotFoundPage() {
  return (
    <EmptyState
      className="h-full"
      title="Página no encontrada"
      description="La dirección no existe o fue movida."
      action={<Link to="/" className="text-sm font-semibold text-brand">Ir al inicio</Link>}
    />
  );
}

export function NoAccessPage() {
  const logout = useAuth((s) => s.logout);
  return (
    <EmptyState
      className="h-full"
      title="Tu usuario no tiene un panel asignado"
      description="El personal de cocina y barra usa la tablet de su área con su PIN."
      action={<Button variant="outline" onClick={logout}>Cerrar sesión</Button>}
    />
  );
}

export function UnderConstruction({ title }: { title: string }) {
  return <EmptyState title={title} description="Esta sección se está construyendo." />;
}
