#!/usr/bin/env bash
# Instala el agente de impresión de Restaurante Hub en Raspberry Pi OS / Debian / Ubuntu.
#
# Uso (desde la raíz del repositorio clonado):
#   sudo bash apps/print-agent/deploy/install-raspberry.sh https://mi-restaurante.up.railway.app TOKEN_DEL_AGENTE
#
# Qué hace: instala Node.js 22 si falta, compila el agente, lo copia a /opt/restaurante-hub-agent,
# crea el usuario "rhagent" (grupos lp y dialout), guarda /etc/restaurante-hub/agent.json
# y registra el servicio systemd "restaurante-hub-agent".
set -euo pipefail

API_URL="${1:-${RH_API_URL:-}}"
TOKEN="${2:-${RH_AGENT_TOKEN:-}}"
INSTALL_DIR=/opt/restaurante-hub-agent
CONF_DIR=/etc/restaurante-hub
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [[ $EUID -ne 0 ]]; then echo "Ejecuta con sudo"; exit 1; fi
if [[ -z "$API_URL" ]]; then read -rp "URL del servidor (https://...): " API_URL; fi
if [[ -z "$TOKEN" ]]; then read -rp "Token del agente (Configuración → Impresoras → Agentes): " TOKEN; fi

echo "==> Node.js"
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
command -v pnpm >/dev/null || npm install -g pnpm@10

echo "==> Compilando"
cd "$REPO_ROOT"
pnpm install --filter @rh/print-agent... --frozen-lockfile
pnpm --filter @rh/shared build
pnpm --filter @rh/printing build
pnpm --filter @rh/print-agent build

echo "==> Empaquetando en $INSTALL_DIR"
rm -rf "$INSTALL_DIR"
# "pnpm deploy" copia el paquete con sus dependencias reales (sin enlaces al workspace)
pnpm --filter @rh/print-agent deploy --prod --legacy "$INSTALL_DIR" 2>/dev/null || pnpm --filter @rh/print-agent deploy --prod "$INSTALL_DIR"
cp -r apps/print-agent/dist "$INSTALL_DIR/" 2>/dev/null || true

echo "==> Usuario y permisos"
id rhagent >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin rhagent
usermod -aG lp,dialout rhagent
mkdir -p "$CONF_DIR"
cat > "$CONF_DIR/agent.json" <<JSON
{ "apiUrl": "$API_URL", "token": "$TOKEN", "name": "$(hostname)" }
JSON
chown -R rhagent:rhagent "$CONF_DIR"
chmod 600 "$CONF_DIR/agent.json"

# Si CUPS tiene tomada la impresora USB, el agente no puede escribir a /dev/usb/lp0
if systemctl is-active --quiet cups 2>/dev/null; then
  echo "AVISO: CUPS está activo. Si usas USB directo y falla con 'ocupado', quita la impresora de CUPS."
fi

echo "==> Servicio systemd"
cp "$SCRIPT_DIR/restaurante-hub-agent.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now restaurante-hub-agent
sleep 2
systemctl --no-pager status restaurante-hub-agent | head -n 15 || true
echo
echo "Listo. Logs: journalctl -u restaurante-hub-agent -f"
echo "Impresión de prueba USB: sudo -u rhagent node $INSTALL_DIR/dist/cli.js test --device /dev/usb/lp0"
