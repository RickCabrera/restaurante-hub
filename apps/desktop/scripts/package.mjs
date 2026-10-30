// Empaqueta la app de escritorio con electron-builder a partir de una carpeta "stage"
// con dependencias reales (pnpm deploy, node_modules planos).
//
//   node scripts/package.mjs --win      → release/RestauranteHub-Setup-x.y.z.exe
//   node scripts/package.mjs --linux    → release/*.AppImage
//   (extra) --publish always|never (default never)
//
// Requisitos previos: compilar @rh/shared, @rh/printing, @rh/print-agent y @rh/desktop (pnpm build).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, '..');
const repoRoot = path.join(appDir, '..', '..');
const stage = path.join(appDir, '.stage');
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const target = args.includes('--linux') ? ['--linux', 'AppImage'] : ['--win', 'nsis'];
const pubIdx = args.indexOf('--publish');
const publish = pubIdx >= 0 ? args[pubIdx + 1] : 'never';

const run = (cmd, cwd = repoRoot) => {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } });
};

if (!fs.existsSync(path.join(appDir, 'dist', 'main.js'))) {
  console.error('Falta dist/main.js: ejecuta "pnpm --filter @rh/desktop build" primero.');
  process.exit(1);
}

// 1) Copia de producción con dependencias planas
fs.rmSync(stage, { recursive: true, force: true });
run(`pnpm --filter @rh/desktop deploy --prod --legacy --config.node-linker=hoisted "${stage}"`);
// pnpm (node-linker=hoisted) deja una carpeta .bin residual relativa al paquete: se elimina
fs.rmSync(path.join(appDir, 'apps'), { recursive: true, force: true });

// 2) Archivos de la app (el ícono se genera si falta: build/ no se versiona)
if (!fs.existsSync(path.join(appDir, 'build', 'icon.png'))) run('node scripts/gen-icon.mjs', appDir);
for (const rel of ['dist', 'src/setup', 'resources', 'build', 'electron-builder.yml']) {
  const from = path.join(appDir, rel);
  if (!fs.existsSync(from)) continue;
  fs.rmSync(path.join(stage, rel), { recursive: true, force: true });
  fs.cpSync(from, path.join(stage, rel), { recursive: true });
}

// 3) electron-builder sobre el stage
const electronVersion = require(path.join(appDir, 'node_modules', 'electron', 'package.json')).version;
const builderCli = require.resolve('electron-builder/cli.js', { paths: [appDir] });
const output = path.join(appDir, 'release');
run(
  [
    `node "${builderCli}"`,
    ...target,
    `--projectDir "${stage}"`,
    `--publish ${publish}`,
    `-c.electronVersion=${electronVersion}`,
    `-c.directories.output="${output}"`,
  ].join(' '),
  stage,
);
console.log(`\nListo → ${output}`);
