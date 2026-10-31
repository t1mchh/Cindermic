import { readFile, writeFile, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const tag = process.env.GITHUB_REF_NAME;
if (tag !== `v${version}`) throw new Error('Release tag must match package.json version.');
const files = [
  `Cindermic-${version}-mac-arm64.zip`,
  `Cindermic-${version}-mac-x64.zip`,
  `Cindermic-${version}-windows-x64.exe`,
  `Cindermic-${version}-windows-x64.zip`,
].map((name) => path.join('release-assets', name));
const notes = `docs/releases/${tag}.md`;
await access(notes);
const checksums = [];
for (const file of files) {
  await access(file);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  checksums.push(`${hash.digest('hex')}  ${path.basename(file)}`);
}
const checksumFile = path.join('release-assets', 'SHA256SUMS.txt');
await writeFile(checksumFile, checksums.join('\n') + '\n');
function gh(args, capture = false) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}
let existing;
try {
  existing = JSON.parse(gh(['release', 'view', tag, '--json', 'isDraft'], true));
} catch (error) {
  if (error.status !== 1) throw error;
}
if (existing && !existing.isDraft)
  throw new Error('This release is already published. Use a new version instead of replacing it.');
if (!existing)
  gh([
    'release',
    'create',
    tag,
    '--draft',
    '--verify-tag',
    '--title',
    `Cindermic ${tag}`,
    '--notes-file',
    notes,
  ]);
gh(['release', 'upload', tag, ...files, checksumFile, '--clobber']);
gh(['release', 'edit', tag, '--draft=false', '--latest']);
