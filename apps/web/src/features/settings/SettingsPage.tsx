import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Bell, BellOff, Building2, ClipboardList, Gift, ImageUp, Layers, MessageCircle, Receipt, Save, Send, ShoppingBag, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { assetUrl } from '@/lib/config';
import { applyBrand, readableOn } from '@/lib/theme';
import type { MeResponse } from '@/app/session';
import { Button, ErrorState, Input, PageHeader, PageLoader, Select, Tabs, Textarea, Toggle, toast } from '@/ui';
import { AuditTab } from './AuditTab';

interface BusinessSettings {
  modules: { requisitions?: boolean; delivery?: boolean; pos?: boolean };
  requirePin?: boolean;
  groupWindowMinutes?: number;
  urgentEscalationMinutes?: number;
  quietHours?: { from: string; to: string } | null;
  transferInfo?: string | null;
  privacyNoticeUrl?: string | null;
  ticketFooter?: string | null;
  tips?: number[];
  dailySummaryHour?: number | null;
  ownerWhatsapp?: string | null;
  notifyOwnerByWhatsapp?: boolean;
  loyalty?: { enabled: boolean; everyOrders: number; discountType: 'PERCENT' | 'AMOUNT'; value: number } | null;
  bot?: { greeting?: string; closedMessage?: string; handoffMessage?: string; goodbye?: string; allowScheduledWhenClosed?: boolean };
}
interface BusinessResp {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  timezone: string;
  phone: string | null;
  address: string | null;
  settings: BusinessSettings;
}

const TIMEZONES = [
  ['America/Mexico_City', 'Centro (CDMX, Guadalajara, Monterrey)'],
  ['America/Cancun', 'Sureste (Quintana Roo)'],
  ['America/Merida', 'Mérida'],
  ['America/Chihuahua', 'Chihuahua'],
  ['America/Mazatlan', 'Pacífico (Sinaloa, Nayarit, BCS)'],
  ['America/Hermosillo', 'Sonora'],
  ['America/Tijuana', 'Noroeste (Baja California)'],
] as const;
const BRAND_SWATCHES = ['#E85D04', '#D62828', '#C2185B', '#7B2CBF', '#3A0CA3', '#0077B6', '#2A9D8F', '#2D6A4F', '#B08900', '#6D4C41', '#1D3557', '#212529'];

type Section = 'negocio' | 'modulos' | 'requisiciones' | 'notificaciones' | 'tickets' | 'bot' | 'fidelizacion' | 'bitacora';

function Card({ title, icon, children, description }: { title: string; icon: ReactNode; children: ReactNode; description?: string }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">{icon}</span>
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-ink-mute">{description}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const section = (params.get('s') as Section) || 'negocio';
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<BusinessResp>('/settings') });
  const [draft, setDraft] = useState<BusinessResp | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setDraft(structuredClone(q.data));
  }, [q.data]);

  const dirty = !!draft && !!q.data && JSON.stringify(draft) !== JSON.stringify(q.data);

  const save = async () => {
    if (!draft || !q.data) return;
    setBusy(true);
    try {
      const s = draft.settings;
      const res = await api.patch<BusinessResp>('/settings', {
        name: draft.name.trim(),
        logoUrl: draft.logoUrl,
        primaryColor: draft.primaryColor,
        accentColor: draft.accentColor,
        timezone: draft.timezone,
        phone: draft.phone?.trim() || null,
        address: draft.address?.trim() || null,
        settings: {
          modules: s.modules,
          requirePin: !!s.requirePin,
          groupWindowMinutes: Number(s.groupWindowMinutes ?? 0),
          urgentEscalationMinutes: Number(s.urgentEscalationMinutes ?? 10),
          quietHours: s.quietHours?.from && s.quietHours?.to ? s.quietHours : null,
          transferInfo: s.transferInfo?.trim() || null,
          privacyNoticeUrl: s.privacyNoticeUrl?.trim() || null,
          ticketFooter: s.ticketFooter?.trim() || null,
          tips: (s.tips ?? []).filter((t) => Number.isFinite(t) && t >= 0 && t <= 100).slice(0, 5),
          dailySummaryHour: s.dailySummaryHour ?? null,
          ownerWhatsapp: s.ownerWhatsapp?.replace(/[\s-]/g, '') || null,
          notifyOwnerByWhatsapp: !!s.notifyOwnerByWhatsapp,
          loyalty: s.loyalty ?? null,
          bot: s.bot,
        },
      });
      qc.setQueryData(['settings'], res);
      applyBrand(res.primaryColor);
      const me = await api.get<MeResponse>('/auth/me');
      useAuth.getState().setBusiness(me.business);
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Cambios guardados');
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  if (q.isLoading || !draft) return q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <PageLoader />;
  const s = draft.settings;
  const set = (patch: Partial<BusinessResp>) => setDraft({ ...draft, ...patch });
  const setS = (patch: Partial<BusinessSettings>) => setDraft({ ...draft, settings: { ...draft.settings, ...patch } });

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <PageHeader title="Configuración" subtitle={draft.name} />
      <Tabs
        className="mb-5"
        value={section}
        onChange={(v) => setParams({ s: v }, { replace: true })}
        items={[
          { value: 'negocio', label: 'Negocio' },
          { value: 'modulos', label: 'Módulos' },
          { value: 'requisiciones', label: 'Requisiciones' },
          { value: 'notificaciones', label: 'Notificaciones' },
          { value: 'tickets', label: 'Tickets y pagos' },
          { value: 'bot', label: 'Bot de WhatsApp' },
          { value: 'fidelizacion', label: 'Fidelización' },
          { value: 'bitacora', label: 'Bitácora' },
        ]}
      />

      {section === 'negocio' && <BusinessSection draft={draft} set={set} />}

      {section === 'modulos' && (
        <Card title="Módulos" icon={<Layers className="h-5 w-5" />} description="Activa solo lo que usas. Puedes cambiarlo cuando quieras.">
          {[
            { k: 'requisitions' as const, icon: ClipboardList, label: 'Requisiciones', desc: 'Las áreas piden insumos desde su tablet con íconos; tú apruebas y compras.' },
            { k: 'delivery' as const, icon: ShoppingBag, label: 'Delivery', desc: 'Pedidos por WhatsApp y menú web, repartidores y zonas de entrega.' },
            { k: 'pos' as const, icon: Receipt, label: 'Punto de venta', desc: 'Cuentas por mesa, comandero, cobro y corte de caja.' },
          ].map((m) => (
            <div key={m.k} className={clsx('flex items-start gap-4 rounded-2xl border-2 p-4 transition', s.modules?.[m.k] ? 'border-brand bg-brand-50' : 'border-line')}>
              <m.icon className={clsx('mt-0.5 h-7 w-7 shrink-0', s.modules?.[m.k] ? 'text-brand' : 'text-ink-mute')} />
              <div className="flex-1">
                <Toggle checked={!!s.modules?.[m.k]} onChange={(v) => setS({ modules: { ...s.modules, [m.k]: v } })} label={<span className="text-base font-semibold">{m.label}</span>} description={m.desc} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {section === 'requisiciones' && (
        <Card title="Requisiciones" icon={<ClipboardList className="h-5 w-5" />}>
          <Toggle checked={!!s.requirePin} onChange={(v) => setS({ requirePin: v })} label="PIN obligatorio en tablets" description="Cada persona se identifica con su PIN antes de pedir." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Agrupar pedidos del mismo área (minutos)" type="number" min={0} max={240} value={s.groupWindowMinutes ?? 0} onChange={(e) => setS({ groupWindowMinutes: Number(e.target.value) })} hint="Si piden dos veces en este tiempo y aún no lo ves, se juntan en uno. 0 = no agrupar." />
            <Input label="Re-avisar urgentes no vistas (minutos)" type="number" min={1} max={240} value={s.urgentEscalationMinutes ?? 10} onChange={(e) => setS({ urgentEscalationMinutes: Number(e.target.value) })} hint="Te vuelve a notificar y avisa al administrador." />
          </div>
          <p className="text-sm text-ink-mute">El horario límite para pedir se configura por área en Equipo y tablets → Áreas.</p>
        </Card>
      )}

      {section === 'notificaciones' && (
        <div className="space-y-5">
          <PushCard />
          <Card title="WhatsApp y horario de silencio" icon={<MessageCircle className="h-5 w-5" />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Tu WhatsApp" inputMode="tel" value={s.ownerWhatsapp ?? ''} onChange={(e) => setS({ ownerWhatsapp: e.target.value })} placeholder="5215512345678" />
              <div className="pt-7">
                <Toggle checked={!!s.notifyOwnerByWhatsapp} onChange={(v) => setS({ notifyOwnerByWhatsapp: v })} label="Avisarme por WhatsApp" description="Requisiciones nuevas y urgentes." />
              </div>
            </div>
            <Toggle checked={!!s.quietHours} onChange={(v) => setS({ quietHours: v ? { from: '23:00', to: '07:00' } : null })} label="Horario de silencio" description="No suenan notificaciones normales; las urgentes siempre pasan." />
            {s.quietHours && (
              <div className="flex items-center gap-3">
                <label className="flex-1"><span className="label">De</span><input type="time" className="input" value={s.quietHours.from} onChange={(e) => setS({ quietHours: { ...s.quietHours!, from: e.target.value } })} /></label>
                <label className="flex-1"><span className="label">A</span><input type="time" className="input" value={s.quietHours.to} onChange={(e) => setS({ quietHours: { ...s.quietHours!, to: e.target.value } })} /></label>
              </div>
            )}
            <Select
              label="Resumen diario"
              value={s.dailySummaryHour == null ? '' : String(s.dailySummaryHour)}
              onChange={(e) => setS({ dailySummaryHour: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="No enviar"
              options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))}
              hint="Te mandamos un resumen del día a esta hora."
            />
          </Card>
        </div>
      )}

      {section === 'tickets' && (
        <Card title="Tickets y pagos" icon={<Receipt className="h-5 w-5" />}>
          <Input label="Pie del ticket" value={s.ticketFooter ?? ''} maxLength={200} onChange={(e) => setS({ ticketFooter: e.target.value })} placeholder="¡Gracias por su preferencia!" />
          <Textarea label="Datos para transferencia" rows={3} maxLength={500} value={s.transferInfo ?? ''} onChange={(e) => setS({ transferInfo: e.target.value })} placeholder="Banco · CLABE · A nombre de…" />
          <div>
            <span className="label">Propinas sugeridas (%)</span>
            <div className="flex flex-wrap items-center gap-2">
              {(s.tips ?? []).map((t, i) => (
                <span key={i} className="flex items-center gap-1 rounded-full bg-surface-sunken py-1 pl-3 pr-1 font-semibold">
                  {t}%
                  <button className="grid h-6 w-6 place-items-center rounded-full hover:bg-line" onClick={() => setS({ tips: (s.tips ?? []).filter((_, j) => j !== i) })} aria-label={`Quitar ${t}%`}><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
              {(s.tips ?? []).length < 5 && <TipAdder onAdd={(n) => setS({ tips: [...(s.tips ?? []), n].sort((a, b) => a - b) })} />}
            </div>
          </div>
          <Input label="Aviso de privacidad (URL)" type="url" value={s.privacyNoticeUrl ?? ''} onChange={(e) => setS({ privacyNoticeUrl: e.target.value })} placeholder="https://…" hint="Requerido por la LFPDPPP si guardas datos de clientes." />
        </Card>
      )}

      {section === 'bot' && (
        <Card title="Bot de WhatsApp" icon={<MessageCircle className="h-5 w-5" />} description="Textos que manda el bot. Puedes usar {negocio} y {horario}.">
          <Textarea label="Saludo" rows={2} maxLength={500} value={s.bot?.greeting ?? ''} onChange={(e) => setS({ bot: { ...s.bot, greeting: e.target.value } })} />
          <Textarea label="Cuando está cerrado" rows={2} maxLength={500} value={s.bot?.closedMessage ?? ''} onChange={(e) => setS({ bot: { ...s.bot, closedMessage: e.target.value } })} />
          <Textarea label="Pasar con una persona" rows={2} maxLength={500} value={s.bot?.handoffMessage ?? ''} onChange={(e) => setS({ bot: { ...s.bot, handoffMessage: e.target.value } })} />
          <Textarea label="Despedida" rows={2} maxLength={500} value={s.bot?.goodbye ?? ''} onChange={(e) => setS({ bot: { ...s.bot, goodbye: e.target.value } })} />
          <Toggle checked={!!s.bot?.allowScheduledWhenClosed} onChange={(v) => setS({ bot: { ...s.bot, allowScheduledWhenClosed: v } })} label="Aceptar pedidos programados fuera de horario" />
        </Card>
      )}

      {section === 'fidelizacion' && (
        <Card title="Fidelización" icon={<Gift className="h-5 w-5" />} description="Premia a tus clientes frecuentes con un cupón automático.">
          <Toggle checked={!!s.loyalty?.enabled} onChange={(v) => setS({ loyalty: { everyOrders: 5, discountType: 'PERCENT', value: 10, ...s.loyalty, enabled: v } })} label="Activar" />
          {s.loyalty?.enabled && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Cada cuántos pedidos" type="number" min={1} value={s.loyalty.everyOrders} onChange={(e) => setS({ loyalty: { ...s.loyalty!, everyOrders: Math.max(1, Number(e.target.value)) } })} />
              <Select label="Tipo" value={s.loyalty.discountType} onChange={(e) => setS({ loyalty: { ...s.loyalty!, discountType: e.target.value as 'PERCENT' | 'AMOUNT' } })} options={[{ value: 'PERCENT', label: 'Porcentaje' }, { value: 'AMOUNT', label: 'Monto ($)' }]} />
              <Input
                label={s.loyalty.discountType === 'PERCENT' ? 'Descuento (%)' : 'Descuento ($)'}
                type="number"
                min={1}
                value={s.loyalty.discountType === 'AMOUNT' ? s.loyalty.value / 100 : s.loyalty.value}
                onChange={(e) => setS({ loyalty: { ...s.loyalty!, value: Math.max(1, Math.round(Number(e.target.value) * (s.loyalty!.discountType === 'AMOUNT' ? 100 : 1))) } })}
              />
            </div>
          )}
        </Card>
      )}

      {section === 'bitacora' && <AuditTab />}

      {dirty && section !== 'bitacora' && (
        <div className="fixed inset-x-0 bottom-[60px] z-30 border-t border-line bg-surface-raised/95 p-3 backdrop-blur animate-slide-up lg:bottom-0 lg:left-64">
          <div className="mx-auto flex max-w-4xl items-center justify-end gap-2">
            <span className="mr-auto text-sm text-ink-mute">Tienes cambios sin guardar</span>
            <Button variant="ghost" onClick={() => setDraft(structuredClone(q.data!))}>Descartar</Button>
            <Button loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>Guardar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TipAdder({ onAdd }: { onAdd: (n: number) => void }) {
  const [v, setV] = useState('');
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(v);
        if (n > 0 && n <= 100) {
          onAdd(n);
          setV('');
        }
      }}
    >
      <input className="input h-9 w-20" inputMode="numeric" placeholder="%" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} aria-label="Nueva propina" />
      <Button size="sm" variant="outline" type="submit">Agregar</Button>
    </form>
  );
}

function BusinessSection({ draft, set }: { draft: BusinessResp; set: (p: Partial<BusinessResp>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const upload = async (f?: File) => {
    if (!f) return;
    setUploading(true);
    try {
      const { url } = await api.upload(f, 'logos');
      set({ logoUrl: url });
    } catch (e) {
      toast.fromError(e);
    } finally {
      setUploading(false);
    }
  };
  const fg = readableOn(draft.primaryColor);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <Card title="Negocio" icon={<Building2 className="h-5 w-5" />}>
        <div className="flex items-center gap-4">
          <button onClick={() => fileRef.current?.click()} className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-surface-sunken text-ink-mute hover:border-brand" aria-label="Subir logo">
            {draft.logoUrl ? <img src={assetUrl(draft.logoUrl)} alt="Logo" className="h-full w-full object-cover" /> : <ImageUp className="h-7 w-7" />}
          </button>
          <div className="flex-1">
            <Input label="Nombre" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>{draft.logoUrl ? 'Cambiar logo' : 'Subir logo'}</Button>
          {draft.logoUrl && <Button size="sm" variant="ghost" onClick={() => set({ logoUrl: null })}>Quitar</Button>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Teléfono" inputMode="tel" value={draft.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} />
          <Select label="Zona horaria" value={draft.timezone} onChange={(e) => set({ timezone: e.target.value })} options={TIMEZONES.map(([v, l]) => ({ value: v, label: l }))} />
        </div>
        <Input label="Dirección" value={draft.address ?? ''} onChange={(e) => set({ address: e.target.value })} />
        <ColorField label="Color principal" value={draft.primaryColor} onChange={(c) => set({ primaryColor: c })} />
        <ColorField label="Color de acento" value={draft.accentColor} onChange={(c) => set({ accentColor: c })} />
      </Card>
      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink-mute">Vista previa</p>
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 p-4" style={{ background: draft.primaryColor, color: fg }}>
            {draft.logoUrl ? <img src={assetUrl(draft.logoUrl)} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-black/15 font-display text-lg font-bold">{draft.name[0]}</span>}
            <span className="font-display text-lg font-bold">{draft.name}</span>
          </div>
          <div className="space-y-3 p-4">
            <button className="h-11 w-full rounded-xl font-semibold" style={{ background: draft.primaryColor, color: fg }}>Botón principal</button>
            <button className="h-11 w-full rounded-xl font-semibold" style={{ background: draft.accentColor, color: readableOn(draft.accentColor) }}>Acento</button>
            <p className="text-sm text-ink-mute">
              Así se verán los botones y encabezados del menú web y los tickets. <span style={{ color: draft.primaryColor }} className="font-semibold">Enlaces</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (c: string) => void }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {BRAND_SWATCHES.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)} className={clsx('h-9 w-9 rounded-full transition', value.toLowerCase() === c.toLowerCase() && 'ring-2 ring-ink ring-offset-2 ring-offset-surface-raised')} style={{ background: c }} aria-label={c} />
        ))}
        <label className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-line" title="Otro color">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          <span className="grid h-full w-full place-items-center text-xs font-bold text-ink-mute">+</span>
        </label>
        <span className="font-mono text-xs text-ink-mute">{value}</span>
      </div>
    </div>
  );
}

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function PushCard() {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [state, setState] = useState<'checking' | 'unsupported' | 'off' | 'on' | 'denied' | 'unavailable'>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return setState('unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    let alive = true;
    const t = setTimeout(() => alive && setState((s) => (s === 'checking' ? 'off' : s)), 2500);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => alive && setState(sub ? 'on' : 'off'))
      .catch(() => alive && setState('off'));
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [supported]);

  const enable = async () => {
    setBusy(true);
    try {
      const { publicKey } = await api.get<{ publicKey: string | null }>('/notifications/push/public-key');
      if (!publicKey) {
        setState('unavailable');
        toast.error('El servidor no tiene notificaciones push configuradas');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('La app no está instalada como PWA en este navegador')), 6000))]);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) });
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api.post('/notifications/push/subscribe', { endpoint: j.endpoint, keys: j.keys });
      setState('on');
      toast.success('Notificaciones activadas en este dispositivo');
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.del('/notifications/push/subscribe', { endpoint: sub.endpoint }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setState('off');
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Restaurante Hub', { body: '¡Así te llegarán las requisiciones nuevas!', icon: '/icons/icon-192.png' });
    } catch {
      new Notification('Restaurante Hub', { body: '¡Así te llegarán las requisiciones nuevas!' });
    }
  };

  const label: Record<typeof state, string> = {
    checking: 'Revisando…',
    unsupported: 'Este navegador no soporta notificaciones push.',
    off: 'Desactivadas en este dispositivo.',
    on: 'Activadas en este dispositivo.',
    denied: 'Bloqueadas. Permite las notificaciones en la configuración del navegador.',
    unavailable: 'El servidor aún no tiene notificaciones push configuradas.',
  };

  return (
    <Card title="Notificaciones en este celular" icon={state === 'on' ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />} description="Recibe un aviso al instante aunque la app esté cerrada.">
      <div className={clsx('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium', state === 'on' ? 'bg-ok/10 text-ok' : state === 'denied' || state === 'unavailable' ? 'bg-danger/10 text-danger' : 'bg-surface-sunken text-ink-soft')}>
        <span className={clsx('h-2 w-2 rounded-full', state === 'on' ? 'bg-ok' : 'bg-ink-mute')} />
        {label[state]}
      </div>
      <div className="flex flex-wrap gap-2">
        {state === 'on' ? (
          <>
            <Button variant="outline" icon={<Send className="h-4 w-4" />} onClick={test}>Probar</Button>
            <Button variant="ghost" loading={busy} onClick={disable}>Desactivar</Button>
          </>
        ) : (
          <Button loading={busy} disabled={state === 'unsupported' || state === 'denied' || state === 'checking'} icon={<Bell className="h-4 w-4" />} onClick={enable}>
            Activar notificaciones
          </Button>
        )}
      </div>
      <p className="text-xs text-ink-mute">En iPhone primero agrega la app a tu pantalla de inicio (Compartir → Agregar a inicio).</p>
    </Card>
  );
}
