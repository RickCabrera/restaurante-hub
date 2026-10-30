import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { KeyRound, Lock, MoreVertical, Pencil, Plus, Power, Search } from 'lucide-react';
import type { Role } from '@rh/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { timeAgo } from '@/lib/format';
import { roleLabel } from '@/components/StaffPin';
import { Avatar, Badge, Button, confirm, EmptyState, ErrorState, Input, Modal, NumberPad, Select, Skeleton, toast } from '@/ui';
import { useAreas } from '@/features/common-req/hooks';
import { AreaIcon } from '@/features/common-req/meta';
import type { StaffUser } from '@/features/common-req/types';

const LOGIN_ROLES: Role[] = ['OWNER', 'ADMIN', 'CASHIER', 'WAITER', 'DRIVER'];
const PIN_ROLES: Role[] = ['AREA_LEAD', 'STAFF', 'CASHIER', 'WAITER', 'OWNER', 'ADMIN'];
const ROLE_ORDER: Role[] = ['OWNER', 'ADMIN', 'AREA_LEAD', 'STAFF', 'CASHIER', 'WAITER', 'DRIVER'];
const ROLE_TONE: Record<Role, 'brand' | 'info' | 'ok' | 'warn' | 'neutral'> = { OWNER: 'brand', ADMIN: 'brand', AREA_LEAD: 'info', STAFF: 'neutral', CASHIER: 'ok', WAITER: 'ok', DRIVER: 'warn' };
const COLORS = ['#E85D04', '#E76F51', '#F4A261', '#E9C46A', '#2A9D8F', '#264653', '#7B2CBF', '#0077B6', '#D6336C', '#6D4C41'];

export function StaffTab() {
  const qc = useQueryClient();
  const me = useAuth((s) => (s.session?.kind === 'user' ? s.session.user : null));
  const [f, setF] = useState({ q: '', role: '', active: 'true' });
  const q = useQuery({ queryKey: ['users', f.role, f.active], queryFn: () => api.get<StaffUser[]>('/users', { role: f.role || undefined, active: f.active || undefined }) });
  const areas = useAreas();
  const [edit, setEdit] = useState<StaffUser | 'new' | null>(null);
  const [pinFor, setPinFor] = useState<StaffUser | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['users'] });
  const areaMap = new Map((areas.data ?? []).map((a) => [a.id, a]));

  const list = (q.data ?? [])
    .filter((u) => !f.q || u.name.toLowerCase().includes(f.q.toLowerCase()))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));

  const resetPassword = async (u: StaffUser) => {
    setMenu(null);
    const pw = await confirm({ title: `Nueva contraseña para ${u.name}`, description: 'Mínimo 8 caracteres. Compártela en persona.', input: { label: 'Contraseña', required: true }, confirmText: 'Guardar' });
    if (!pw) return;
    try {
      await api.post(`/users/${u.id}/reset-password`, { password: pw });
      toast.success('Contraseña actualizada');
    } catch (e) {
      toast.fromError(e);
    }
  };
  const toggleActive = async (u: StaffUser) => {
    setMenu(null);
    if (u.active && !(await confirm({ title: `¿Desactivar a ${u.name}?`, description: 'Ya no podrá entrar ni usar su PIN.', danger: true, confirmText: 'Desactivar' }))) return;
    try {
      await api.post(`/users/${u.id}/${u.active ? 'deactivate' : 'activate'}`);
      refresh();
      toast.success(u.active ? 'Desactivado' : 'Activado');
    } catch (e) {
      toast.fromError(e);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input className="input pl-9" placeholder="Buscar persona" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        </label>
        <Select className="w-48" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Todos los roles" options={ROLE_ORDER.map((r) => ({ value: r, label: roleLabel(r) }))} aria-label="Rol" />
        <Select className="w-32" value={f.active} onChange={(e) => setF({ ...f, active: e.target.value })} options={[{ value: 'true', label: 'Activos' }, { value: 'false', label: 'Inactivos' }, { value: '', label: 'Todos' }]} aria-label="Estado" />
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit('new')}>Persona</Button>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="Sin personas" />
      ) : (
        <div className="card divide-y divide-line">
          {list.map((u) => (
            <div key={u.id} className={clsx('relative flex items-center gap-3 px-4 py-3', !u.active && 'opacity-50')}>
              <Avatar name={u.name} color={u.avatarColor} size={42} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {u.name}
                  <Badge tone={ROLE_TONE[u.role]}>{roleLabel(u.role)}</Badge>
                  {u.id === me?.id && <span className="text-xs text-ink-mute">(tú)</span>}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-mute">
                  {(u.email || u.phone) && <span>{u.email ?? u.phone}</span>}
                  {u.hasPin && <span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" /> PIN</span>}
                  {u.hasPassword && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Contraseña</span>}
                  {u.lastLoginAt && <span>Entró {timeAgo(u.lastLoginAt)}</span>}
                  {u.areaIds.map((id) => {
                    const a = areaMap.get(id);
                    return a ? (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full px-1.5 text-[11px] font-semibold text-white" style={{ background: a.color }}>
                        <AreaIcon icon={a.icon} className="h-3 w-3" />
                        {a.name}
                      </span>
                    ) : null;
                  })}
                </p>
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken" onClick={() => setEdit(u)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
              <button className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken" onClick={() => setMenu(menu === u.id ? null : u.id)} aria-label="Más opciones"><MoreVertical className="h-4 w-4" /></button>
              {menu === u.id && (
                <div className="absolute right-4 top-12 z-10 w-48 overflow-hidden rounded-xl border border-line bg-surface-raised shadow-lift animate-slide-up">
                  <button className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-surface-sunken" onClick={() => { setMenu(null); setPinFor(u); }}><KeyRound className="h-4 w-4" /> {u.hasPin ? 'Cambiar PIN' : 'Asignar PIN'}</button>
                  {LOGIN_ROLES.includes(u.role) && <button className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-surface-sunken" onClick={() => resetPassword(u)}><Lock className="h-4 w-4" /> Nueva contraseña</button>}
                  {u.id !== me?.id && <button className={clsx('flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-surface-sunken', u.active && 'text-danger')} onClick={() => toggleActive(u)}><Power className="h-4 w-4" /> {u.active ? 'Desactivar' : 'Activar'}</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <UserModal value={edit} onClose={() => setEdit(null)} onSaved={refresh} />
      <PinModal user={pinFor} onClose={() => setPinFor(null)} onSaved={refresh} />
    </div>
  );
}

function UserModal({ value, onClose, onSaved }: { value: StaffUser | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const areas = useAreas();
  const meRole = useAuth((s) => (s.session?.kind === 'user' ? s.session.user.role : null));
  const isNew = value === 'new';
  const [f, setF] = useState({ name: '', role: 'STAFF' as Role, email: '', phone: '', password: '', pin: '', areaIds: [] as string[], avatarColor: COLORS[0] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setErrors({});
    if (value && value !== 'new') setF({ name: value.name, role: value.role, email: value.email ?? '', phone: value.phone ?? '', password: '', pin: '', areaIds: value.areaIds, avatarColor: value.avatarColor });
    else setF({ name: '', role: 'STAFF', email: '', phone: '', password: '', pin: '', areaIds: [], avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)] });
  }, [value]);
  const usesLogin = LOGIN_ROLES.includes(f.role);
  const usesPin = PIN_ROLES.includes(f.role);
  const roles = ROLE_ORDER.filter((r) => meRole === 'OWNER' || (r !== 'OWNER' && r !== 'ADMIN'));

  const save = async () => {
    setBusy(true);
    const base = {
      name: f.name.trim(),
      role: f.role,
      email: usesLogin && f.email.trim() ? f.email.trim() : null,
      phone: f.phone.replace(/[\s-]/g, '') || null,
      areaIds: f.areaIds,
      avatarColor: f.avatarColor,
    };
    try {
      if (isNew) {
        await api.post('/users', { ...base, password: usesLogin && f.password ? f.password : undefined, pin: usesPin && f.pin ? f.pin : undefined });
      } else if (value) {
        await api.patch(`/users/${value.id}`, base);
      }
      onSaved();
      onClose();
      toast.success('Guardado');
    } catch (e) {
      setErrors((e as { fieldErrors?: Record<string, string> }).fieldErrors ?? {});
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!value} onClose={onClose} size="lg" title={isNew ? 'Nueva persona' : 'Editar persona'} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!f.name.trim()} onClick={save}>Guardar</Button></>}>
      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <Avatar name={f.name || '?'} color={f.avatarColor} size={52} />
          <Input className="flex-1" label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errors.name} autoFocus />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setF({ ...f, avatarColor: c })} className={clsx('h-7 w-7 rounded-full transition', f.avatarColor === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface-raised')} style={{ background: c }} aria-label={c} />
          ))}
        </div>
        <Select label="Rol" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} options={roles.map((r) => ({ value: r, label: roleLabel(r) }))} />
        {usesLogin && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Correo" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errors.email} />
            <Input label="Teléfono" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={errors.phone} />
            {isNew && <Input label="Contraseña" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={errors.password} hint="Mínimo 8 caracteres" />}
          </div>
        )}
        {isNew && usesPin && (
          <Input label="PIN de 4 dígitos (tablets)" inputMode="numeric" maxLength={4} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} error={errors.pin} hint="Lo usa para identificarse en la tablet" />
        )}
        <div>
          <span className="label">Áreas</span>
          <div className="flex flex-wrap gap-2">
            {(areas.data ?? []).map((a) => {
              const on = f.areaIds.includes(a.id);
              return (
                <button key={a.id} type="button" onClick={() => setF({ ...f, areaIds: on ? f.areaIds.filter((x) => x !== a.id) : [...f.areaIds, a.id] })} className={clsx('flex h-10 items-center gap-2 rounded-full border-2 px-3 text-sm font-semibold', on ? 'text-white' : 'border-line text-ink-soft')} style={on ? { background: a.color, borderColor: a.color } : undefined}>
                  <AreaIcon icon={a.icon} className="h-4 w-4" /> {a.name}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-ink-mute">Aparece en la pantalla “¿Quién pide?” de esas tablets.</p>
        </div>
      </div>
    </Modal>
  );
}

function PinModal({ user, onClose, onSaved }: { user: StaffUser | null; onClose: () => void; onSaved: () => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setPin(''), [user]);
  const save = async (value: string | null) => {
    if (!user) return;
    setBusy(true);
    try {
      await api.post(`/users/${user.id}/pin`, { pin: value });
      toast.success(value ? 'PIN guardado' : 'PIN eliminado');
      onSaved();
      onClose();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!user} onClose={onClose} size="sm" title={`PIN de ${user?.name ?? ''}`}>
      <div className="mb-5 flex justify-center gap-4">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="grid h-14 w-12 place-items-center rounded-xl border-2 border-line bg-surface-sunken font-display text-2xl font-bold">{pin[i] ?? ''}</span>
        ))}
      </div>
      <NumberPad onKey={(k) => setPin((p) => (k === 'back' ? p.slice(0, -1) : p.length < 4 ? p + k : p))} />
      <div className="mt-4 flex gap-2">
        {user?.hasPin && <Button variant="ghost" className="text-danger" disabled={busy} onClick={() => save(null)}>Quitar PIN</Button>}
        <Button className="flex-1" size="lg" loading={busy} disabled={pin.length !== 4} onClick={() => save(pin)}>Guardar PIN</Button>
      </div>
    </Modal>
  );
}
