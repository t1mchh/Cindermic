const { mkdir, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, X509Certificate, createPrivateKey } = require('node:crypto');
const selfsigned = require('selfsigned');

async function loadIdentity(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'identity.json');
  try {
    const identity = JSON.parse(await readFile(filename, 'utf8'));
    new X509Certificate(identity.cert);
    createPrivateKey(identity.key);
    if (!/^[a-f0-9]{64}$/.test(identity.token)) throw new Error('Invalid pairing token.');
    return identity;
  } catch (error) {
    if (error.code !== 'ENOENT')
      throw new Error(`Cannot read ${filename}. Move it aside to create a new pairing identity.`, {
        cause: error,
      });
  }
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 10);
  const generated = await selfsigned.generate([{ name: 'commonName', value: 'Cindermic Local' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: expires,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames: [{ type: 2, value: 'cindermic.local' }] },
    ],
  });
  const identity = {
    key: generated.private,
    cert: generated.cert,
    token: randomBytes(32).toString('hex'),
  };
  await writeFile(filename, JSON.stringify(identity), { mode: 0o600 });
  return identity;
}

module.exports = { loadIdentity };
