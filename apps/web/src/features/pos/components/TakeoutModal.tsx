import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ShoppingBag, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Modal, toast } from '@/ui';
import { useSetTicket, type Ticket } from '../api';

/** Nueva cuenta para llevar / mostrador con nombre del cliente. */
export function TakeoutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<'PARA_LLEVAR' | 'MOSTRADOR'>('PARA_LLEVAR');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const setTicket = useSetTicket();

  const create = async () => {
    setBusy(true);
    try {
      const t = await api.post<Ticket>('/pos/tickets', { serviceType: type, label: label.trim() || undefined, guests: 1 });
      setTicket(t);
      onClose();
      setLabel('');
      navigate(`/pos/cuenta/${t.id}`);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  const opt = (v: typeof type, icon: React.ReactNode, title: string, desc: string) => (
    <button
      onClick={() => setType(v)}
      className={clsx(
        'flex flex-1 flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition active:scale-[0.98]',
        type === v ? 'border-brand bg-brand/10' : 'border-line bg-surface-raised',
      )}
    >
      <span className={clsx('grid h-10 w-10 place-items-center rounded-xl', type === v ? 'bg-brand text-white' : 'bg-surface-sunken text-ink-soft')}>{icon}</span>
      <span className="font-semibold">{title}</span>
      <span className="text-xs text-ink-mute">{desc}</span>
    </button>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva cuenta sin mesa"
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
          <Button size="lg" loading={busy} onClick={create}>Abrir cuenta</Button>
        </>
      }
    >
      <div className="flex gap-3">
        {opt('PARA_LLEVAR', <ShoppingBag className="h-5 w-5" />, 'Para llevar', 'El cliente se lo lleva')}
        {opt('MOSTRADOR', <Store className="h-5 w-5" />, 'Mostrador', 'Consume en barra o mostrador')}
      </div>
      <Input
        className="mt-4"
        label="Nombre del cliente (opcional)"
        placeholder="Ej. Juan"
        value={label}
        maxLength={40}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && create()}
      />
    </Modal>
  );
}
