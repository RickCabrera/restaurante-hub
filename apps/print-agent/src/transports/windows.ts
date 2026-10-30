// Impresora instalada en Windows (USB, LPT, puerto TCP de Windows o compartida \\host\share).
// Envía bytes ESC/POS en crudo al spooler (datatype RAW) usando winspool.drv vía PowerShell + Add-Type,
// sin módulos nativos de Node.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { PrinterConfig } from '@rh/shared';
import { Transport, TransportError } from './types';
import { materializeScript, runPowerShell } from './powershell';

export const RAW_PRINT_PS1 = String.raw`
param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$Path,
  [string]$DocName = "Restaurante Hub"
)
$ErrorActionPreference = "Stop"
$source = @'
using System;
using System.Runtime.InteropServices;
public static class RhRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static void Send(string printerName, byte[] bytes, string docName) {
    IntPtr h;
    if (!OpenPrinter(printerName.Normalize(), out h, IntPtr.Zero))
      throw new Exception("No se encontro la impresora '" + printerName + "' (Win32 " + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFOW di = new DOCINFOW();
      di.pDocName = docName; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) throw new Exception("StartDocPrinter fallo (Win32 " + Marshal.GetLastWin32Error() + ")");
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter fallo (Win32 " + Marshal.GetLastWin32Error() + ")");
        IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
        try {
          Marshal.Copy(bytes, 0, p, bytes.Length);
          int written;
          if (!WritePrinter(h, p, bytes.Length, out written)) throw new Exception("WritePrinter fallo (Win32 " + Marshal.GetLastWin32Error() + ")");
          if (written != bytes.Length) throw new Exception("Solo se enviaron " + written + " de " + bytes.Length + " bytes");
        } finally { Marshal.FreeCoTaskMem(p); }
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
try {
  if (-not ("RhRawPrinter" -as [type])) { Add-Type -TypeDefinition $source -Language CSharp }
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  [RhRawPrinter]::Send($PrinterName, $bytes, $DocName)
  Write-Output "OK"
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
`;

export async function printWindowsRaw(printerName: string, bytes: Uint8Array, opts: { timeoutMs?: number; docName?: string } = {}): Promise<void> {
  if (process.platform !== 'win32') {
    throw new TransportError('"Impresora instalada en Windows" solo funciona en una PC con Windows');
  }
  const script = materializeScript('rh-raw-print', RAW_PRINT_PS1);
  const tmp = path.join(os.tmpdir(), `rh-job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.bin`);
  fs.writeFileSync(tmp, Buffer.from(bytes));
  try {
    await runPowerShell(
      ['-File', script, '-PrinterName', printerName, '-Path', tmp, '-DocName', opts.docName ?? 'Restaurante Hub'],
      opts.timeoutMs ?? 20_000,
    );
  } catch (e) {
    const err = e as Error & { stderr?: string; killed?: boolean };
    if (err.killed) throw new TransportError(`Tiempo agotado enviando a la impresora de Windows "${printerName}"`);
    const msg = (err.stderr || err.message || '').trim().split(/\r?\n/)[0];
    throw new TransportError(`Error al imprimir en "${printerName}": ${msg}`);
  } finally {
    fs.unlink(tmp, () => {});
  }
}

export const windowsTransport: Transport = {
  async print(printer: PrinterConfig, bytes: Uint8Array, opts) {
    const name = printer.windowsName?.trim();
    if (!name) throw new TransportError(`La impresora "${printer.name}" no tiene el nombre de la impresora de Windows`);
    // Acepta nombre local ("EPSON TM-T20II Receipt") o compartida ("\\\\PC-CAJA\\TERMICA")
    await printWindowsRaw(name, bytes, { timeoutMs: opts?.timeoutMs ? opts.timeoutMs + 5_000 : 20_000, docName: printer.name });
  },
};
