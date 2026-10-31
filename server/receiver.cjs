const https = require('node:https');
const { EventEmitter } = require('node:events');
const { timingSafeEqual, randomBytes, X509Certificate } = require('node:crypto');
const { networkInterfaces } = require('node:os');
const { WebSocketServer, WebSocket } = require('ws');
const { isAudioPacket } = require('../shared/protocol.mjs');

function localAddresses() {
  return [
    ...new Set(
      Object.values(networkInterfaces())
        .flat()
        .filter((n) => n && n.family === 'IPv4' && !n.internal)
        .map((n) => n.address),
    ),
  ];
}
function validPacket(data) {
  return isAudioPacket(data);
}
function equalToken(a, b) {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

class Receiver extends EventEmitter {
  constructor({
    key,
    cert,
    token = randomBytes(32).toString('hex'),
    muted = false,
    port = 43129,
    host = '0.0.0.0',
  }) {
    super();
    this.token = token;
    this.port = port;
    this.host = host;
    this.clients = new Set();
    this.fingerprint = new X509Certificate(cert).fingerprint256.replaceAll(':', '').toLowerCase();
    this.state = {
      status: 'offline',
      muted,
      frames: 0,
      name: undefined,
      battery: undefined,
      error: '',
    };
    this.server = https.createServer({ key, cert, minVersion: 'TLSv1.2' }, (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end('Cindermic receiver. Pair from the desktop app.');
    });
    this.wss = new WebSocketServer({
      server: this.server,
      maxPayload: 16384,
      perMessageDeflate: false,
    });
    this.wss.on('connection', (ws) => this.connection(ws));
  }
  snapshot() {
    return { ...this.state, addresses: localAddresses(), port: this.port };
  }
  update(patch) {
    Object.assign(this.state, patch);
    this.emit('state', this.snapshot());
  }
  async start() {
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    this.port = this.server.address().port;
    this.server.on('error', (err) => this.update({ error: err.message }));
    this.timer = setInterval(() => {
      for (const ws of this.clients) {
        if (!ws.alive) {
          ws.terminate();
          continue;
        }
        ws.alive = false;
        ws.ping();
      }
    }, 5000);
    this.timer.unref();
    return this.snapshot();
  }
  pairing(host) {
    return `cindermic://pair?${new URLSearchParams({ host, port: String(this.port), token: this.token, fingerprint: this.fingerprint })}`;
  }
  connection(ws) {
    if (this.clients.size >= 8) {
      ws.close(4004, 'Too many pending connections');
      return;
    }
    this.clients.add(ws);
    ws.alive = true;
    ws.on('pong', () => {
      ws.alive = true;
    });
    const authTimer = setTimeout(() => ws.close(4001, 'Pairing required'), 5000);
    authTimer.unref();
    ws.on('error', () => {});
    ws.on('message', (raw, binary) => {
      if (!ws.authenticated) {
        if (binary) return ws.close(4001, 'Pairing required');
        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          return ws.close(4001, 'Invalid pairing');
        }
        if (!message || typeof message !== 'object' || Array.isArray(message))
          return ws.close(4001, 'Invalid pairing');
        if (message.type !== 'hello' || !equalToken(message.token, this.token))
          return ws.close(4001, 'Invalid pairing');
        if (this.peer && this.peer !== ws) this.peer.close(4002, 'Replaced by a new session');
        this.peer = ws;
        ws.authenticated = true;
        clearTimeout(authTimer);
        this.update({
          status: 'connected',
          name: String(message.name || 'iPhone').slice(0, 80),
          frames: 0,
          error: '',
          battery: undefined,
        });
        ws.send(JSON.stringify({ type: 'welcome', muted: this.state.muted, sampleRate: 48000 }));
        return;
      }
      if (ws !== this.peer) return;
      ws.alive = true;
      if (binary) {
        if (!validPacket(raw)) return ws.close(4003, 'Invalid audio packet');
        this.state.frames++;
        if (this.state.status !== 'interrupted' && !this.state.muted) this.emit('audio', raw);
        if (this.state.frames % 25 === 0) this.emit('state', this.snapshot());
        return;
      }
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!message || typeof message !== 'object' || Array.isArray(message)) return;
      if (message.type === 'mute' && typeof message.muted === 'boolean')
        this.setMuted(message.muted);
      if (message.type === 'status') {
        const patch = {};
        if (['connected', 'interrupted'].includes(message.status)) patch.status = message.status;
        if (typeof message.battery === 'number' && message.battery >= 0 && message.battery <= 1)
          patch.battery = message.battery;
        this.update(patch);
      }
      if (message.type === 'disconnect') ws.close(1000, 'Disconnected by phone');
    });
    ws.on('close', () => {
      this.clients.delete(ws);
      clearTimeout(authTimer);
      if (this.peer !== ws) return;
      this.peer = undefined;
      this.update({ status: 'offline', battery: undefined });
    });
  }
  setMuted(muted) {
    this.update({ muted: !!muted });
    if (this.peer?.readyState === WebSocket.OPEN)
      this.peer.send(JSON.stringify({ type: 'mute', muted: this.state.muted }));
  }
  disconnect() {
    if (this.peer?.readyState === WebSocket.OPEN) {
      this.peer.send(JSON.stringify({ type: 'disconnect' }));
      this.peer.close(1000, 'Disconnected by desktop');
    }
  }
  async close() {
    clearInterval(this.timer);
    for (const ws of this.clients) ws.terminate();
    await new Promise((resolve) => this.wss.close(resolve));
    if (this.server.listening) await new Promise((resolve) => this.server.close(resolve));
  }
}
module.exports = { Receiver, validPacket, equalToken, localAddresses };
