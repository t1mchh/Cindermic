import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw new Error('Build the macOS app on a Mac.');
const root = fileURLToPath(new URL('../', import.meta.url));
// Signing in a synced Documents folder can attach prohibited Finder metadata.
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const staging = await mkdtemp(path.join(os.tmpdir(), 'cindermic-package-'));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}.`);
}
try {
  run(process.execPath, [
    path.join(root, 'node_modules/electron-builder/cli.js'),
    '--mac',
    'dir',
    `--config.directories.output=${staging}`,
  ]);
  const app = path.join(staging, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Cindermic.app');
  run('codesign', ['--verify', '--deep', '--strict', app]);
  await mkdir(path.join(root, 'release'), { recursive: true });
  const archive = path.join(root, 'release', `Cindermic-${version}-mac-${process.arch}.zip`);
  run('ditto', ['-c', '-k', '--norsrc', '--noextattr', '--keepParent', app, archive]);
  console.log(`Mac app ready: ${archive}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
