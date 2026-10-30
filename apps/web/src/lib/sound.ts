// Sonidos generados con WebAudio (no requiere archivos). Algunos navegadores exigen una interacción previa.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.25) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}

export const sounds = {
  /** toque de un ícono */
  tap: () => tone(660, 0, 0.08, 'triangle', 0.12),
  /** nuevo pedido / requisición */
  newOrder: () => {
    tone(880, 0, 0.18, 'square', 0.18);
    tone(1175, 0.2, 0.18, 'square', 0.18);
    tone(1568, 0.4, 0.3, 'square', 0.18);
  },
  /** mensaje de chat */
  message: () => {
    tone(988, 0, 0.12, 'sine', 0.2);
    tone(1319, 0.12, 0.16, 'sine', 0.2);
  },
  /** urgente */
  urgent: () => {
    for (let i = 0; i < 3; i++) {
      tone(1046, i * 0.35, 0.15, 'sawtooth', 0.2);
      tone(784, i * 0.35 + 0.16, 0.15, 'sawtooth', 0.2);
    }
  },
  success: () => {
    tone(523, 0, 0.12, 'triangle', 0.2);
    tone(784, 0.12, 0.2, 'triangle', 0.2);
  },
  error: () => tone(220, 0, 0.3, 'sawtooth', 0.15),
  /** desbloquear audio tras la primera interacción del usuario */
  unlock: () => void ac(),
};

export function vibrate(pattern: number | number[] = 15) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* no soportado */
  }
}
