import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, BookmarkPlus, Mic, MicOff, Minus, Plus, Send, Trash2, X } from 'lucide-react';
import { roundQty } from '@rh/shared';
import { SupplyIcon } from '@/icons/supplies';
import { assetUrl } from '@/lib/config';
import { Spinner } from '@/ui';
import { qtyLabel } from '@/features/common-req/SupplyTile';
import type { CatalogSupply } from '@/features/common-req/types';
import { useCart } from './cart';

type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onend: () => void;
  onerror: () => void;
};

function getRecognition(): SR | null {
  const w = window as unknown as { webkitSpeechRecognition?: new () => SR; SpeechRecognition?: new () => SR };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!C) return null;
  const r = new C();
  r.lang = 'es-MX';
  r.interimResults = true;
  r.continuous = false;
  return r;
}

export function CartSheet({
  open,
  onClose,
  supplies,
  accent,
  sending,
  onSend,
  onSaveTemplate,
}: {
  open: boolean;
  onClose: () => void;
  supplies: Map<string, CatalogSupply>;
  accent: string;
  sending: boolean;
  onSend: () => void;
  onSaveTemplate: () => void;
}) {
  const cart = useCart();
  const [listening, setListening] = useState(false);
  const rec = useRef<SR | null>(null);
  const baseNote = useRef('');
  const canDictate = typeof window !== 'undefined' && !!((window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition || (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition);

  useEffect(() => {
    if (!open) rec.current?.stop();
  }, [open]);

  if (!open) return null;
  const lines = cart.order.map((id) => cart.lines[id]).filter(Boolean);
  const urgent = cart.priority === 'URGENTE';

  const dictate = () => {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = getRecognition();
    if (!r) return;
    rec.current = r;
    baseNote.current = cart.note ? `${cart.note.trim()} ` : '';
    r.onresult = (e) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      cart.setGeneralNote((baseNote.current + t).slice(0, 500));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    setListening(true);
    r.start();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal aria-label="Tu pedido">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-surface shadow-lift animate-slide-up">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4" style={{ borderTop: `6px solid ${accent}` }}>
          <h2 className="h-display flex-1 text-3xl font-bold">Tu pedido</h2>
          <button onClick={onSaveTemplate} disabled={!lines.length} className="flex h-14 items-center gap-2 rounded-2xl bg-surface-sunken px-4 font-semibold active:scale-95 disabled:opacity-40">
            <BookmarkPlus className="h-6 w-6" /> <span className="hidden sm:inline">Guardar plantilla</span>
          </button>
          <button onClick={onClose} className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-sunken active:scale-95" aria-label="Cerrar">
            <X className="h-7 w-7" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 scroll-thin">
          {lines.length === 0 && <p className="py-16 text-center text-xl text-ink-mute">Toca los insumos para agregarlos.</p>}
          {lines.map((l) => {
            const s = supplies.get(l.supplyId);
            if (!s) return null;
            const max = s.maxPerOrder ?? Infinity;
            return (
              <div key={l.supplyId} className="card flex flex-wrap items-center gap-3 p-3">
                <SupplyIcon icon={s.icon} imageUrl={assetUrl(s.imageUrl)} label={s.name} size={60} />
                <div className="min-w-[8rem] flex-1">
                  <p className="text-lg font-semibold leading-tight">{s.name}</p>
                  <input
                    value={l.note ?? ''}
                    onChange={(e) => cart.setNote(l.supplyId, e.target.value.slice(0, 200))}
                    placeholder="+ nota"
                    className="mt-1 h-9 w-full rounded-lg border border-transparent bg-transparent px-1 text-sm text-ink-soft placeholder:text-ink-mute focus:border-line focus:bg-surface-sunken focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => cart.setQty(l.supplyId, roundQty(l.qty - s.step))} className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-sunken active:scale-90" aria-label="Menos">
                    <Minus className="h-7 w-7" strokeWidth={3} />
                  </button>
                  <span className="h-display min-w-[5.5rem] text-center text-xl font-bold">{qtyLabel(l.qty, s.unit)}</span>
                  <button
                    onClick={() => cart.setQty(l.supplyId, Math.min(max, roundQty(l.qty + s.step)))}
                    disabled={l.qty + s.step > max + 1e-9}
                    className="grid h-14 w-14 place-items-center rounded-2xl text-white active:scale-90 disabled:opacity-40"
                    style={{ background: accent }}
                    aria-label="Más"
                  >
                    <Plus className="h-7 w-7" strokeWidth={3} />
                  </button>
                  <button onClick={() => cart.remove(l.supplyId)} className="grid h-14 w-14 place-items-center rounded-2xl text-danger active:scale-90" aria-label="Quitar">
                    <Trash2 className="h-6 w-6" />
                  </button>
                </div>
              </div>
            );
          })}

          {lines.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => cart.setPriority('NORMAL')}
                  className={clsx('h-20 rounded-3xl border-4 text-xl font-bold transition active:scale-95', !urgent ? 'border-ink bg-surface-raised' : 'border-line bg-surface-raised text-ink-mute')}
                >
                  Normal
                </button>
                <button
                  onClick={() => cart.setPriority('URGENTE')}
                  className={clsx(
                    'flex h-20 items-center justify-center gap-2 rounded-3xl border-4 text-xl font-black tracking-wide transition active:scale-95',
                    urgent ? 'border-danger bg-danger text-white' : 'border-danger/40 bg-danger/10 text-danger',
                  )}
                >
                  <AlertTriangle className="h-7 w-7" /> URGENTE
                </button>
              </div>
              <div className="flex items-start gap-2">
                <textarea
                  value={cart.note}
                  onChange={(e) => cart.setGeneralNote(e.target.value.slice(0, 500))}
                  rows={2}
                  className="input h-auto min-h-[4.5rem] flex-1 py-3 text-lg"
                  placeholder="Nota para la dueña (opcional)"
                />
                {canDictate && (
                  <button
                    onClick={dictate}
                    className={clsx('grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-2xl active:scale-95', listening ? 'animate-ring bg-danger text-white' : 'bg-surface-sunken text-ink')}
                    aria-label={listening ? 'Detener dictado' : 'Dictar nota'}
                  >
                    {listening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-line bg-surface-raised p-4 safe-bottom">
          <button
            onClick={onSend}
            disabled={!lines.length || sending}
            className={clsx(
              'flex h-24 w-full items-center justify-center gap-3 rounded-3xl text-2xl font-black tracking-wide text-white shadow-lift transition active:scale-[0.98] disabled:opacity-50',
            )}
            style={{ background: urgent ? 'rgb(var(--danger))' : 'rgb(var(--ok))' }}
          >
            {sending ? <Spinner className="h-8 w-8" /> : <Send className="h-9 w-9" />}
            ENVIAR A LA DUEÑA
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
