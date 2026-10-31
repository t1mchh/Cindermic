import { execSync } from 'node:child_process';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceIcon = path.join(root, 'public/app-icon.png');
const outputDir = path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');

const iconPresets = [
  { filename: 'AppIcon-20.png', px: 20, scale: 2 },
  { filename: 'AppIcon-20.png', px: 29, scale: 3 },
  { filename: 'AppIcon-29.png', px: 29, scale: 2 },
  { filename: 'AppIcon-29.png', px: 43, scale: 3 },
  { filename: 'AppIcon-40.png', px: 40, scale: 2 },
  { filename: 'AppIcon-40.png', px: 60, scale: 3 },
  { filename: 'AppIcon-60.png', px: 60, scale: 2 },
  { filename: 'AppIcon-60.png', px: 90, scale: 3 },
  { filename: 'AppIcon-1024.png', px: 1024, scale: 1 },
];

for (const { filename, px, scale } of iconPresets) {
  const outputPath = path.join(outputDir, filename);
  const targetPx = scale === 3 ? px * 3 : px;
  try {
    execSync(`sips -Z ${targetPx} "${sourceIcon}" --out "${outputPath}"`, { stdio: 'pipe' });
    console.log(`Created ${filename} (${px * scale}px @${scale}x)`);
  } catch (e) {
    console.error(`Failed to create ${filename}:`, e.message);
  }
}

const images = [
  { filename: 'AppIcon-20.png', size: '20x20', scale: '2x', idiom: 'iphone' },
  { filename: 'AppIcon-20.png', size: '20x20', scale: '3x', idiom: 'iphone' },
  { filename: 'AppIcon-29.png', size: '29x29', scale: '2x', idiom: 'iphone' },
  { filename: 'AppIcon-29.png', size: '29x29', scale: '3x', idiom: 'iphone' },
  { filename: 'AppIcon-40.png', size: '40x40', scale: '2x', idiom: 'iphone' },
  { filename: 'AppIcon-40.png', size: '40x40', scale: '3x', idiom: 'iphone' },
  { filename: 'AppIcon-60.png', size: '60x60', scale: '2x', idiom: 'iphone' },
  { filename: 'AppIcon-60.png', size: '60x60', scale: '3x', idiom: 'iphone' },
  { filename: 'AppIcon-20.png', size: '20x20', scale: '1x', idiom: 'ipad' },
  { filename: 'AppIcon-20.png', size: '20x20', scale: '2x', idiom: 'ipad' },
  { filename: 'AppIcon-29.png', size: '29x29', scale: '1x', idiom: 'ipad' },
  { filename: 'AppIcon-29.png', size: '29x29', scale: '2x', idiom: 'ipad' },
  { filename: 'AppIcon-40.png', size: '40x40', scale: '1x', idiom: 'ipad' },
  { filename: 'AppIcon-40.png', size: '40x40', scale: '2x', idiom: 'ipad' },
  { filename: 'AppIcon-80.png', size: '80x80', scale: '2x', idiom: 'ipad' },
  { filename: 'AppIcon-1024.png', size: '1024x1024', scale: '1x', idiom: 'ios-marketing', platform: 'ios', role: 'marketing' }
];

await writeFile(
  path.join(outputDir, 'Contents.json'),
  JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2)
);

try {
  copyFile(sourceIcon, path.join(outputDir, 'AppIcon-80.png'));
} catch (e) {}

console.log('iOS icons processed. Note: If sips failed due to sandbox, copy app-icon.png as AppIcon-80.png manually.');