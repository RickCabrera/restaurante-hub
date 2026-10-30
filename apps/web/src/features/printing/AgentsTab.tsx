import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Copy, Cpu, KeyRound, Laptop, Plus, Smartphone, Trash2 } from 'lucide-react';
import { RT } from '@rh/shared';
import { api } from '@/lib/api';
import { useRealtime } from '@/lib/socket';
import { timeAgo } from '@/lib/format';
import { Badge, Button, EmptyState, ErrorState, Input, Modal, Skeleton, confirm, toast } from '@/ui';
import { KIND_LABEL, useAgents, type Agent, type AgentCredentials } from './api';

const KIND_ICON = { agent: Cpu, desktop: Laptop, android: Smartphone } as const;
const KIND_HELP: Record<Agent['kind'], string> = {
  desktop: 'Una PC con Windows en caja o cocina. Imprime en red, USB/Windows y COM.',
  agent: 'Raspberry Pi o PC que se queda encendida como servicio, sin pantalla.',
  android: 'Tablet o celular Android que imprime por Bluetooth.',
};

export function AgentsTab() {
  const q = useAgents();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [creds, setCreds] = useState<AgentCredentials | null>(null);
  useRealtime(RT.AGENT_STATUS, (p: { id: string; online: boolean; created?: boolean; revoked?: boolean }) => {
    if (p?.created || p?.revoked) return void qc.invalidateQueries({ queryKey: ['printing', 'agents'] });
    qc.setQueryData<Agent[]>(['printing', 'agents'], (old) => old?.map((a) => (a.id === p.id ? { ...a, ...p, lastSeenAt: new Date().toISOString() } : a)));
    void qc.invalidateQueries({ queryKey: ['printing', 'printers'] });
  });

  const rotate = async (a: Agent) => {
    if (!(await confirm({ title: `¿Generar un token nuevo para “${a.name}”?`, description: 'El token anterior deja de funcionar: tendrás que pegarlo de nuevo en esa computadora.', confirmText: 'Generar token' }))) return;
    try {
      setCreds(await api.post<AgentCredentials>(`/printing/agents/${a.id}/rotate-token`));
      void qc.invalidateQueries({ queryKey: ['printing'] });
    } catch (e) {
      toast.fromError(e);
    }
  };
  const revoke = async (a: Agent) => {
    if (!(await confirm({ title: `¿Revocar “${a.name}”?`, description: 'Deja de imprimir y sus impresoras quedan sin agente.', danger: true, confirmText: 'Revocar' }))) return;
    try {
      await api.del(`/printing/agents/${a.id}`);
      toast.success('Agente revocado');
      void qc.invalidateQueries({ queryKey: ['printing'] });
    } catch (e) {
      toast.fromError(e);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-ink-mute">Un agente es la computadora (o app) del restaurante que recibe los trabajos y los manda a la impresora. Las conexiones son salientes: no hay que abrir puertos.</p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Nuevo agente</Button>
      </div>
      {q.isLoading ? <Skeleton className="h-32" /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <div className="card"><EmptyState icon={<Cpu className="h-7 w-7" />} title="Sin agentes" description="Crea uno para imprimir en impresoras de red, USB o Windows." action={<Button onClick={() => setCreating(true)}>Crear agente</Button>} /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data.map((a) => {
            const Icon = KIND_ICON[a.kind] ?? Cpu;
            return (
              <article key={a.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-sunken text-ink-soft">
                    <Icon className="h-5 w-5" />
                    <span className={clsx('absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-surface-raised', a.online ? 'bg-ok' : 'bg-ink-mute')} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{a.name}</h3>
                    <p className="text-xs text-ink-mute">{KIND_LABEL[a.kind]}</p>
                  </div>
                  <Badge tone={a.online ? 'ok' : 'neutral'}>{a.online ? 'En línea' : a.lastSeenAt ? `Visto ${timeAgo(a.lastSeenAt)}` : 'Nunca conectado'}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-ink-mute">Equipo</dt><dd className="truncate">{a.hostname ?? '—'}{a.platform ? ` · ${a.platform}` : ''}</dd>
                  <dt className="text-ink-mute">Versión</dt><dd>{a.version ?? '—'}</dd>
                  <dt className="text-ink-mute">Detectadas</dt><dd>{a.discovered.length} impresora(s)</dd>
                  <dt className="text-ink-mute">Atiende</dt><dd className="truncate">{a.printers.length ? a.printers.map((p) => p.name).join(', ') : 'Ninguna'}</dd>
                </dl>
                {a.discovered.length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer font-semibold text-brand">Ver impresoras detectadas</summary>
                    <ul className="mt-1 space-y-0.5 text-ink-soft">{a.discovered.map((d, i) => <li key={i}>{d.name} <span className="text-ink-mute">({d.type}{d.path ? ` · ${d.path}` : ''})</span></li>)}</ul>
                  </details>
                )}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" icon={<KeyRound className="h-4 w-4" />} onClick={() => rotate(a)}>Nuevo token</Button>
                  <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => revoke(a)}>Revocar</Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <CreateAgent open={creating} onClose={() => setCreating(false)} onCreated={(c) => { setCreds(c); void qc.invalidateQueries({ queryKey: ['printing'] }); }} />
      <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
    </div>
  );
}

function CreateAgent({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: AgentCredentials) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Agent['kind']>('desktop');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await api.post<AgentCredentials>('/printing/agents', { name: name.trim(), kind });
      setName('');
      onClose();
      onCreated(c);
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Nuevo agente de impresión" footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!name.trim()} onClick={submit}>Crear y ver token</Button></>}>
      <Input label="Nombre" autoFocus placeholder="Ej. PC de caja" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <span className="label mt-4">¿Dónde se va a instalar?</span>
      <div className="space-y-2">
        {(['desktop', 'agent', 'android'] as const).map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button key={k} type="button" onClick={() => setKind(k)} className={clsx('flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left', kind === k ? 'border-brand bg-brand/10' : 'border-line')}>
              <Icon className="h-6 w-6 shrink-0 text-ink-soft" />
              <span><span className="block text-sm font-semibold">{KIND_LABEL[k]}</span><span className="block text-xs text-ink-mute">{KIND_HELP[k]}</span></span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function CopyBox({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copiado');
    } catch {
      toast.error('No se pudo copiar; selecciónalo y cópialo a mano');
    }
  };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label mb-0">{label}</span>
        <Button size="sm" variant="outline" icon={<Copy className="h-4 w-4" />} onClick={copy}>Copiar</Button>
      </div>
      <pre className={clsx('max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface-sunken p-3 text-xs', mono && 'font-mono')}>{value}</pre>
    </div>
  );
}

function CredentialsModal({ creds, onClose }: { creds: AgentCredentials | null; onClose: () => void }) {
  if (!creds) return null;
  const kind = creds.agent.kind;
  const steps: Record<Agent['kind'], React.ReactNode[]> = {
    desktop: [
      <>Descarga e instala <b>RestauranteHub-Setup.exe</b> en la PC (si Windows advierte, “Más información → Ejecutar de todas formas”).</>,
      <>Al abrirla por primera vez pide la <b>dirección del sistema</b>: <code className="rounded bg-surface-sunken px-1">{creds.apiUrl}</code></>,
      <>Pega el <b>código de emparejamiento</b> de abajo en “Token del agente de impresión”. Para cambiarlo después: ícono junto al reloj → Configuración.</>,
      <>Deja la app abierta (se queda en la bandeja). Aquí verás el punto verde “En línea”.</>,
    ],
    agent: [
      <>En la Raspberry o PC: <code className="rounded bg-surface-sunken px-1">sudo bash apps/print-agent/deploy/install-raspberry.sh {creds.apiUrl} TOKEN</code></>,
      <>O con Node: <code className="rounded bg-surface-sunken px-1">npx rh-print-agent setup</code> y pega la URL y el token.</>,
      <>También puedes guardar la <b>configuración</b> de abajo en el archivo <code className="rounded bg-surface-sunken px-1">.env</code> del agente.</>,
      <>Usa <code className="rounded bg-surface-sunken px-1">rh-print-agent discover</code> para ver impresoras USB/COM y <code className="rounded bg-surface-sunken px-1">rh-print-agent test --host IP</code> para probar.</>,
    ],
    android: [
      <>Instala <b>RestauranteHub.apk</b> en la tablet y escribe la dirección del sistema: <code className="rounded bg-surface-sunken px-1">{creds.apiUrl}</code></>,
      <>Pega el <b>código de emparejamiento</b> de abajo cuando la app lo pida.</>,
      <>Enlaza la impresora en Ajustes → Bluetooth y elígela en Impresoras → Este dispositivo.</>,
    ],
  };
  return (
    <Modal open onClose={onClose} size="lg" title={`Token de “${creds.agent.name}”`} footer={<Button onClick={onClose}>Ya lo guardé</Button>}>
      <p className="mb-4 rounded-xl bg-warn/10 px-3 py-2 text-sm font-medium text-warn">Este token solo se muestra una vez. Cópialo ahora; si lo pierdes, genera uno nuevo.</p>
      <ol className="mb-5 space-y-2 text-sm">
        {steps[kind].map((s, i) => (
          <li key={i} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span><span className="pt-0.5">{s}</span></li>
        ))}
      </ol>
      <div className="space-y-4">
        <CopyBox label={kind === 'agent' ? 'Código de emparejamiento (opcional)' : 'Código de emparejamiento'} value={creds.pairingString} />
        <CopyBox label="Configuración (.env del agente)" value={creds.configString} />
      </div>
      <p className="mt-3 text-xs text-ink-mute">Guía completa: docs/IMPRESION.md y docs/APPS.md.</p>
    </Modal>
  );
}
