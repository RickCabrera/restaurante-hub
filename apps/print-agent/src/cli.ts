#!/usr/bin/env node
// rh-print-agent — agente de impresión de Restaurante Hub.
//
//   rh-print-agent [start] [--config archivo.json]
//   rh-print-agent discover
//   rh-print-agent test --host 192.168.1.50 [--port 9100] [--paper 58] [--star]
//   rh-print-agent test --device /dev/usb/lp0
//   rh-print-agent test --windows "EPSON TM-T20"
//   rh-print-agent test --serial COM3 [--baud 9600]
//   rh-print-agent setup
import readline from 'node:readline/promises';
import type { PrinterConfig } from '@rh/shared';
import { createPrintAgent, normalizeApiUrl, agentVersion } from './agent';
import { createConsoleLogger } from './logger';
import { defaultConfigPath, loadConfig, readConfigFile, saveConfig } from './config';
import { discoverPrinters } from './discover';

const log = createConsoleLogger('print-agent');

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  return { cmd: positional[0] ?? 'start', positional, flags };
}

const str = (v: string | true | undefined) => (typeof v === 'string' ? v : undefined);

const HELP = `Restaurante Hub · agente de impresión v${agentVersion()}

Uso:
  rh-print-agent [start] [--config archivo.json]   Conecta con el servidor e imprime
  rh-print-agent setup                             Configura URL y token (interactivo)
  rh-print-agent discover                          Lista impresoras detectadas en este equipo
  rh-print-agent test --host 192.168.1.50 [--port 9100]
  rh-print-agent test --device /dev/usb/lp0
  rh-print-agent test --windows "EPSON TM-T20"
  rh-print-agent test --serial COM3 [--baud 9600]
      Opciones de test: --paper 58|80  --star  --no-cut  --drawer

Configuración (en orden de prioridad):
  variables RH_API_URL y RH_AGENT_TOKEN · --config <archivo> · ${defaultConfigPath()}
`;

async function cmdStart(flags: Record<string, string | true>) {
  const cfg = loadConfig(str(flags.config));
  if (!cfg.apiUrl || !cfg.token) {
    log.error(`Falta configuración (URL y token). Ejecuta "rh-print-agent setup" o define RH_API_URL y RH_AGENT_TOKEN. Archivo buscado: ${cfg.source}`);
    process.exit(2);
  }
  log.info(`Restaurante Hub · agente de impresión v${agentVersion()} · ${process.platform}`);
  const agent = createPrintAgent({ apiUrl: cfg.apiUrl, token: cfg.token, name: cfg.name, kind: 'agent', logger: log });
  const shutdown = async (sig: string) => {
    log.info(`Recibido ${sig}; terminando trabajos en curso…`);
    await agent.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (e) => log.error(`Error no controlado: ${(e as Error)?.message ?? e}`));
  await agent.start();
  const found = agent.status().discovered;
  if (found.length) log.info(`Impresoras detectadas: ${found.map((d) => `${d.name}${d.path ? ` (${d.path})` : ''}`).join(' · ')}`);
}

async function cmdDiscover() {
  const list = await discoverPrinters();
  if (!list.length) {
    log.warn('No se detectaron impresoras locales. Las impresoras de red no se detectan: configúralas con su IP.');
    return;
  }
  for (const p of list) console.log(`  [${p.type}] ${p.name}${p.path ? `  →  ${p.path}` : ''}`);
}

async function cmdTest(flags: Record<string, string | true>) {
  const paper = str(flags.paper) === '58' ? 58 : 80;
  const base: Omit<PrinterConfig, 'connection'> = {
    id: 'local-test',
    name: 'Prueba local',
    dialect: flags.star ? 'STAR' : 'ESC_POS',
    paperWidth: paper,
    copies: 1,
    cutPaper: !flags['no-cut'],
    openDrawer: !!flags.drawer,
  };
  let printer: PrinterConfig;
  if (str(flags.host)) printer = { ...base, connection: 'NETWORK', host: str(flags.host), port: Number(str(flags.port) ?? 9100), name: `Red ${str(flags.host)}` };
  else if (str(flags.device)) printer = { ...base, connection: 'USB_DEVICE', devicePath: str(flags.device), name: `USB ${str(flags.device)}` };
  else if (str(flags.windows)) printer = { ...base, connection: 'WINDOWS_PRINTER', windowsName: str(flags.windows), name: str(flags.windows)! };
  else if (str(flags.serial)) printer = { ...base, connection: 'SERIAL', devicePath: str(flags.serial), baudRate: Number(str(flags.baud) ?? 9600), name: `Serial ${str(flags.serial)}` };
  else {
    log.error('Indica la impresora: --host IP | --device /dev/usb/lp0 | --windows "Nombre" | --serial COM3');
    process.exit(2);
  }
  const agent = createPrintAgent({ apiUrl: 'http://localhost', token: 'local', logger: log });
  log.info(`Enviando ticket de prueba a ${printer.name}…`);
  try {
    await agent.printTest(printer);
    log.info('✓ Ticket de prueba enviado. Si no salió, revisa papel, cable/IP y el dialecto (ESC/POS vs STAR).');
  } catch (e) {
    log.error(`✗ ${(e as Error).message}`);
    process.exit(1);
  }
}

async function cmdSetup(flags: Record<string, string | true>) {
  const file = str(flags.config) || defaultConfigPath();
  const current = readConfigFile(file);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Configuración del agente de impresión de Restaurante Hub\n');
    const ask = async (q: string, def?: string) => {
      const a = (await rl.question(`${q}${def ? ` [${def}]` : ''}: `)).trim();
      return a || def || '';
    };
    const apiUrl = normalizeApiUrl(await ask('URL del servidor (ej. https://mi-restaurante.up.railway.app)', current.apiUrl));
    console.log('El token se crea en el panel: Configuración → Impresoras → Agentes → "Nuevo agente".');
    const token = await ask('Token del agente', current.token ? `${current.token.slice(0, 6)}…` : undefined);
    const name = await ask('Nombre de este equipo', current.name || (await import('node:os')).hostname());
    const finalToken = current.token && token === `${current.token.slice(0, 6)}…` ? current.token : token;
    if (!apiUrl || !finalToken) throw new Error('La URL y el token son obligatorios');
    // prueba de conectividad
    try {
      const res = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(8_000) });
      console.log(res.ok ? '✓ Servidor accesible' : `⚠ El servidor respondió ${res.status}`);
    } catch (e) {
      console.log(`⚠ No se pudo contactar al servidor (${(e as Error).message}). Se guarda de todos modos.`);
    }
    const saved = saveConfig({ apiUrl, token: finalToken, name }, file);
    console.log(`\nGuardado en ${saved}\nInicia el agente con: rh-print-agent start`);
  } finally {
    rl.close();
  }
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h || cmd === 'help') return console.log(HELP);
  if (flags.version || flags.v || cmd === 'version') return console.log(agentVersion());
  switch (cmd) {
    case 'start': return cmdStart(flags);
    case 'discover': return cmdDiscover();
    case 'test': return cmdTest(flags);
    case 'setup': return cmdSetup(flags);
    default:
      console.log(HELP);
      process.exit(2);
  }
}

main().catch((e) => {
  log.error((e as Error).message ?? String(e));
  process.exit(1);
});
