// Utilidades para ejecutar PowerShell sin módulos nativos (Windows).
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export function powershellExe(): string {
  const root = process.env.SystemRoot || 'C:\\Windows';
  const full = path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return fs.existsSync(full) ? full : 'powershell.exe';
}

export function runPowerShell(args: string[], timeoutMs = 20_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      powershellExe(),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err) {
          const e = err as Error & { stderr?: string };
          e.stderr = String(stderr ?? '');
          reject(e);
        } else resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/** Escribe un script .ps1 en una carpeta temporal estable (por contenido) y devuelve su ruta. */
export function materializeScript(name: string, content: string): string {
  const hash = crypto.createHash('sha1').update(content).digest('hex').slice(0, 10);
  const dir = path.join(os.tmpdir(), 'restaurante-hub-agent');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${hash}.ps1`);
  if (!fs.existsSync(file)) {
    // BOM UTF-8 para que PowerShell 5.1 lea correctamente los acentos
    fs.writeFileSync(file, '\ufeff' + content.replace(/\r?\n/g, '\r\n'), 'utf8');
  }
  return file;
}
