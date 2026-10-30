import { useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmOpts {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** pide un texto (motivo) obligatorio */
  input?: { label: string; placeholder?: string; required?: boolean };
}
interface State { opts: ConfirmOpts | null; resolve?: (v: string | false) => void }
const useConfirmStore = create<State>(() => ({ opts: null }));

/** const reason = await confirm({ title, input:{label:'Motivo'} }) → string | false */
export function confirm(opts: ConfirmOpts): Promise<string | false> {
  return new Promise((resolve) => useConfirmStore.setState({ opts, resolve }));
}

export function ConfirmHost() {
  const { opts, resolve } = useConfirmStore();
  const [value, setValue] = useState('');
  if (!opts) return null;
  const close = (v: string | false) => {
    resolve?.(v);
    setValue('');
    useConfirmStore.setState({ opts: null, resolve: undefined });
  };
  const disabled = !!opts.input?.required && !value.trim();
  return (
    <Modal
      open
      size="sm"
      onClose={() => close(false)}
      title={opts.title}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>{opts.cancelText ?? 'Cancelar'}</Button>
          <Button variant={opts.danger ? 'danger' : 'primary'} disabled={disabled} onClick={() => close(value || 'ok')}>
            {opts.confirmText ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      {opts.description && <div className="text-sm text-ink-soft">{opts.description}</div>}
      {opts.input && (
        <label className="mt-3 block">
          <span className="label">{opts.input.label}</span>
          <textarea autoFocus className="input h-auto py-2" rows={2} placeholder={opts.input.placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
      )}
    </Modal>
  );
}
