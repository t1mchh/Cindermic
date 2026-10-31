import { access, copyFile, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
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

const { execSync } = await import('node:child_process');
const sourceIcon = path.join(root, 'public/app-icon.png');

async function generateIcon(filename, pxSize, scale, idiom = 'iphone', platform = 'ios') {
  const outputPath = path.join(icons, filename);
  const targetPx = scale === 3 ? Math.round(pxSize / 2) : pxSize;
  try {
    execSync(`sips -Z ${targetPx} "${sourceIcon}" --out "${outputPath}"`, { stdio: 'pipe' });
    console.log(`Created ${filename}`);
    return { filename, idiom, size: `${pxSize}x${pxSize}`, scale: `${scale}x`, platform };
  } catch (e) {
    console.error(`Failed to create ${filename}:`, e.message);
    return null;
  }
}

const iconPresets = [
  ['AppIcon-20.png', 20, 2], ['AppIcon-20.png', 20, 3],
  ['AppIcon-29.png', 29, 2], ['AppIcon-29.png', 29, 3],
  ['AppIcon-40.png', 40, 2], ['AppIcon-40.png', 40, 3],
  ['AppIcon-60.png', 60, 2], ['AppIcon-60.png', 60, 3],
  ['AppIcon-20.png', 20, 1, 'ipad'], ['AppIcon-20.png', 20, 2, 'ipad'],
  ['AppIcon-29.png', 29, 1, 'ipad'], ['AppIcon-29.png', 29, 2, 'ipad'],
  ['AppIcon-40.png', 40, 1, 'ipad'], ['AppIcon-40.png', 40, 2, 'ipad'],
  ['AppIcon-80.png', 80, 2, 'ipad'],
  ['AppIcon-1024.png', 1024, 1],
];

const images = [];
for (const [filename, px, scale, idiom] of iconPresets) {
  const result = await generateIcon(filename, px, scale, idiom || 'iphone');
  if (result) images.push(result);
}

const marketingIcon = { filename: 'AppIcon-1024.png', idiom: 'ios-marketing', platform: 'ios', size: '1024x1024', role: 'marketing' };
images.push(marketingIcon);

const universalIcon = images.find(i => i.filename === 'AppIcon-1024.png');
images.push(universalIcon);

await writeFile(
  path.join(icons, 'Contents.json'),
  JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2)
);

console.log('Xcode project ready: ios/App/App.xcodeproj');
if (process.argv[2] === 'open') cap('open', 'ios');
