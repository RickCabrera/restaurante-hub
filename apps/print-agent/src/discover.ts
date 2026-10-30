// Detección de impresoras locales: Windows (spooler), Linux (/dev/usb/lp*, CUPS) y puertos serial.
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import type { DiscoveredPrinter } from '@rh/shared';
import { listSerialPorts, runPowerShell } from './transports';

async function discoverWindows(): Promise<DiscoveredPrinter[]> {
  try {
    const { stdout } = await runPowerShell(
      ['-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Printer | Select-Object Name,PortName,DriverName | ConvertTo-Json -Compress'],
      15_000,
    );
    const text = stdout.trim();
    if (!text) return [];
    const parsed = JSON.parse(text) as { Name: string; PortName?: string; DriverName?: string } | { Name: string; PortName?: string }[];
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .filter((p) => p && p.Name)
      .map((p) => ({ name: p.Name, type: 'windows' as const, path: p.PortName || undefined }));
  } catch {
    return [];
  }
}

function lpstat(): Promise<DiscoveredPrinter[]> {
  return new Promise((resolve) => {
    execFile('lpstat', ['-e'], { timeout: 5_000 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(
        String(stdout)
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((name) => ({ name, type: 'usb' as const, path: `cups:${name}` })),
      );
    });
  });
}

function usbDevices(): DiscoveredPrinter[] {
  const out: DiscoveredPrinter[] = [];
  for (const dir of ['/dev/usb', '/dev']) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (/^lp\d+$/.test(f)) out.push({ name: `USB ${f}`, type: 'usb', path: `${dir}/${f}` });
      }
    } catch {
      /* no existe */
    }
  }
  return out;
}

export async function discoverPrinters(): Promise<DiscoveredPrinter[]> {
  const found: DiscoveredPrinter[] = [];
  if (process.platform === 'win32') found.push(...(await discoverWindows()));
  else if (process.platform === 'linux' || process.platform === 'darwin') {
    if (process.platform === 'linux') found.push(...usbDevices());
    found.push(...(await lpstat()));
  }
  for (const p of await listSerialPorts()) found.push({ name: p.name, type: 'serial', path: p.path });
  // sin duplicados
  const seen = new Set<string>();
  return found.filter((p) => {
    const k = `${p.type}|${p.path ?? ''}|${p.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
