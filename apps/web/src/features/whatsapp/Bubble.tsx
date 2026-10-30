import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, CheckCheck, Clock, ExternalLink, FileText, List, MapPin, Reply, AlertCircle } from 'lucide-react';
import { fmtTime } from '@/lib/format';
import type { OutgoingWa } from './types';

/** Texto con *negritas*, _cursivas_ y enlaces (formato WhatsApp). */
export function WaText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('http'))
      parts.push(<a key={i++} href={t} target="_blank" rel="noreferrer" className="break-all text-info underline">{t}</a>);
    else if (t.startsWith('*')) parts.push(<b key={i++}>{t.slice(1, -1)}</b>);
    else if (t.startsWith('_')) parts.push(<i key={i++}>{t.slice(1, -1)}</i>);
    else parts.push(<s key={i++}>{t.slice(1, -1)}</s>);
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className="whitespace-pre-wrap break-words">{parts}</span>;
}

export function Ticks({ status }: { status: string | null }) {
  if (status === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-danger" aria-label="No enviado" />;
  if (status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" aria-label="Leído" />;
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5" aria-label="Entregado" />;
  if (status === 'sent' || status === 'simulated') return <Check className="h-3.5 w-3.5" aria-label="Enviado" />;
  if (status === 'pending' || status === 'queued') return <Clock className="h-3 w-3" aria-label="Pendiente" />;
  return null;
}

const TEMPLATE_LABEL: Record<string, string> = {
  pedido_confirmado: 'Pedido confirmado',
  pedido_en_camino: 'Pedido en camino',
  pedido_listo: 'Pedido listo',
  pedido_entregado: 'Pedido entregado',
  pedido_cancelado: 'Pedido cancelado',
  cupon_lealtad: 'Cupón de lealtad',
};

export interface BubbleProps {
  dir: 'IN' | 'OUT';
  at?: string | null;
  status?: string | null;
  /** cuerpo de texto plano (mensajes IN o cuando no hay payload) */
  body?: string | null;
  /** mensaje saliente estructurado */
  out?: OutgoingWa | null;
  /** IN location */
  location?: { lat: number; lng: number; address?: string | null; name?: string | null } | null;
  /** IN: respuesta de botón/lista */
  replyTo?: boolean;
  byHuman?: boolean;
  /** Simulador: al tocar un botón o fila */
  onChoose?: (kind: 'button' | 'list', id: string, title: string) => void;
  /** botones ya usados (deshabilitar) */
  spent?: boolean;
  error?: string | null;
}

/** Burbuja estilo WhatsApp (IN izquierda, OUT derecha) con botones/listas bajo la burbuja. */
export function Bubble({ dir, at, status, body, out, location, replyTo, byHuman, onChoose, spent, error }: BubbleProps) {
  const [listOpen, setListOpen] = useState(false);
  const isOut = dir === 'OUT';
  const interactive = !!onChoose && !spent;

  let content: ReactNode = body ? <WaText text={body} /> : null;
  let below: ReactNode = null;
  let header: string | undefined;
  let footer: string | undefined;

  if (out) {
    switch (out.kind) {
      case 'text':
        content = <WaText text={out.body} />;
        break;
      case 'buttons':
        header = out.header;
        footer = out.footer;
        content = <WaText text={out.body} />;
        below = (
          <div className={clsx('mt-1 grid gap-1', out.buttons.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
            {out.buttons.map((b) => (
              <button
                key={b.id}
                type="button"
                disabled={!interactive}
                onClick={() => onChoose?.('button', b.id, b.title)}
                className={clsx(
                  'flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-[var(--wa-bubble-out)] px-3 py-2 text-sm font-semibold text-[var(--wa-link)] shadow-sm',
                  interactive ? 'hover:brightness-95 active:scale-[0.98]' : 'cursor-default',
                )}
              >
                <Reply className="h-3.5 w-3.5" /> {b.title}
              </button>
            ))}
          </div>
        );
        break;
      case 'list':
        header = out.header;
        footer = out.footer;
        content = <WaText text={out.body} />;
        below = (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--wa-bubble-out)] px-3 py-2 text-sm font-semibold text-[var(--wa-link)] shadow-sm hover:brightness-95"
              aria-expanded={listOpen}
            >
              <List className="h-4 w-4" /> {out.buttonText || 'Ver opciones'}
            </button>
            {listOpen && (
              <div className="mt-1 overflow-hidden rounded-xl bg-[var(--wa-bubble-out)] shadow-sm">
                {out.sections.map((s, si) => (
                  <div key={si}>
                    {s.title && <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-[var(--wa-accent)]">{s.title}</p>}
                    {s.rows.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        disabled={!interactive}
                        onClick={() => {
                          onChoose?.('list', r.id, r.title);
                          setListOpen(false);
                        }}
                        className={clsx('flex w-full items-center gap-3 border-t border-line/60 px-3 py-2.5 text-left', interactive ? 'hover:bg-surface-sunken/60' : 'cursor-default')}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-ink">{r.title}</span>
                          {r.description && <span className="block truncate text-xs text-ink-mute">{r.description}</span>}
                        </span>
                        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-ink-mute/50" />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
        break;
      case 'location_request':
        content = <WaText text={out.body} />;
        below = (
          <div className="mt-1 flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-[var(--wa-bubble-out)] px-3 py-2 text-sm font-semibold text-[var(--wa-link)] shadow-sm">
            <MapPin className="h-4 w-4" /> Enviar ubicación
          </div>
        );
        break;
      case 'cta_url':
        content = <WaText text={out.body} />;
        below = (
          <a href={out.url} target="_blank" rel="noreferrer" className="mt-1 flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-[var(--wa-bubble-out)] px-3 py-2 text-sm font-semibold text-[var(--wa-link)] shadow-sm hover:brightness-95">
            <ExternalLink className="h-4 w-4" /> {out.buttonText}
          </a>
        );
        break;
      case 'image':
        content = (
          <span className="block">
            <img src={out.url} alt={out.caption ?? 'Imagen'} className="mb-1 max-h-60 rounded-lg object-cover" />
            {out.caption && <WaText text={out.caption} />}
          </span>
        );
        break;
      case 'template':
        content = (
          <span className="block">
            <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-mute">
              <FileText className="h-3 w-3" /> Plantilla · {TEMPLATE_LABEL[out.name] ?? out.name}
            </span>
            <span className="block space-y-0.5">
              {out.params.map((p, i) => (
                <span key={i} className="block"><WaText text={p} /></span>
              ))}
            </span>
          </span>
        );
        break;
    }
  }

  if (location) {
    const url = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
    content = (
      <a href={url} target="_blank" rel="noreferrer" className="block w-56">
        <span
          className="mb-1.5 grid h-24 place-items-center rounded-lg"
          style={{
            backgroundColor: 'rgb(var(--surface-sunken))',
            backgroundImage: 'linear-gradient(rgb(var(--line)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--line)) 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
        >
          <MapPin className="h-8 w-8 fill-danger text-white drop-shadow" />
        </span>
        <span className="block text-sm font-medium">{location.name || location.address || 'Ubicación'}</span>
        <span className="block font-mono text-xs text-ink-mute">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>
        <span className="mt-0.5 block text-xs text-info underline">Ver en mapa</span>
      </a>
    );
  }

  return (
    <div className={clsx('flex', isOut ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[85%] sm:max-w-[70%]">
        <div
          className={clsx(
            'relative rounded-xl px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-[1.35] text-ink shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]',
            isOut ? 'rounded-tr-sm bg-[var(--wa-bubble-me)]' : 'rounded-tl-sm bg-[var(--wa-bubble-out)]',
          )}
        >
          {byHuman && isOut && <p className="mb-0.5 text-[11px] font-semibold text-[var(--wa-accent)]">Respuesta del equipo</p>}
          {replyTo && <p className="mb-0.5 flex items-center gap-1 text-[11px] text-ink-mute"><Reply className="h-3 w-3" /> Opción elegida</p>}
          {header && <p className="mb-0.5 font-bold">{header}</p>}
          {content}
          {footer && <p className="mt-1 text-xs text-ink-mute">{footer}</p>}
          <span className="float-right ml-2 mt-1 flex translate-y-0.5 items-center gap-1 text-[11px] text-ink-mute">
            {at ? fmtTime(at) : ''}
            {isOut && <Ticks status={status ?? null} />}
          </span>
        </div>
        {error && <p className="mt-0.5 text-right text-xs text-danger">{error}</p>}
        {below}
      </div>
    </div>
  );
}

/**
 * Variables de color tipo WhatsApp (claro/oscuro). Se aplican con la clase `wa-theme` en el contenedor.
 * Se inyectan aquí para no tocar los estilos globales del shell.
 */
const WA_CSS = `
.wa-theme{--wa-bubble-me:#d9fdd3;--wa-bubble-out:#ffffff;--wa-wall:#efeae2;--wa-dot:rgba(0,0,0,.045);--wa-head:#008069;--wa-link:#027eb5;--wa-accent:#008069}
:root[data-theme='dark'] .wa-theme{--wa-bubble-me:#005c4b;--wa-bubble-out:#202c33;--wa-wall:#0b141a;--wa-dot:rgba(255,255,255,.03);--wa-head:#202c33;--wa-link:#53bdeb;--wa-accent:#25d366}
@media (prefers-color-scheme: dark){:root:not([data-theme='light']) .wa-theme{--wa-bubble-me:#005c4b;--wa-bubble-out:#202c33;--wa-wall:#0b141a;--wa-dot:rgba(255,255,255,.03);--wa-head:#202c33;--wa-link:#53bdeb;--wa-accent:#25d366}}
.wa-wall{background-color:var(--wa-wall);background-image:radial-gradient(var(--wa-dot) 1.5px,transparent 1.5px),radial-gradient(var(--wa-dot) 1.5px,transparent 1.5px);background-size:26px 26px;background-position:0 0,13px 13px}
`;
export function WaThemeStyle() {
  return <style>{WA_CSS}</style>;
}
