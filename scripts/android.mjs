import { access, copyFile, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'node_modules/@capacitor/cli/bin/capacitor');
function cap(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

await access(path.join(root, 'out/index.html'));
try {
  await access(path.join(root, 'android/app/src/main/AndroidManifest.xml'));
} catch {
  cap('add', 'android');
}
cap('sync', 'android');

const manifest = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let manifestContent = await readFile(manifest, 'utf8');

if (!manifestContent.includes('<uses-permission android:name="android.permission.RECORD_AUDIO" />')) {
  manifestContent = manifestContent.replace(
    '<manifest',
    '<manifest>\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />'
  );
}

if (!manifestContent.includes('android:name="local.cindermic.personal"')) {
  manifestContent = manifestContent.replace(
    'android:allowBackup="true"',
    'android:allowBackup="true"\n    android:fullBackupContent="false"'
  );
}

const appName = 'Cindermic';
if (!manifestContent.includes(`android:roundIcon="@mipmap/ic_launcher_round"`)) {
  manifestContent = manifestContent.replace(
    'android:allowBackup="true"',
    `android:allowBackup="true"\n    android:roundIcon="@mipmap/ic_launcher_round"
    android:supportsRtl="true"`
  );
}

if (manifestContent.includes('android:roundIcon="@mipmap/ic_launcher_round"')) {
  manifestContent = manifestContent.replace(
    /android:allowBackup="true"/,
    `android:allowBackup="true"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:supportsRtl="true"`
  );
}

await writeFile(manifest, manifestContent);

const buildGradle = path.join(root, 'android/app/build.gradle');
let buildGradleContent = await readFile(buildGradle, 'utf8');

if (!buildGradleContent.includes('android:extractNativeLibs="false"')) {
  buildGradleContent = buildGradleContent.replace(
    'android {',
    `android {
    namespace "local.cindermic.personal"`
  );
}

if (!buildGradleContent.includes('minSdkVersion')) {
  buildGradleContent = buildGradleContent.replace(
    'defaultConfig {',
    `defaultConfig {
        minSdkVersion 26`
  );
}

await writeFile(buildGradle, buildGradleContent).catch(() => {});

const icons = path.join(root, 'android/app/src/main/res/mipmap-hdpi');
await mkdir(icons, { recursive: true }).catch(() => {});

const appIcon = path.join(root, 'public/app-icon.png');
if (await access(appIcon).then(() => true).catch(() => false)) {
  await copyFile(appIcon, path.join(icons, 'ic_launcher.png')).catch(() => {});
}

console.log('Android project ready: android/');
console.log('Run "npm run android" to open Android Studio');
console.log('Run "npm run android:build" to build the APK');

if (process.argv[2] === 'open') cap('open', 'android');