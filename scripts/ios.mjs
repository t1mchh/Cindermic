import { access, copyFile, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import xcode from 'xcode';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'node_modules/@capacitor/cli/bin/capacitor');
function cap(...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
await access(path.join(root, 'out/index.html'));
try {
  await access(path.join(root, 'ios/App/App.xcodeproj'));
} catch {
  cap('add', 'ios');
}
cap('sync', 'ios');
const project = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
await writeFile(
  project,
  (await readFile(project, 'utf8')).replace(
    /IPHONEOS_DEPLOYMENT_TARGET = [\d.]+;/g,
    'IPHONEOS_DEPLOYMENT_TARGET = 17.0;',
  ),
);
const packageFile = path.join(root, 'ios/App/CapApp-SPM/Package.swift');
await writeFile(
  packageFile,
  (await readFile(packageFile, 'utf8')).replace(
    /platforms: \[\.iOS\(\.v\d+\)\]/,
    'platforms: [.iOS(.v17)]',
  ),
);

const info = path.join(root, 'ios/App/App/Info.plist');
let plist = await readFile(info, 'utf8');
const additions = {
  NSCameraUsageDescription: '<string>Scan the QR code shown by your Cindermic desktop.</string>',
  NSMicrophoneUsageDescription:
    '<string>Send your microphone audio directly to your paired desktop.</string>',
  NSLocalNetworkUsageDescription:
    '<string>Connect to your Cindermic desktop on your local network.</string>',
  UIBackgroundModes: '<array><string>audio</string></array>',
  CFBundleLocalizations: '<array><string>en</string><string>de</string><string>ru</string></array>',
};
for (const [key, value] of Object.entries(additions)) {
  if (!plist.includes(`<key>${key}</key>`))
    plist = plist.replace(
      /\n<\/dict>\s*<\/plist>/,
      `\n\t<key>${key}</key>\n\t${value}\n</dict>\n</plist>`,
    );
}
await writeFile(info, plist);

const xcodeProject = xcode.project(project);
xcodeProject.parseSync();
if (!xcodeProject.findPBXGroupKey({ name: 'Resources' })) {
  const resources = xcodeProject.addPbxGroup([], 'Resources');
  xcodeProject.addToPbxGroup(resources.uuid, xcodeProject.findPBXGroupKey({ path: 'App' }));
}
delete xcodeProject.getPBXGroupByKey(xcodeProject.findPBXGroupKey({ name: 'Resources' })).path;
const variant =
  xcodeProject.findPBXVariantGroupKey({ name: 'InfoPlist.strings' }) ||
  xcodeProject.addLocalizationVariantGroup('InfoPlist.strings').fileRef;
for (const locale of ['en', 'de', 'ru']) {
  const folder = `${locale}.lproj`;
  const destination = path.join(root, 'ios/App/App', folder);
  await mkdir(destination, { recursive: true });
  await copyFile(
    path.join(root, 'native/locales', folder, 'InfoPlist.strings'),
    path.join(destination, 'InfoPlist.strings'),
  );
  const file = xcodeProject.addResourceFile(
    `${folder}/InfoPlist.strings`,
    { variantGroup: true },
    variant,
  );
  if (file) {
    const references = xcodeProject.pbxFileReferenceSection();
    references[file.fileRef].name = locale;
    references[`${file.fileRef}_comment`] = locale;
    const group = xcodeProject.getPBXVariantGroupByKey(variant);
    group.children.find((child) => child.value === file.fileRef).comment = locale;
  }
  xcodeProject.addKnownRegion(locale);
}
for (const reference of Object.values(xcodeProject.pbxFileReferenceSection())) {
  if (
    typeof reference === 'object' &&
    (reference.explicitFileType === undefined || reference.explicitFileType === 'undefined')
  ) {
    delete reference.explicitFileType;
  }
}
await writeFile(project, xcodeProject.writeSync());
const icons = path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
await mkdir(icons, { recursive: true });
for (const filename of await readdir(icons)) {
  if (filename.endsWith('.png')) await rm(path.join(icons, filename));
}

await copyFile(path.join(root, 'public/app-icon.png'), path.join(icons, 'AppIcon.png'));
await writeFile(
  path.join(icons, 'Contents.json'),
  JSON.stringify(
    {
      images: [{ filename: 'AppIcon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
      info: { author: 'xcode', version: 1 },
    },
    null,
    2,
  ),
);

console.log('Xcode project ready: ios/App/App.xcodeproj');
if (process.argv[2] === 'open') cap('open', 'ios');
