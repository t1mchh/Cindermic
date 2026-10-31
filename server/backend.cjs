const http = require('node:http');
const path = require('node:path');
const { readFile, writeFile } = require('node:fs/promises');
const { randomBytes } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const QRCode = require('qrcode');
const { Receiver, equalToken } = require('./receiver.cjs');
const { loadIdentity } = require('./identity.cjs');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.ico': 'image/x-icon',
};

async function createBackend(options = {}) {
  const root = path.resolve(__dirname, '..');
  const storage = options.storageDirectory || path.join(root, '.local');
  const staticDirectory = path.resolve(options.staticDirectory || path.join(root, 'out'));
  const identity = await loadIdentity(storage);
  const controlToken = randomBytes(32).toString('hex');
  let muted = false;
  try {
    muted = JSON.parse(await readFile(path.join(storage, 'settings.json'), 'utf8')).muted === true;
  } catch {}
  const receiver = new Receiver({
    ...identity,
    muted,
    port: options.audioPort ?? 43129,
    host: options.audioHost || '0.0.0.0',
  });
  const controls = new WebSocketServer({
    noServer: true,
    maxPayload: 16384,
    perMessageDeflate: false,
  });
  const senders = new WebSocketServer({
    noServer: true,
    maxPayload: 16384,
    perMessageDeflate: false,
  });
  let selectedHost;
  let pairingCache;
  let persist = Promise.resolve();
  let savedMute = muted;
  const origins = new Set(['http://127.0.0.1:3000', 'http://localhost:3000']);

  async function snapshot() {
    const state = receiver.snapshot();
    if (!state.addresses.includes(selectedHost)) selectedHost = state.addresses[0] || '127.0.0.1';
    const pairing = receiver.pairing(selectedHost);
    if (pairingCache?.pairing !== pairing)
      pairingCache = { pairing, qr: await QRCode.toDataURL(pairing, { width: 256, margin: 1 }) };
    return { ...state, ...pairingCache, backendConnected: true };
  }

  function send(socket, message) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  async function command(value) {
    if (!value || typeof value.type !== 'string') throw new Error('A command type is required.');
    switch (value.type) {
      case 'state':
        break;
      case 'mute':
        if (typeof value.muted !== 'boolean') throw new Error('Mute must be true or false.');
        receiver.setMuted(value.muted);
        break;
      case 'disconnect':
        receiver.disconnect();
        break;
      case 'pairHost':
        if (!receiver.snapshot().addresses.includes(value.host))
          throw new Error('Select an address on this computer.');
        selectedHost = value.host;
        break;
      default:
        throw new Error('Unknown command.');
    }
    return snapshot();
  }

  controls.on('connection', (socket) => {
    socket.on('error', () => {});
    snapshot()
      .then((state) => send(socket, { type: 'state', state }))
      .catch(() => socket.close(1011));
    socket.on('message', async (raw, binary) => {
      if (binary) return socket.close(4003, 'Control messages must be JSON.');
      let message;
      try {
        message = JSON.parse(raw.toString());
        const state = await command(message.command);
        send(socket, { type: 'result', id: message.id, state });
      } catch (error) {
        send(socket, { type: 'error', id: message?.id, error: error.message });
      }
    });
  });
  senders.on('connection', (socket) => receiver.connection(socket));
  receiver.on('state', (state) => {
    for (const socket of controls.clients)
      send(socket, { type: 'state', state: { ...state, backendConnected: true } });
    if (state.muted !== savedMute) {
      savedMute = state.muted;
      const settings = JSON.stringify({ muted: savedMute });
      persist = persist
        .then(() => writeFile(path.join(storage, 'settings.json'), settings, { mode: 0o600 }))
        .catch((error) => console.error('Could not save settings:', error.message));
    }
  });
  receiver.on('audio', (packet) => {
    for (const socket of controls.clients) {
      if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 65536)
        socket.send(packet);
    }
  });

  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if ((origin && !origins.has(origin)) || !validHost(request.headers.host)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method !== 'GET') {
      response.writeHead(405);
      response.end();
      return;
    }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/health') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ app: 'cindermic', ready: true }));
      return;
    }
    if (url.pathname === '/api/session') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ token: controlToken, captureToken: identity.token }));
      return;
    }
    try {
      let filename = decodeURIComponent(url.pathname);
      if (filename.endsWith('/')) filename += 'index.html';
      const target = path.resolve(staticDirectory, '.' + filename);
      if (!target.startsWith(staticDirectory + path.sep)) throw new Error('Invalid path.');
      const data = await readFile(target);
      response.setHeader(
        'Content-Type',
        mimeTypes[path.extname(target)] || 'application/octet-stream',
      );
      response.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end('Run npm run build before starting the production server.');
    }
  });

  function validHost(host) {
    return (
      host === `127.0.0.1:${server.address()?.port}` ||
      host === `localhost:${server.address()?.port}`
    );
  }

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (
      !origins.has(request.headers.origin) ||
      !validHost(request.headers.host) ||
      !equalToken(url.searchParams.get('session'), controlToken)
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const target =
      url.pathname === '/control' ? controls : url.pathname === '/sender' ? senders : undefined;
    if (!target || controls.clients.size + senders.clients.size >= 16) {
      socket.destroy();
      return;
    }
    target.handleUpgrade(request, socket, head, (ws) => target.emit('connection', ws, request));
  });

  try {
    await receiver.start();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.controlPort ?? 43130, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await receiver.close();
    throw error;
  }
  const url = `http://127.0.0.1:${server.address().port}`;
  origins.add(url);
  origins.add(`http://localhost:${server.address().port}`);
  server.on('error', (error) => console.error('Local server error:', error.message));

  return {
    url,
    receiver,
    snapshot,
    command,
    async close() {
      for (const socket of controls.clients) socket.terminate();
      for (const socket of senders.clients) socket.terminate();
      await Promise.all([
        new Promise((resolve) => controls.close(resolve)),
        new Promise((resolve) => senders.close(resolve)),
        receiver.close(),
      ]);
      await new Promise((resolve) => server.close(resolve));
      await persist;
    },
  };
}

module.exports = { createBackend };
