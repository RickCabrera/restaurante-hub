// Configuración del agente: variables de entorno, --config <archivo> o ~/.restaurante-hub/agent.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AgentFileConfig {
  apiUrl?: string;
  token?: string;
  name?: string;
}

export function defaultConfigPath(): string {
  return path.join(os.homedir(), '.restaurante-hub', 'agent.json');
}

export function readConfigFile(file: string): AgentFileConfig {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as AgentFileConfig;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`No se pudo leer ${file}: ${(e as Error).message}`);
  }
}

/** Prioridad: variables de entorno > archivo indicado > archivo por defecto. */
export function loadConfig(file?: string, env: NodeJS.ProcessEnv = process.env): AgentFileConfig & { source: string } {
  const f = file || env.RH_AGENT_CONFIG || defaultConfigPath();
  const fromFile = readConfigFile(f);
  return {
    apiUrl: env.RH_API_URL || fromFile.apiUrl,
    token: env.RH_AGENT_TOKEN || fromFile.token,
    name: env.RH_AGENT_NAME || fromFile.name,
    source: f,
  };
}

export function saveConfig(cfg: AgentFileConfig, file = defaultConfigPath()): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return file;
}
