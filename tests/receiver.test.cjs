const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const selfsigned = require('selfsigned');
const { WebSocket } = require('ws');
const { Receiver, validPacket, equalToken } = require('../server/receiver.cjs');

let identity;
before(async () => {
  const pem = await selfsigned.generate(null, { keySize: 2048, algorithm: 'sha256' });
  identity = { key: pem.private, cert: pem.cert };
});
function packet() {
  const data = Buffer.alloc(1932);
  data.write('CND1');
  data.writeUInt32LE(48000, 8);
  data.writeInt16LE(1234, 12);
  return data;
}
async function receiver(t) {
  const instance = new Receiver({ ...identity, port: 0, host: '127.0.0.1' });
  await instance.start();
  t.after(() => instance.close());
  return instance;
}
async function connect(instance, token = instance.token) {
  const ws = new WebSocket(`wss://127.0.0.1:${instance.port}`, { rejectUnauthorized: false });
  await once(ws, 'open');
  const reply = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'hello', token, name: 'Test iPhone' }));
  const [raw] = await reply;
  return { ws, welcome: JSON.parse(raw) };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 40));

test('PCM parser rejects malformed frames and unsupported formats', () => {
  assert.equal(validPacket(packet()), true);
  assert.equal(validPacket(Buffer.alloc(9)), false);
  const bad = packet();
  bad.writeUInt32LE(44100, 8);
  assert.equal(validPacket(bad), false);
  assert.equal(validPacket(Buffer.concat([packet(), Buffer.from([1])])), false);
  assert.equal(equalToken('a'.repeat(64), 'a'.repeat(64)), true);
  assert.equal(equalToken('b'.repeat(64), 'a'.repeat(64)), false);
  assert.equal(equalToken(null, 'a'.repeat(64)), false);
  assert.equal(equalToken('😐'.repeat(32), 'a'.repeat(64)), false);
});
test('unauthenticated peers cannot inject microphone audio', async (t) => {
  const instance = await receiver(t);
  const ws = new WebSocket(`wss://127.0.0.1:${instance.port}`, { rejectUnauthorized: false });
  await once(ws, 'open');
  const closed = once(ws, 'close');
  ws.send(JSON.stringify({ type: 'hello', token: '0'.repeat(64) }));
  const [code] = await closed;
  assert.equal(code, 4001);
  assert.equal(instance.snapshot().status, 'offline');
});
test('TLS pairing and authenticated PCM forwarding work together', async (t) => {
  const instance = await receiver(t);
  const link = new URL(instance.pairing('127.0.0.1'));
  assert.equal(link.searchParams.get('fingerprint').length, 64);
  const { ws, welcome } = await connect(instance);
  assert.equal(welcome.type, 'welcome');
  assert.equal(instance.snapshot().status, 'connecting');
  const received = once(instance, 'audio');
  ws.send(packet());
  assert.deepEqual((await received)[0], packet());
  assert.equal(instance.snapshot().status, 'connected');
});
test('mute suppresses audio and survives reconnect', async (t) => {
  const instance = await receiver(t);
  const first = await connect(instance);
  let count = 0;
  instance.on('audio', () => count++);
  instance.setMuted(true);
  first.ws.send(packet());
  await tick();
  assert.equal(count, 0);
  const closed = once(first.ws, 'close');
  first.ws.close();
  await closed;
  const second = await connect(instance);
  assert.equal(second.welcome.muted, true);
  second.ws.send(packet());
  await tick();
  assert.equal(count, 0);
  instance.setMuted(false);
  const audio = once(instance, 'audio');
  second.ws.send(packet());
  await audio;
  assert.equal(count, 1);
});
test('interruptions suppress audio and clearing interruption resumes it', async (t) => {
  const instance = await receiver(t);
  const { ws } = await connect(instance);
  let count = 0;
  instance.on('audio', () => count++);
  ws.send(JSON.stringify({ type: 'status', status: 'interrupted' }));
  ws.send(packet());
  await tick();
  assert.equal(instance.snapshot().status, 'interrupted');
  assert.equal(count, 0);
  ws.send(JSON.stringify({ type: 'status', status: 'connected' }));
  const audio = once(instance, 'audio');
  ws.send(packet());
  await audio;
  assert.equal(count, 1);
});
test('replacing a session does not let old close events disconnect the new phone', async (t) => {
  const instance = await receiver(t);
  const first = await connect(instance);
  const closed = once(first.ws, 'close');
  const second = await connect(instance);
  second.ws.send(packet());
  await closed;
  await tick();
  assert.equal(instance.snapshot().status, 'connected');
});
test('desktop disconnect tells phone to stop retries', async (t) => {
  const instance = await receiver(t);
  const { ws } = await connect(instance);
  const message = once(ws, 'message');
  instance.disconnect();
  const [raw] = await message;
  assert.equal(JSON.parse(raw).type, 'disconnect');
});

test('authenticated senders cannot claim Connected without valid audio and time out cleanly', async (t) => {
  const instance = new Receiver({ ...identity, port: 0, host: '127.0.0.1', pipelineTimeout: 80 });
  await instance.start();
  t.after(() => instance.close());
  const { ws } = await connect(instance);
  const closed = once(ws, 'close');
  ws.send(JSON.stringify({ type: 'status', status: 'connected' }));
  await tick();
  assert.equal(instance.snapshot().status, 'connecting');
  assert.equal((await closed)[0], 4003);
  await tick();
  assert.equal(instance.snapshot().status, 'failed');
});

test('receiver shutdown closes clients that never complete a TLS handshake', async () => {
  const net = require('node:net');
  const instance = new Receiver({ ...identity, port: 0, host: '127.0.0.1' });
  await instance.start();
  const socket = net.connect(instance.port, '127.0.0.1');
  await once(socket, 'connect');
  const closed = new Promise((resolve) => socket.once('close', resolve));
  socket.on('error', (error) => assert.equal(error.code, 'ECONNRESET'));
  await instance.close();
  await closed;
  assert.equal(instance.connections.size, 0);
});
