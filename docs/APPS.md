# Apps nativas: escritorio (.exe) y Android (.apk)

Las dos apps usan **la misma app web** (PWA) y cambian cómo se carga e imprime:

| | Escritorio Windows (Electron) | Android (Capacitor) |
|---|---|---|
| Carga la web | Desde el servidor (URL configurable) | Empaquetada dentro del APK |
| URL del servidor | Ventana de configuración local | `localStorage['rh.apiUrl']` (pantalla “Conectar servidor” de la web) |
| Impresión | Agente integrado: red, USB/Windows, COM. Y HTML **sin diálogo** | Bluetooth ESC/POS y HTML |
| Extras | Bandeja del sistema, inicio con Windows, modo kiosco, auto-actualización | Pantalla siempre encendida, vibración, notificaciones, modo kiosco |

Ambas se generan en GitHub Actions (`.github/workflows/release-desktop.yml` y `release-android.yml`). Se ejecutan con **Run workflow** o al crear un tag `v1.2.3`, y dejan el instalador como *artifact* (y en el Release si es tag).

---

## App de escritorio (Windows .exe)

### Instalar
1. Descarga `RestauranteHub-Setup-x.y.z.exe` (Actions → *Release escritorio* → artifact, o la página de Releases).
2. Ejecútalo. Windows SmartScreen puede advertir que el instalador no está firmado: *Más información → Ejecutar de todas formas*. Puedes elegir la carpeta de instalación. Se crean accesos directos en el escritorio y en el menú Inicio.

### Primer arranque
Se abre la ventana **Configuración de este equipo**:
- **Dirección del sistema**: la URL con la que entras desde el navegador, p. ej. `https://mi-restaurante.up.railway.app`. El botón **Probar** consulta `/api/health`. En *Opciones avanzadas* puedes poner una URL de API distinta si la API vive en otro dominio.
- **Token del agente de impresión** (opcional): créalo en **Configuración → Impresoras → Agentes**. Con token, esta PC imprime en impresoras de red, USB/instaladas en Windows y COM, aunque la ventana esté cerrada (sigue en la bandeja).
- **Abrir al iniciar Windows** y **Modo kiosco**.

Después abre el sistema. Para volver a configurar: ícono de la bandeja (junto al reloj) → **Configuración…** (o `Ctrl+Shift+S`).

### Menú de la bandeja
Abrir · Estado del agente · Recargar (`F5`) · Configuración · **Ver impresoras detectadas** (nombres exactos de las impresoras de Windows para copiarlos al panel) · **Imprimir prueba** · Abrir al iniciar Windows · Modo kiosco (`Ctrl+Shift+K`) · Carpeta de registros · Salir.

Al cerrar la ventana con el agente activo, la app **sigue en la bandeja** imprimiendo. Para salir: clic derecho → **Salir**.

### Modo kiosco (caja/cocina)
Activa *Modo kiosco* en la configuración: pantalla completa sin barras. Para salir usa `Ctrl+Shift+K` o la bandeja. Combínalo con **Abrir al iniciar Windows** y el inicio de sesión automático de Windows (`netplwiz`) para que la PC arranque directo en el sistema.

### API para la web (`window.rhDesktop`)
```ts
window.rhDesktop = {
  isDesktop: true,
  version: string,
  platform: string,                       // 'win32' | 'linux' | 'darwin'
  getAgentStatus(): Promise<AgentStatus | null>,
  onAgentStatus(cb): () => void,          // suscripción; devuelve cancelar
  openSettings(): Promise<void>,
  printHtml(html, { silent?: boolean = true, deviceName?: string, paperWidth?: 58|80, copies?: number }): Promise<{ ok: true }>,
  listPrinters(): Promise<{ name, displayName, description, isDefault }[]>,
  discoverPrinters(): Promise<{ name, type, path? }[]>,
}
```
Solo está disponible para páginas del servidor configurado. La web lo usa en `src/platform/*`.

### Compilar localmente
```bash
pnpm install                                   # en Windows, con el binario de Electron
pnpm --filter @rh/shared build && pnpm --filter @rh/printing build && pnpm --filter @rh/print-agent build
pnpm --filter @rh/desktop build
pnpm --filter @rh/desktop start                # ejecutar en desarrollo
cd apps/desktop && node scripts/package.mjs --win    # → apps/desktop/release/RestauranteHub-Setup-x.y.z.exe
                                                     #   (--linux → AppImage)
```
`scripts/package.mjs` hace `pnpm deploy` a una carpeta `.stage` con `node_modules` planos y ejecuta electron-builder ahí, porque electron-builder no sigue bien los enlaces del workspace pnpm. El ícono se genera con `node scripts/gen-icon.mjs`, que no tiene dependencias.

**Firma de código** (opcional, quita la advertencia de SmartScreen): agrega los secretos `CSC_LINK` (certificado .pfx en base64) y `CSC_KEY_PASSWORD`.

**Auto-actualización**: `electron-updater` está integrado, pero está desactivado mientras `publish: null` en `electron-builder.yml`. Para activarlo, configura `publish: { provider: github, owner, repo }` (o `generic` con una URL) y publica los Releases con `latest.yml`.

---

## App Android (.apk)

### Instalar
1. Descarga `RestauranteHub.apk` (firmado) o `RestauranteHub-debug.apk` desde Actions → *Release Android*.
2. En la tablet, permite *Instalar apps desconocidas* para el navegador o el gestor de archivos y abre el APK.
3. Al abrirla por primera vez, la app pide la **dirección del servidor** (se guarda en `localStorage['rh.apiUrl']`). Después inicia sesión o empareja la tablet como siempre.

> La web viene dentro del APK. Para recibir cambios de la web hay que **instalar un APK nuevo**. El servidor (API) puede actualizarse sin tocar el APK.

### Impresión Bluetooth
1. Empareja la impresora en *Ajustes → Bluetooth* (PIN típico `0000`/`1234`).
2. En el panel crea la impresora con conexión **Bluetooth (app Android)**. La MAC es opcional: si la dejas vacía, cada tablet elige la suya.
3. En la tablet: **Este dispositivo imprime en…** → marca la impresora → elige el dispositivo Bluetooth.
4. Acepta el permiso **Dispositivos cercanos** (Android 12+) o **Ubicación** (Android ≤ 11).

Se usa Bluetooth clásico (SPP), que usan casi todas las térmicas portátiles. Si la impresora es solo BLE, la app usa BLE automáticamente.

### Modo kiosco en tablets
- **Fijar pantalla (screen pinning)**: *Ajustes → Seguridad → Fijar aplicación*. Abre la app, toca *Recientes*, el ícono de la app y luego **Fijar**. Para salir mantén *Atrás + Recientes* (puede pedir PIN).
- La app mantiene la **pantalla encendida** en las vistas de cocina, caja y área (`KeepAwake`). Pon el brillo fijo y desactiva el ahorro de batería para la app (*Ajustes → Batería → Sin restricciones*) para que no se desconecte en segundo plano.
- **Alternativa sin APK**: [Fully Kiosk Browser](https://www.fully-kiosk.com) apuntando a la URL web del sistema. Ofrece modo kiosco completo, arranque automático y pantalla encendida, pero **no tiene impresión Bluetooth ESC/POS**: úsalo con impresoras de red atendidas por un agente o con impresión tipo navegador.
- Para varias tablets administradas, Android Enterprise / MDM (*lock task mode*) permite un kiosco estricto.

### Compilar localmente
Requisitos: Node 22, pnpm 10, JDK 17 y Android Studio (o Android SDK con `ANDROID_HOME`).
```bash
pnpm install
pnpm --filter @rh/shared build && pnpm --filter @rh/printing build
pnpm --filter @rh/web build
cd apps/mobile
node scripts/copy-web.mjs                     # apps/web/dist → www
npx cap add android                           # solo la primera vez (android/ no se versiona)
node scripts/patch-android.mjs                # permisos Bluetooth/ubicación/notificaciones, cleartext, orientación
npx cap sync android
cd android && ./gradlew assembleDebug         # → app/build/outputs/apk/debug/app-debug.apk
# o: npx cap open android  (Android Studio → Build → Build APK)
```
Depuración remota: `RH_ANDROID_DEBUG=1 npx cap sync android` y abre `chrome://inspect` en la PC con la tablet conectada por USB.

### Firmar el release
1. Genera un keystore una sola vez y **guárdalo en un lugar seguro**. Si lo pierdes no podrás actualizar la app instalada:
   ```bash
   keytool -genkey -v -keystore restaurante-hub.keystore -alias rh -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Localmente:
   ```bash
   export RH_KEYSTORE_PATH=$PWD/restaurante-hub.keystore RH_KEYSTORE_PASSWORD=... RH_KEY_ALIAS=rh RH_KEY_PASSWORD=...
   cd apps/mobile/android && ./gradlew assembleRelease
   ```
   `patch-android.mjs` agrega a `app/build.gradle` la firma que lee esas variables.
3. En CI agrega los secretos `ANDROID_KEYSTORE_BASE64` (`base64 -w0 restaurante-hub.keystore`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`. Sin ellos, CI genera solo el APK debug.

Variables opcionales del build web en CI (*Settings → Variables*): `VITE_API_URL` (precarga el servidor), `VITE_GOOGLE_MAPS_API_KEY` y `VITE_BUSINESS_SLUG`.
