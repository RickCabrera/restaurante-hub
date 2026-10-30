// Logger mínimo con marca de tiempo (sin dependencias).
export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug?(msg: string, ...args: unknown[]): void;
}

const useColor = typeof process !== 'undefined' && !!process.stdout?.isTTY && !process.env.NO_COLOR;
const paint = (code: number, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

function ts(): string {
  const d = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export function createConsoleLogger(prefix = 'print-agent', verbose = !!process.env.RH_DEBUG): Logger {
  const fmt = (level: string, color: number, msg: string) => `${paint(90, ts())} ${paint(color, level.padEnd(5))} ${paint(36, `[${prefix}]`)} ${msg}`;
  return {
    info: (m, ...a) => console.log(fmt('INFO', 32, m), ...a),
    warn: (m, ...a) => console.warn(fmt('WARN', 33, m), ...a),
    error: (m, ...a) => console.error(fmt('ERROR', 31, m), ...a),
    debug: (m, ...a) => { if (verbose) console.log(fmt('DEBUG', 35, m), ...a); },
  };
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {}, debug() {} };
