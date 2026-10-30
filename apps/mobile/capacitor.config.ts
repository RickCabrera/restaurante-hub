import type { CapacitorConfig } from '@capacitor/cli';

// La app web se empaqueta dentro del APK (webDir = www, copiado desde apps/web/dist).
// La URL de la API se configura en tiempo de ejecución: la app web lee localStorage['rh.apiUrl']
// (pantalla de configuración inicial de la web). No se necesita recompilar para cambiar de servidor.
const config: CapacitorConfig = {
  appId: 'mx.restaurantehub.app',
  appName: 'Restaurante Hub',
  webDir: 'www',
  android: {
    // Permite llamar a servidores http:// en la red local (p. ej. API local o pruebas)
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: process.env.RH_ANDROID_DEBUG === '1',
  },
  server: {
    androidScheme: 'https',
    // Permitir navegación a cualquier host https (servidor configurable)
    allowNavigation: ['*'],
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    KeepAwake: {},
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#f97316',
    },
    BluetoothLe: {
      displayStrings: {
        scanning: 'Buscando impresoras…',
        cancel: 'Cancelar',
        availableDevices: 'Dispositivos disponibles',
        noDeviceFound: 'No se encontraron impresoras',
      },
    },
  },
};

export default config;
