// Ajusta el proyecto Android generado por "npx cap add android":
//  - permisos: Bluetooth (clásico y BLE), ubicación (requerida para escanear en Android ≤ 11),
//    internet, wake lock y notificaciones
//  - android:usesCleartextTraffic="true" (servidores/impresoras http en la LAN)
//  - orientación libre (tablets horizontales y celulares verticales)
// Idempotente: se puede correr varias veces.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const androidDir = path.resolve(here, '..', 'android');
const manifestPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.error(`No existe ${manifestPath}. Ejecuta primero: npx cap add android`);
  process.exit(1);
}

let xml = fs.readFileSync(manifestPath, 'utf8');

const permissions = [
  ['android.permission.INTERNET'],
  ['android.permission.ACCESS_NETWORK_STATE'],
  ['android.permission.WAKE_LOCK'],
  ['android.permission.VIBRATE'],
  ['android.permission.POST_NOTIFICATIONS'],
  ['android.permission.BLUETOOTH', 'android:maxSdkVersion="30"'],
  ['android.permission.BLUETOOTH_ADMIN', 'android:maxSdkVersion="30"'],
  ['android.permission.BLUETOOTH_CONNECT'],
  ['android.permission.BLUETOOTH_SCAN', 'android:usesPermissionFlags="neverForLocation"'],
  ['android.permission.ACCESS_FINE_LOCATION'],
  ['android.permission.ACCESS_COARSE_LOCATION'],
];

// asegurar xmlns:tools para poder usar tools:replace si hiciera falta
if (!xml.includes('xmlns:tools=')) {
  xml = xml.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ');
}

const added = [];
for (const [name, extra] of permissions) {
  if (xml.includes(`"${name}"`)) continue;
  const line = `    <uses-permission android:name="${name}"${extra ? ' ' + extra : ''} />`;
  xml = xml.replace(/(\s*)<\/manifest>/, `\n${line}$1</manifest>`);
  added.push(name.split('.').pop());
}

// Bluetooth no obligatorio (que la app se instale en dispositivos sin BT)
for (const feat of ['android.hardware.bluetooth', 'android.hardware.bluetooth_le']) {
  if (!xml.includes(`"${feat}"`)) {
    xml = xml.replace(/(\s*)<\/manifest>/, `\n    <uses-feature android:name="${feat}" android:required="false" />$1</manifest>`);
  }
}

// <application ... android:usesCleartextTraffic="true">
xml = xml.replace(/<application\b([^>]*)>/, (m, attrs) => {
  let a = attrs;
  if (/android:usesCleartextTraffic=/.test(a)) a = a.replace(/android:usesCleartextTraffic="[^"]*"/, 'android:usesCleartextTraffic="true"');
  else a = `${a}\n        android:usesCleartextTraffic="true"`;
  return `<application${a}>`;
});

// orientación libre en la actividad principal
xml = xml.replace(/<activity\b([^>]*)>/, (m, attrs) => {
  let a = attrs;
  if (/android:screenOrientation=/.test(a)) a = a.replace(/android:screenOrientation="[^"]*"/, 'android:screenOrientation="unspecified"');
  else a = `${a}\n            android:screenOrientation="unspecified"`;
  return `<activity${a}>`;
});

fs.writeFileSync(manifestPath, xml);
console.log(`AndroidManifest.xml actualizado${added.length ? ` (+${added.join(', ')})` : ''}`);

// Firma de release opcional por variables de entorno (CI): agrega signingConfig a app/build.gradle
const gradlePath = path.join(androidDir, 'app', 'build.gradle');
if (fs.existsSync(gradlePath)) {
  let g = fs.readFileSync(gradlePath, 'utf8');
  if (!g.includes('RH_KEYSTORE_PATH')) {
    g = g.replace(/android\s*\{/, `android {
    signingConfigs {
        release {
            if (System.getenv("RH_KEYSTORE_PATH")) {
                storeFile file(System.getenv("RH_KEYSTORE_PATH"))
                storePassword System.getenv("RH_KEYSTORE_PASSWORD")
                keyAlias System.getenv("RH_KEY_ALIAS")
                keyPassword System.getenv("RH_KEY_PASSWORD")
            }
        }
    }`);
    g = g.replace(/buildTypes\s*\{\s*release\s*\{/, (m) => `${m}\n            if (System.getenv("RH_KEYSTORE_PATH")) { signingConfig signingConfigs.release }`);
    fs.writeFileSync(gradlePath, g);
    console.log('app/build.gradle: firma de release por variables RH_KEYSTORE_* agregada');
  }
}
