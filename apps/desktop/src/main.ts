// Restaurante Hub — app de escritorio (Electron).
// Carga la app web (PWA) desde el servidor configurado e integra el agente de impresión.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  app, BrowserWindow, Menu, MenuItemConstructorOptions, Notification, Tray, dialog, ipcMain, nativeImage, net, shell,
  type IpcMainInvokeEvent, type WebContents,
} from 'electron';
import { createPrintAgent, type AgentStatus, type PrintAgent, type Logger } from '@rh/print-agent';
import { buildTestTicket, renderHtml } from '@rh/printing';
import { PrinterConnectionLabel, type PrinterConfig } from '@rh/shared';
import { DesktopConfig, effectiveApiUrl, loadConfig, normalizeUrl, saveConfig } from './config';

const APP_NAME = 'Restaurante Hub';
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('mx.restaurantehub.desktop');

// ---------- instancia única ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let config: DesktopConfig = { serverUrl: '', apiUrl: '', agentToken: '', autoStart: true, kiosk: false };
let mainWindow: BrowserWindow | null = null;
let setupWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let agent: PrintAgent | null = null;
let agentStatus: AgentStatus | null = null;
let quitting = false;
let trayHintShown = false;

// ---------- logs ----------
const logFile = () => path.join(app.getPath('userData'), 'desktop.log');
function writeLog(level: string, msg: string) {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${msg}\n`;
  if (!app.isPackaged) process.stdout.write(line);
  try {
    const f = logFile();
    if (fs.existsSync(f) && fs.statSync(f).size > 5_000_000) fs.renameSync(f, `${f}.1`);
    fs.appendFileSync(f, line);
  } catch {
    /* sin log en disco */
  }
}
const logger: Logger = {
  info: (m) => writeLog('INFO', m),
  warn: (m) => writeLog('WARN', m),
  error: (m) => writeLog('ERROR', m),
  debug: () => {},
};

// ---------- utilidades ----------
const assetPath = (...p: string[]) => path.join(app.getAppPath(), ...p);
function appIcon() {
  const img = nativeImage.createFromPath(assetPath('resources', 'icon.png'));
  return img.isEmpty() ? undefined : img;
}
function originOf(u: string): string {
  try {
    return new URL(u).origin;
  } catch {
    return '';
  }
}
/** Solo la app web del servidor configurado puede usar window.rhDesktop. */
function isTrustedSender(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? '';
  const allowed = [originOf(config.serverUrl), originOf(effectiveApiUrl(config))].filter(Boolean);
  return allowed.includes(originOf(url));
}

// ---------- agente de impresión ----------
function statusText(s: AgentStatus | null): string {
  if (!config.agentToken) return 'Agente de impresión: no configurado';
  if (!s) return 'Agente de impresión: iniciando…';
  const map: Record<string, string> = {
    connected: 'conectado', connecting: 'conectando…', disconnected: 'reconectando…', error: 'error', stopped: 'detenido',
  };
  let t = `Agente: ${map[s.state] ?? s.state} · ${s.printers.length} impresora(s)`;
  if (s.queued) t += ` · ${s.queued} en cola`;
  if (s.state === 'error' && s.lastError) t += `\n${s.lastError}`;
  return t.slice(0, 127); // límite del tooltip en Windows
}

async function startAgent() {
  await stopAgent();
  if (!config.agentToken || !effectiveApiUrl(config)) {
    updateTray();
    return;
  }
  agent = createPrintAgent({
    apiUrl: effectiveApiUrl(config),
    token: config.agentToken,
    name: os.hostname(),
    kind: 'desktop',
    version: app.getVersion(),
    logger,
    onStatus: (s) => {
      agentStatus = s;
      updateTray();
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('rh:agentStatus', s);
      }
    },
  });
  try {
    await agent.start();
  } catch (e) {
    logger.error(`No se pudo iniciar el agente: ${(e as Error).message}`);
  }
}

async function stopAgent() {
  const a = agent;
  agent = null;
  agentStatus = null;
  if (a) await a.stop().catch(() => undefined);
}

// ---------- impresión HTML (impresoras tipo BROWSER) ----------
interface PrintHtmlOptions {
  silent?: boolean;
  deviceName?: string;
  /** 58 | 80 — ancho de papel en mm para el tamaño de página. */
  paperWidth?: number;
  copies?: number;
}

async function printHtml(html: string, opts: PrintHtmlOptions = {}): Promise<{ ok: true }> {
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false, offscreen: false },
  });
  let tmpFile: string | null = null;
  try {
    // Los data: URL grandes pueden fallar; arriba de ~1.5 MB se usa un archivo temporal.
    if (html.length < 1_500_000) {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    } else {
      tmpFile = path.join(os.tmpdir(), `rh-print-${Date.now()}.html`);
      fs.writeFileSync(tmpFile, html, 'utf8');
      await win.loadFile(tmpFile);
    }
    // dar tiempo a que carguen imágenes (logos)
    await new Promise((r) => setTimeout(r, 300));
    const widthMicrons = (opts.paperWidth === 58 ? 58 : 80) * 1000;
    const heightPx = await win.webContents
      .executeJavaScript('document.documentElement.scrollHeight', true)
      .catch(() => 1000) as number;
    // alto de página = alto del contenido (rollo continuo), mínimo 100 mm
    const heightMicrons = Math.max(100_000, Math.ceil((Number(heightPx) || 1000) * 25.4 / 96 * 1000) + 5_000);
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: opts.silent !== false,
          deviceName: opts.deviceName || undefined,
          printBackground: true,
          copies: Math.max(1, Math.min(10, opts.copies ?? 1)),
          margins: { marginType: 'none' },
          pageSize: { width: widthMicrons, height: heightMicrons },
        },
        (success, reason) => (success ? resolve() : reject(new Error(reason === 'cancelled' ? 'Impresión cancelada' : `No se pudo imprimir: ${reason}`))),
      );
    });
    return { ok: true };
  } finally {
    if (!win.isDestroyed()) win.destroy();
    if (tmpFile) fs.unlink(tmpFile, () => {});
  }
}

async function listSystemPrinters(wc?: WebContents) {
  const contents = wc ?? mainWindow?.webContents ?? BrowserWindow.getAllWindows()[0]?.webContents;
  if (!contents) return [];
  const list = await contents.getPrintersAsync();
  return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, description: p.description, isDefault: !!(p as { isDefault?: boolean }).isDefault }));
}

// ---------- ventanas ----------
function openSetupWindow() {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show();
    setupWindow.focus();
    return;
  }
  setupWindow = new BrowserWindow({
    width: 560,
    height: 720,
    resizable: true,
    minimizable: false,
    title: `${APP_NAME} · Configuración`,
    icon: appIcon(),
    parent: mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !config.kiosk ? mainWindow : undefined,
    modal: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'setup', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  setupWindow.setMenu(null);
  void setupWindow.loadFile(assetPath('src', 'setup', 'index.html'));
  setupWindow.on('closed', () => {
    setupWindow = null;
    if (!config.serverUrl && !quitting) app.quit();
  });
}

function offlinePage(url: string, reason: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Sin conexión</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0}
.c{max-width:480px;text-align:center;padding:24px}h1{font-size:22px}p{color:#94a3b8}code{color:#fbbf24}
button{background:#f97316;color:#fff;border:0;border-radius:10px;padding:12px 22px;font-size:16px;cursor:pointer}</style></head>
<body><div class="c"><h1>No se pudo abrir el sistema</h1><p>Servidor: <code>${esc(url)}</code><br>${esc(reason)}</p>
<p>Revisa la conexión a internet. Reintentando automáticamente…</p>
<button onclick="location.href=${JSON.stringify(url).replace(/"/g, '&quot;')}">Reintentar ahora</button>
<p style="font-size:13px">Para cambiar el servidor usa el ícono de Restaurante Hub junto al reloj → Configuración.</p></div>
<script>setTimeout(function(){location.href=${JSON.stringify(url)}},15000)</script></body></html>`;
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    void mainWindow.loadURL(config.serverUrl);
    mainWindow.setKiosk(config.kiosk);
    mainWindow.show();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    icon: appIcon(),
    kiosk: config.kiosk,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false, // seguir recibiendo pedidos/sonidos en segundo plano
    },
  });
  const serverOrigin = originOf(config.serverUrl);

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  // Enlaces externos → navegador predeterminado
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (originOf(url) === serverOrigin) return { action: 'allow' };
    if (/^(https?|mailto|tel|whatsapp):/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('data:')) return;
    if (originOf(url) !== serverOrigin) {
      e.preventDefault();
      if (/^(https?|mailto|tel|whatsapp):/i.test(url)) void shell.openExternal(url);
    }
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ABORTED */) return;
    logger.warn(`No se pudo cargar ${url}: ${desc} (${code})`);
    void mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(offlinePage(config.serverUrl, desc))}`);
  });
  mainWindow.webContents.on('render-process-gone', (_e, d) => {
    logger.error(`El proceso de la página terminó (${d.reason}); recargando`);
    setTimeout(() => mainWindow?.webContents.reload(), 1000);
  });
  // Permisos que la app web necesita (notificaciones, sonido, ubicación para repartidores)
  mainWindow.webContents.session.setPermissionRequestHandler((wc, permission, cb) => {
    const ok = originOf(wc.getURL()) === serverOrigin &&
      ['notifications', 'media', 'geolocation', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'wakeLock' as never].includes(permission);
    cb(ok);
  });

  mainWindow.on('close', (e) => {
    // Con agente activo, cerrar la ventana solo la oculta (para seguir imprimiendo)
    if (!quitting && config.agentToken && tray) {
      e.preventDefault();
      mainWindow?.hide();
      if (!trayHintShown && Notification.isSupported()) {
        trayHintShown = true;
        new Notification({ title: APP_NAME, body: 'Sigue abierto en la bandeja para imprimir comandas. Para salir: clic derecho en el ícono → Salir.' }).show();
      }
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(config.serverUrl);
}

function showMain() {
  if (!config.serverUrl) return openSetupWindow();
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

// ---------- acciones de menú ----------
async function showDetectedPrinters() {
  const lines: string[] = [];
  try {
    const sys = await listSystemPrinters();
    lines.push('IMPRESORAS INSTALADAS EN ESTE EQUIPO', ...(sys.length ? sys.map((p) => `• ${p.name}${p.isDefault ? ' (predeterminada)' : ''}`) : ['(ninguna)']));
  } catch {
    /* sin ventana */
  }
  if (agent) {
    const found = await agent.discover().catch(() => []);
    const others = found.filter((d) => d.type !== 'windows');
    if (others.length) lines.push('', 'PUERTOS DETECTADOS', ...others.map((d) => `• [${d.type}] ${d.name}${d.path ? ` → ${d.path}` : ''}`));
    const st = agent.status();
    lines.push('', `IMPRESORAS ASIGNADAS A ESTE AGENTE (${st.printers.length})`,
      ...(st.printers.length ? st.printers.map((p) => `• ${p.name} — ${PrinterConnectionLabel[p.connection] ?? p.connection}${st.printerErrors[p.id] ? `  ⚠ ${st.printerErrors[p.id]}` : ''}`) : ['(ninguna — asígnalas en Configuración → Impresoras)']));
  } else {
    lines.push('', 'El agente de impresión no está configurado (falta token).');
  }
  lines.push('', 'Para usar una impresora de Windows, copia su nombre exacto en el panel: Configuración → Impresoras → "Impresora instalada en Windows".');
  await dialog.showMessageBox({ type: 'info', title: 'Impresoras detectadas', message: 'Impresoras detectadas', detail: lines.join('\n'), buttons: ['Cerrar'] });
}

async function printTestMenu() {
  const printers: PrinterConfig[] = agent?.status().printers ?? [];
  const buttons = [...printers.slice(0, 8).map((p) => p.name), 'Impresora de Windows (diálogo)', 'Cancelar'];
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Imprimir prueba',
    message: '¿En qué impresora quieres imprimir la prueba?',
    detail: printers.length ? 'Impresoras asignadas al agente de este equipo:' : 'No hay impresoras asignadas al agente; puedes probar con el diálogo de Windows.',
    buttons,
    cancelId: buttons.length - 1,
    noLink: true,
  });
  if (response === buttons.length - 1) return;
  try {
    if (response < Math.min(8, printers.length)) {
      await agent!.printTest(printers[response]);
      new Notification({ title: APP_NAME, body: `Prueba enviada a ${printers[response].name}` }).show();
    } else {
      const doc = buildTestTicket({ printerName: 'Impresora de Windows', connectionLabel: 'Navegador / escritorio', paperWidth: 80, createdAt: new Date().toISOString() });
      await printHtml(renderHtml(doc), { silent: false, paperWidth: 80 });
    }
  } catch (e) {
    dialog.showErrorBox('No se pudo imprimir', (e as Error).message);
  }
}

function setAutoStart(on: boolean) {
  config.autoStart = on;
  saveConfig(config);
  applyAutoStart();
  updateTray();
}
function applyAutoStart() {
  if (!app.isPackaged) return; // en desarrollo registraría el electron.exe genérico
  app.setLoginItemSettings({ openAtLogin: config.autoStart, path: process.execPath });
}

function menuTemplate(): MenuItemConstructorOptions[] {
  return [
    { label: 'Abrir Restaurante Hub', click: showMain },
    { label: 'Recargar', accelerator: 'F5', click: () => mainWindow?.webContents.reloadIgnoringCache() },
    { type: 'separator' },
    { label: 'Configuración…', accelerator: 'CmdOrCtrl+Shift+S', click: openSetupWindow },
    { label: 'Ver impresoras detectadas', click: () => void showDetectedPrinters() },
    { label: 'Imprimir prueba…', click: () => void printTestMenu() },
    { type: 'separator' },
    { label: 'Abrir al iniciar Windows', type: 'checkbox', checked: config.autoStart, click: (mi) => setAutoStart(mi.checked) },
    {
      label: 'Modo kiosco',
      type: 'checkbox',
      checked: config.kiosk,
      accelerator: 'CmdOrCtrl+Shift+K',
      click: (mi) => {
        config.kiosk = mi.checked;
        saveConfig(config);
        mainWindow?.setKiosk(config.kiosk);
        updateTray();
      },
    },
    { label: 'Herramientas de desarrollo', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow?.webContents.toggleDevTools() },
    { label: 'Abrir carpeta de registros', click: () => void shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: `Versión ${app.getVersion()}`, enabled: false },
    { label: 'Salir', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit(); } },
  ];
}

function updateTray() {
  const tip = `${APP_NAME}\n${statusText(agentStatus)}`.slice(0, 127);
  if (!tray) {
    const icon = appIcon();
    tray = new Tray(icon ? icon.resize({ width: 16, height: 16 }) : nativeImage.createEmpty());
    tray.on('click', showMain);
    tray.on('double-click', showMain);
  }
  tray.setToolTip(tip);
  const items = menuTemplate();
  items.splice(1, 0, { label: statusText(agentStatus).split('\n')[0], enabled: false });
  tray.setContextMenu(Menu.buildFromTemplate(items));
  // menú de la ventana (oculto; las teclas rápidas siguen funcionando)
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: APP_NAME, submenu: menuTemplate() }, { role: 'editMenu', label: 'Editar' }]));
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.on('rh:version', (e) => { e.returnValue = app.getVersion(); });

  ipcMain.handle('rh:getAgentStatus', (e) => {
    if (!isTrustedSender(e)) throw new Error('No autorizado');
    return agentStatus ?? (config.agentToken ? null : { state: 'stopped', connected: false, configured: false });
  });
  ipcMain.handle('rh:openSettings', () => { openSetupWindow(); });
  ipcMain.handle('rh:printHtml', async (e, html: unknown, opts: PrintHtmlOptions | undefined) => {
    if (!isTrustedSender(e)) throw new Error('No autorizado');
    if (typeof html !== 'string' || !html) throw new Error('HTML vacío');
    return printHtml(html, opts ?? {});
  });
  ipcMain.handle('rh:listPrinters', async (e) => {
    if (!isTrustedSender(e)) throw new Error('No autorizado');
    return listSystemPrinters(e.sender);
  });
  ipcMain.handle('rh:discover', async (e) => {
    if (!isTrustedSender(e)) throw new Error('No autorizado');
    return agent ? agent.discover() : [];
  });

  // --- ventana de configuración ---
  ipcMain.handle('rh-setup:getConfig', () => ({ ...config, version: app.getVersion(), platform: process.platform }));
  ipcMain.handle('rh-setup:test', async (_e, rawUrl: string) => {
    const base = normalizeUrl(rawUrl).replace(/\/api$/i, '');
    if (!base) return { ok: false, message: 'Escribe la dirección del servidor' };
    try {
      const res = await net.fetch(`${base}/api/health`, { signal: AbortSignal.timeout(8_000), cache: 'no-store' } as RequestInit);
      if (!res.ok) return { ok: false, message: `El servidor respondió ${res.status}` };
      return { ok: true, message: 'Conexión correcta', url: base };
    } catch (err) {
      return { ok: false, message: `No se pudo conectar: ${(err as Error).message}` };
    }
  });
  ipcMain.handle('rh-setup:save', async (_e, input: Partial<DesktopConfig>) => {
    const serverUrl = normalizeUrl(input.serverUrl ?? '');
    if (!serverUrl) throw new Error('La dirección del servidor es obligatoria');
    const prev = config;
    config = {
      serverUrl,
      apiUrl: normalizeUrl(input.apiUrl ?? '') || '',
      agentToken: String(input.agentToken ?? '').trim(),
      autoStart: !!input.autoStart,
      kiosk: !!input.kiosk,
    };
    saveConfig(config);
    applyAutoStart();
    const agentChanged = prev.agentToken !== config.agentToken || effectiveApiUrl(prev) !== effectiveApiUrl(config);
    if (agentChanged) void startAgent();
    updateTray();
    if (prev.serverUrl !== config.serverUrl && mainWindow && !mainWindow.isDestroyed()) {
      // el origen cambió: recrear la ventana para reiniciar los manejadores de navegación
      quittingWindow(mainWindow);
      mainWindow = null;
    }
    createMainWindow();
    setupWindow?.close();
    return { ok: true };
  });
  ipcMain.handle('rh-setup:cancel', () => setupWindow?.close());
}

function quittingWindow(w: BrowserWindow) {
  w.removeAllListeners('close');
  w.destroy();
}

// ---------- actualizaciones ----------
async function setupAutoUpdate() {
  if (!app.isPackaged) return;
  // Sin configuración de publicación (app-update.yml) no hay nada que buscar.
  if (!fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
    logger.info('Auto-actualización desactivada (sin configuración de publicación)');
    return;
  }
  try {
    // require (CJS) para que funcione igual dentro del asar
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');
    autoUpdater.logger = { info: logger.info, warn: logger.warn, error: logger.error, debug: () => {} } as never;
    autoUpdater.autoDownload = true;
    autoUpdater.on('error', (err) => logger.warn(`Actualización: ${err?.message ?? err}`));
    autoUpdater.on('update-downloaded', (info) => {
      new Notification({ title: APP_NAME, body: `Versión ${info.version} lista. Se instalará al cerrar la app.` }).show();
    });
    await autoUpdater.checkForUpdates();
    setInterval(() => void autoUpdater.checkForUpdates().catch(() => undefined), 6 * 60 * 60 * 1000);
  } catch (e) {
    logger.warn(`No se pudo buscar actualizaciones: ${(e as Error).message}`);
  }
}

// ---------- ciclo de vida ----------
app.on('second-instance', () => showMain());
app.on('before-quit', () => {
  quitting = true;
});
app.on('window-all-closed', () => {
  // con agente activo seguimos en la bandeja
  if (!config.agentToken || quitting) app.quit();
});
app.on('will-quit', (e) => {
  if (agent) {
    e.preventDefault();
    const a = agent;
    agent = null;
    void a.stop().finally(() => app.exit(0));
  }
});
process.on('uncaughtException', (e) => logger.error(`uncaughtException: ${e.stack ?? e.message}`));
process.on('unhandledRejection', (e) => logger.error(`unhandledRejection: ${(e as Error)?.message ?? e}`));

void app.whenReady().then(async () => {
  config = loadConfig();
  logger.info(`Iniciando ${APP_NAME} ${app.getVersion()} (${process.platform})`);
  registerIpc();
  updateTray();
  applyAutoStart();
  if (!config.serverUrl) openSetupWindow();
  else createMainWindow();
  void startAgent();
  void setupAutoUpdate();
});
