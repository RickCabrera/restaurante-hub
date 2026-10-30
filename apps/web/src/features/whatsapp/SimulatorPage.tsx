import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Bot, ExternalLink, Hand, Inbox, MapPin, RotateCcw, Send, Smartphone, X } from 'lucide-react';
import { api } from '@/lib/api';
import { emitAck, getSocket } from '@/lib/socket';
import { sounds } from '@/lib/sound';
import { Button, Input, Modal, toast } from '@/ui';
import { Bubble, WaThemeStyle } from './Bubble';
import { STATE_LABEL, type OutgoingWa } from './types';

interface SimMsg {
  id: string;
  dir: 'IN' | 'OUT';
  at: string;
  /** IN: lo que escribió/eligió el "cliente" */
  text?: string;
  location?: { lat: number; lng: number; address?: string | null; name?: string | null };
  reply?: boolean;
  /** OUT: respuesta del bot */
  out?: OutgoingWa;
}

interface SimResp { conversationId: string; state: string; humanMode: boolean; replies: OutgoingWa[]; phone: string }

const PRESET = { lat: 19.4326, lng: -99.1332, name: 'Zócalo', address: 'Plaza de la Constitución, Centro, CDMX' };
const KEY = 'rh.wasim';

function load(): { phone: string; name: string } {
  try {
    return { phone: '5215500000001', name: 'Cliente de prueba', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { phone: '5215500000001', name: 'Cliente de prueba' };
  }
}

/** /admin/whatsapp/simulador — probar el bot sin Meta (WAB-07). */
export function SimulatorPage() {
  const init = load();
  const [phone, setPhone] = useState(init.phone);
  const [name, setName] = useState(init.name);
  const [msgs, setMsgs] = useState<SimMsg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const [human, setHuman] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const [custom, setCustom] = useState({ lat: '', lng: '' });
  const seen = useRef(new Set<string>());
  const endRef = useRef<HTMLDivElement>(null);
  const validPhone = /^\d{12,15}$/.test(phone.replace(/\D/g, ''));
  const digits = phone.replace(/\D/g, '');

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ phone, name }));
    } catch {
      /* nada */
    }
  }, [phone, name]);

  // Mensajes asíncronos del bot (cambios de estado del pedido, respuestas humanas)
  useEffect(() => {
    if (!validPhone) return;
    const s = getSocket();
    const join = () => emitAck('wasim.join', { phone: digits }).catch((e: Error) => toast.error('Simulador sin tiempo real', e.message));
    void join();
    s.on('connect', join);
    const onOut = (p: { id: string; to: string; msg: OutgoingWa; at: string }) => {
      if (!p?.id || seen.current.has(p.id)) return;
      // el servidor normaliza 521XXXXXXXXXX → 52XXXXXXXXXX: comparar los últimos 10 dígitos
      if (p.to.replace(/\D/g, '').slice(-10) !== digits.slice(-10)) return;
      seen.current.add(p.id);
      // Las respuestas síncronas también llegan aquí: si ya mostramos una igual hace instantes, no duplicar
      setMsgs((prev) => {
        const sig = JSON.stringify(p.msg);
        const recent = prev.slice(-12).some((m) => m.dir === 'OUT' && JSON.stringify(m.out) === sig && Date.now() - new Date(m.at).getTime() < 5000);
        if (recent) return prev;
        sounds.message();
        return [...prev, { id: p.id, dir: 'OUT', at: p.at, out: p.msg }];
      });
    };
    s.on('wa.sim.out', onOut);
    return () => {
      s.off('connect', join);
      s.off('wa.sim.out', onOut);
      s.emit('wasim.leave', { phone: digits });
    };
  }, [digits, validPhone]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [msgs.length]);

  const send = async (body: Record<string, unknown>, shown: Omit<SimMsg, 'id' | 'dir' | 'at'>) => {
    if (!validPhone) return toast.error('Teléfono inválido', 'Usa 12–13 dígitos con lada de país, p. ej. 5215500000001');
    const local: SimMsg = { id: `in-${Date.now()}`, dir: 'IN', at: new Date().toISOString(), ...shown };
    setMsgs((p) => [...p, local]);
    setBusy(true);
    try {
      const r = await api.post<SimResp>('/whatsapp/simulator/inbound', { phone: digits, name: name.trim() || undefined, ...body });
      setState(r.state);
      setHuman(r.humanMode);
      setConvId(r.conversationId);
      const now = Date.now();
      setMsgs((p) => {
        // si el socket ya trajo alguna de estas respuestas, no duplicar
        const recentSigs = new Set(p.filter((m) => m.dir === 'OUT' && now - new Date(m.at).getTime() < 8000).map((m) => JSON.stringify(m.out)));
        const add = r.replies.filter((o) => !recentSigs.has(JSON.stringify(o))).map((o, i) => ({ id: `out-${now}-${i}`, dir: 'OUT' as const, at: new Date().toISOString(), out: o }));
        return [...p, ...add];
      });
      if (r.replies.length) sounds.message();
    } catch (e) {
      toast.fromError(e);
      setMsgs((p) => p.filter((m) => m.id !== local.id));
    } finally {
      setBusy(false);
    }
  };

  const sendText = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    void send({ text: t }, { text: t });
  };
  const choose = (kind: 'button' | 'list', id: string, title: string) =>
    void send(kind === 'button' ? { buttonId: id, title } : { listId: id, title }, { text: title, reply: true });
  const sendLoc = (l: { lat: number; lng: number; name?: string; address?: string }) => {
    setLocOpen(false);
    void send({ location: l }, { location: l });
  };
  const reset = () => {
    setMsgs([]);
    seen.current.clear();
    void send({ text: 'hola' }, { text: 'hola' });
  };

  // Último mensaje del bot con botones/lista: solo ese es interactivo
  const lastOutIdx = msgs.map((m) => m.dir).lastIndexOf('OUT');
  const lastInIdx = msgs.map((m) => m.dir).lastIndexOf('IN');

  return (
    <div className="wa-theme">
      <WaThemeStyle />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/admin/whatsapp" className="mb-1 inline-flex items-center gap-1 text-sm text-ink-mute hover:text-ink"><ArrowLeft className="h-4 w-4" /> Bandeja</Link>
          <h1 className="h-display text-2xl font-bold sm:text-3xl">Simulador de WhatsApp</h1>
          <p className="mt-1 text-sm text-ink-mute">Prueba el bot como si fueras un cliente, sin conectar Meta. Usa el mismo motor y crea pedidos reales.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:items-start xl:grid-cols-[1fr_420px]">
        {/* Panel de control */}
        <div className="order-2 space-y-4 lg:order-1">
          <div className="card space-y-3 p-4">
            <p className="font-semibold">Cliente de prueba</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Teléfono (con lada de país)" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" error={validPhone ? undefined : 'Ej. 5215500000001'} />
              <Input label="Nombre de perfil" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {['5215500000001', '5215500000002', '5215500000003'].map((p) => (
                <button key={p} onClick={() => { setPhone(p); setMsgs([]); seen.current.clear(); setState(null); }} className={clsx('chip h-7 px-3 font-mono', digits === p ? 'bg-ink text-surface' : 'bg-surface-sunken text-ink-soft')}>
                  …{p.slice(-4)}
                </button>
              ))}
            </div>
          </div>

          <div className="card space-y-3 p-4">
            <p className="font-semibold">Estado</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={clsx('chip h-7 px-3', human ? 'bg-warn/15 text-warn' : 'bg-info/15 text-info')}>
                {human ? <Hand className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                {state ? STATE_LABEL[state] ?? state : 'Sin conversación'}
              </span>
              <span className="font-mono text-xs text-ink-mute">{state ?? ''}</span>
            </div>
            {human && <p className="text-sm text-ink-soft">Esta conversación está en atención humana: el bot no responde. Contesta desde la bandeja o toca “Regresar al bot”.</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={reset} disabled={busy}>Reiniciar (enviar “hola”)</Button>
              {convId ? (
                <Link to={`/admin/whatsapp/${convId}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-raised px-4 text-sm font-medium hover:bg-surface-sunken">
                  <Inbox className="h-4 w-4" /> Ver en bandeja
                </Link>
              ) : (
                <Link to="/admin/whatsapp" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-raised px-4 text-sm font-medium hover:bg-surface-sunken">
                  <Inbox className="h-4 w-4" /> Ver en bandeja
                </Link>
              )}
            </div>
          </div>

          <div className="card p-4 text-sm text-ink-soft">
            <p className="font-semibold text-ink">Ideas para probar</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>“hola” → menú → pedir → elegir productos → dirección → pago → confirmar.</li>
              <li>Ubicación del Zócalo (dentro de zona) o escribe una dirección con “lejos” para probar fuera de zona.</li>
              <li>“hablar con alguien” pasa la conversación a la bandeja.</li>
              <li>Acepta el pedido en Pedidos y verás aquí los avisos del estado.</li>
            </ul>
          </div>
        </div>

        {/* Teléfono */}
        <div className="order-1 mx-auto w-full max-w-[400px] lg:order-2 lg:sticky lg:top-4">
          <div className="rounded-[44px] border-[10px] border-ink bg-ink p-0 shadow-lift">
            <div className="relative overflow-hidden rounded-[34px]">
              <div className="flex items-center gap-3 bg-[var(--wa-head)] px-3 pb-2.5 pt-5 text-white">
                <Smartphone className="h-5 w-5 opacity-80" />
                <div className="grid h-9 w-9 place-items-center rounded-full bg-white/20"><Bot className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-tight">Restaurante (bot)</p>
                  <p className="truncate text-xs text-white/80">{busy ? 'escribiendo…' : 'en línea'}</p>
                </div>
              </div>
              <div className="wa-wall h-[min(62dvh,560px)] space-y-1.5 overflow-y-auto px-2.5 py-3 scroll-thin">
                {msgs.length === 0 && (
                  <div className="mx-auto mt-8 max-w-[260px] rounded-xl bg-surface-raised/95 p-4 text-center text-sm text-ink-soft shadow-sm">
                    Escribe <b>hola</b> o toca <b>Reiniciar</b> para empezar una conversación con el bot.
                  </div>
                )}
                {msgs.map((m, i) =>
                  m.dir === 'IN' ? (
                    <Bubble key={m.id} dir="OUT" at={m.at} status="read" body={m.text} location={m.location} replyTo={m.reply} />
                  ) : (
                    <Bubble key={m.id} dir="IN" at={m.at} out={m.out} onChoose={choose} spent={busy || i < lastInIdx || (i !== lastOutIdx && msgs.slice(i + 1).some((x) => x.dir === 'OUT' && (x.out?.kind === 'buttons' || x.out?.kind === 'list')))} />
                  ),
                )}
                {busy && (
                  <div className="flex">
                    <span className="rounded-xl bg-[var(--wa-bubble-out)] px-3 py-2 shadow-sm">
                      <span className="inline-flex gap-1">
                        {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-mute" style={{ animationDelay: `${d * 120}ms` }} />)}
                      </span>
                    </span>
                  </div>
                )}
                <div ref={endRef} />
              </div>
              <form
                className="flex items-center gap-1.5 bg-surface-sunken px-2 py-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendText();
                }}
              >
                <button type="button" onClick={() => setLocOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-raised" aria-label="Enviar ubicación" title="Enviar ubicación">
                  <MapPin className="h-5 w-5" />
                </button>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensaje" aria-label="Mensaje" className="h-10 min-w-0 flex-1 rounded-full bg-surface-raised px-4 text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wa-accent)]" />
                <button type="submit" disabled={!text.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--wa-accent)] text-white disabled:opacity-50" aria-label="Enviar">
                  <Send className="h-5 w-5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <Modal open={locOpen} onClose={() => setLocOpen(false)} title="Enviar ubicación" size="sm">
        <div className="space-y-4">
          <button onClick={() => sendLoc(PRESET)} className="flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left hover:bg-surface-sunken">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ok/15 text-ok"><MapPin className="h-5 w-5" /></span>
            <span className="flex-1">
              <span className="block font-semibold">Zócalo, CDMX</span>
              <span className="block font-mono text-xs text-ink-mute">19.4326, -99.1332 · dentro de zona</span>
            </span>
          </button>
          <button onClick={() => sendLoc({ lat: 19.6, lng: -99.0, name: 'Ecatepec' })} className="flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left hover:bg-surface-sunken">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-danger/15 text-danger"><X className="h-5 w-5" /></span>
            <span className="flex-1">
              <span className="block font-semibold">Ecatepec</span>
              <span className="block font-mono text-xs text-ink-mute">19.6, -99.0 · fuera de zona</span>
            </span>
          </button>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const lat = Number(custom.lat);
              const lng = Number(custom.lng);
              if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return toast.error('Coordenadas inválidas');
              sendLoc({ lat, lng });
            }}
          >
            <p className="label">Otra ubicación</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Latitud" inputMode="decimal" value={custom.lat} onChange={(e) => setCustom({ ...custom, lat: e.target.value })} aria-label="Latitud" />
              <input className="input" placeholder="Longitud" inputMode="decimal" value={custom.lng} onChange={(e) => setCustom({ ...custom, lng: e.target.value })} aria-label="Longitud" />
            </div>
            <Button type="submit" block disabled={!custom.lat || !custom.lng} icon={<ExternalLink className="h-4 w-4" />}>Enviar</Button>
          </form>
        </div>
      </Modal>
    </div>
  );
}
