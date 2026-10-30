# Impresión de comandas y tickets

Restaurante Hub imprime comandas de cocina/barra, tickets de cliente y repartidor, cuentas, cortes de caja y listas de compras en **impresoras térmicas de 58 u 80 mm**. Cualquier escenario se configura desde el panel: **Configuración → Impresoras**.

## Cómo funciona

1. El servidor (API) genera un documento de impresión (`PrintDocument`, JSON) y crea un trabajo por impresora.
2. El trabajo se envía por WebSocket al **cliente de impresión** que atiende esa impresora:
   - **Agente de impresión** (`rh-print-agent`, Node) en una PC o Raspberry Pi del restaurante, o la **app de escritorio** (.exe), que lo trae integrado.
   - **App Android**, para impresoras **Bluetooth**.
   - **Navegador** (o la app de escritorio/Android), para impresoras tipo **navegador**.
3. El cliente lo convierte a bytes ESC/POS o STAR (o a HTML si es tipo navegador), imprime y confirma (`PRINTED` / `FAILED`).
4. Si el cliente está desconectado, los trabajos se quedan **pendientes** y se imprimen al reconectar (hasta 24 h). Si no llega la confirmación, el servidor los reenvía. El cliente ignora un trabajo que ya imprimió, así que un reenvío no sale dos veces.

Las conexiones son **salientes**: no hace falta abrir puertos en el router del restaurante.

## Escenarios

| Escenario | Conexión en el panel | Qué instalar | Qué configurar |
|---|---|---|---|
| **Impresora de red** (Ethernet/Wi-Fi) | `Red (IP)` | App de escritorio con token **o** agente en cualquier PC/Raspberry de la misma red | IP fija de la impresora y puerto (normalmente **9100**) |
| **USB en Raspberry Pi / Linux** | `USB directo (Linux/Raspberry)` | Agente en la Raspberry (`install-raspberry.sh`) | Ruta del dispositivo, p. ej. `/dev/usb/lp0` |
| **Impresora instalada en Windows** (USB, LPT, compartida) | `Impresora instalada en Windows` | App de escritorio con token **o** agente en esa PC | Nombre **exacto** de la impresora en Windows (p. ej. `EPSON TM-T20II Receipt`) o compartida `\\PC-CAJA\Termica` |
| **Puerto serial / COM** | `Puerto serial / COM` | App de escritorio **o** agente (incluye `serialport`) | Puerto (`COM3`, `/dev/ttyUSB0`) y velocidad (9600 por defecto, a veces 19200 o 115200) |
| **Bluetooth desde tablet/celular Android** | `Bluetooth (app Android)` | App Android (.apk) | Emparejar la impresora en Ajustes de Android. En la app: “Este dispositivo imprime en…” y elegir la impresora Bluetooth |
| **Navegador** (sin instalar nada) | `Navegador (sin agente)` | Nada. Cualquier navegador con la sesión abierta | En ese navegador: “Este dispositivo imprime en…”. Sale el diálogo de impresión. En la app de escritorio imprime **sin diálogo** |
| **Pantalla de cocina (KDS)** | `Pantalla de cocina (no imprime)` | Tablet o pantalla con la app | Asignar el área. Las comandas se muestran en pantalla |

Opciones comunes de cada impresora: **ancho de papel** (58 mm = 32 caracteres, 80 mm = 48 caracteres), **dialecto** (`ESC/POS` para Epson y compatibles: Xprinter, 3nStar, Ec Line, Bixolon, genéricas. `STAR` para Star TSP100/143/650, SP700), **copias**, **corte automático**, **abrir cajón** y **área** de producción.

### Elegir el agente

- Si la PC de caja tiene Windows, instala la **app de escritorio** y pega el token del agente. Imprime a red, USB/Windows y COM mientras esté abierta (se queda en la bandeja junto al reloj).
- Para una cocina sin PC, usa una **Raspberry Pi** con el agente como servicio y la impresora de red o USB.
- **Una impresora la atiende un solo agente.** Asigna el agente a cada impresora en el panel.

## Instalación del agente

Primero crea el token en **Configuración → Impresoras → Agentes → Nuevo agente**. Cópialo, porque solo se muestra una vez.

### App de escritorio (Windows)
Instala `RestauranteHub-Setup-x.y.z.exe`. En el primer arranque pide la dirección del sistema y el token (opcional). Ver [APPS.md](./APPS.md).

### Raspberry Pi / Linux
```bash
git clone <repo> restaurante-hub && cd restaurante-hub
sudo bash apps/print-agent/deploy/install-raspberry.sh https://mi-restaurante.up.railway.app TOKEN
journalctl -u restaurante-hub-agent -f      # ver logs
```
El script instala Node 22, compila, copia a `/opt/restaurante-hub-agent`, crea el usuario `rhagent` (grupos `lp` y `dialout`) y registra el servicio systemd `restaurante-hub-agent`.

### Windows sin la app (servicio)
PowerShell como administrador, desde la raíz del repo:
```powershell
powershell -ExecutionPolicy Bypass -File apps\print-agent\deploy\install-windows.ps1 -ApiUrl https://mi-restaurante.up.railway.app -Token TOKEN -Mode Nssm
```
- `-Mode Nssm`: es un servicio de Windows ([NSSM](https://nssm.cc)). Arranca sin iniciar sesión. Corre como *LocalSystem*, que **puede no ver impresoras compartidas por red**. En ese caso configura una cuenta de usuario con `nssm edit RestauranteHubAgent` → *Log on*.
- `-Mode Task`: es una tarea programada al iniciar sesión. Ve las mismas impresoras que el usuario, pero alguien tiene que iniciar sesión (puedes activar el inicio de sesión automático).

### PM2 (cualquier sistema)
```bash
npm i -g pm2
pm2 start apps/print-agent/deploy/pm2.config.cjs && pm2 save && pm2 startup
```

### Línea de comandos
```
rh-print-agent setup                              # pide URL y token, guarda ~/.restaurante-hub/agent.json
rh-print-agent start                              # (por defecto) conecta e imprime
rh-print-agent discover                           # lista impresoras de Windows, /dev/usb/lp*, CUPS y puertos COM
rh-print-agent test --host 192.168.1.50 [--port 9100]
rh-print-agent test --device /dev/usb/lp0
rh-print-agent test --windows "EPSON TM-T20II Receipt"
rh-print-agent test --serial COM3 [--baud 9600]
      opciones: --paper 58  --star  --no-cut  --drawer
```
Configuración por variables `RH_API_URL`, `RH_AGENT_TOKEN` (y opcional `RH_AGENT_NAME`, `RH_AGENT_CONFIG`). `RH_DEBUG=1` muestra más detalle. `test` imprime **sin pasar por el servidor**, así que sirve para descartar problemas de red o configuración.

## Solución de problemas

| Síntoma | Qué revisar |
|---|---|
| **No imprime una impresora de red** | Imprime la hoja de autoprueba de la impresora (manteniendo FEED al encender) para ver su IP. Haz `ping` a esa IP desde la PC del agente. Prueba con `rh-print-agent test --host IP`. El puerto casi siempre es **9100**. |
| **Funcionaba y dejó de imprimir** | La impresora cambió de IP por DHCP. Asígnale una **IP fija**: desde su utilidad web/Windows o reservando la IP en el router por su MAC. Actualiza la IP en el panel. |
| **“Tiempo agotado”** | La impresora está apagada, sin papel, con la tapa abierta o en otra red/VLAN. Algunas impresoras Wi-Fi se duermen: desactiva el ahorro de energía. |
| **“La impresora rechazó la conexión”** | El puerto es incorrecto o otro programa tiene la conexión abierta. Cierra otros sistemas que usen la impresora. |
| **USB `/dev/usb/lp0` sin permiso** | `sudo usermod -aG lp rhagent` y reinicia el servicio. Si dice *ocupado*, CUPS tiene la impresora: quítala de CUPS. Con varias impresoras USB el número (`lp0`, `lp1`) puede cambiar al reiniciar; usa `rh-print-agent discover`. |
| **Impresora de Windows “no se encontró”** | El nombre debe ser **idéntico** al de *Configuración → Impresoras y escáneres* (cópialo de “Ver impresoras detectadas” en la app). Si es compartida usa `\\PC\NombreCompartido`. Como servicio NSSM, usa una cuenta de usuario. |
| **Salen símbolos raros en vez de acentos o ñ** | El ticket usa la página de códigos **CP858** (incluye €). Algunas impresoras genéricas tienen otra tabla por defecto. Haz la prueba de impresión y, si la ñ sale mal, configura la impresora en **PC858/PC850** con su utilidad. Si no tiene esa tabla, los acentos salen sin tilde. |
| **Salen letras/códigos al inicio o el texto sale como basura** | El **dialecto** es incorrecto: Star en modo *Star Line* requiere `STAR`. Star en modo *ESC/POS* y las demás usan `ESC/POS`. |
| **No corta el papel** | Activa “Corte automático”. Algunas impresoras de 58 mm no tienen cortador: desactívalo para que no impriman basura. |
| **El cajón de dinero no abre** | El cajón se conecta a la **impresora** (RJ11/RJ12), no a la PC. Activa “Abrir cajón” en la impresora de caja. Usa pulso del pin 2 (`ESC p 0`); si tu cajón usa el pin 5 contacta a soporte. |
| **Impresora Bluetooth no aparece** | Emparéjala primero en *Ajustes → Bluetooth* de Android (PIN típico `0000` o `1234`). Concede el permiso “Dispositivos cercanos” a la app. Solo **una** tablet puede conectarse a la vez. |
| **Navegador: siempre sale el diálogo** | Es normal en navegadores. En Chrome puedes usar `--kiosk-printing`. La app de escritorio imprime sin diálogo. Configura la impresora predeterminada con papel de 80/58 mm y **márgenes: ninguno**. |
| **QR no aparece** | Las impresoras muy viejas no soportan QR nativo (GS ( k). El texto del ticket sale igual. |

En el panel, **Configuración → Impresoras** muestra el estado de cada agente (en línea / fuera de línea), la cola de trabajos, los errores y botones para **Imprimir prueba** y **Reimprimir**.

## Detalles técnicos

- Renderizadores en `packages/printing`: `renderEscPos(doc, {dialect, codepage, cut, openDrawer, copies})` produce `Uint8Array` y `renderHtml(doc)` produce un documento HTML (`@page 58/80mm`, QR SVG). No dependen de Node; se usan también en la web y en Android.
- Protocolo Socket.IO (`packages/shared/src/print-protocol.ts`): `agent.hello`, `print.pull`, `print.job`, `print.ack`, `printers.changed`, `printclient.register`, `printers.discovered`.
- Comandos: init `ESC @`, página de códigos `ESC t 19` (CP858) / `ESC GS t 4` (Star), negrita `ESC E`, tamaño `GS !`, invertido `GS B`, QR `GS ( k` (modelo 2, nivel M) / `ESC GS y` (Star), código de barras `GS k`, corte `GS V 65/66 0` / `ESC d 2/3` (Star), cajón `ESC p 0 25 250` / `BEL` (Star), zumbador `ESC ( A` / `ESC GS BEL` (Star).
- Windows RAW: el agente escribe los bytes a un archivo temporal y llama `winspool.drv` (`OpenPrinter` → `StartDocPrinter("RAW")` → `WritePrinter`) mediante PowerShell + `Add-Type`. No requiere módulos nativos.
