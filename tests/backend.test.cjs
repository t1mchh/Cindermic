const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdir, mkdtemp, rm } = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { WebSocket } = require('ws');
const { createBackend } = require('../server/backend.cjs');

async function setup(t) {
  const root = path.resolve(__dirname, '../.local');
  await mkdir(root, { recursive: true });
  const storageDirectory = await mkdtemp(path.join(root, 'backend-test-'));
  const backend = await createBackend({
    storageDirectory,
    controlPort: 0,
    audioPort: 0,
    audioHost: '127.0.0.1',
  });
  t.after(async () => {
    await backend.close();
    await rm(storageDirectory, { recursive: true, force: true });
  });
  return backend;
}

function socketUrl(backend, route, token) {
  return backend.url.replace('http:', 'ws:') + `${route}?session=${token}`;
}

test('browser sessions reject foreign origins and DNS-rebinding hosts', async (t) => {
  const backend = await setup(t);
  const foreign = await fetch(`${backend.url}/api/session`, {
    headers: { Origin: 'https://other.example' },
  });
  assert.equal(foreign.status, 403);
  const rebindingStatus = await new Promise((resolve, reject) => {
    http
      .get(`${backend.url}/api/session`, { headers: { Host: 'other.example' } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      })
      .on('error', reject);
  });
  assert.equal(rebindingStatus, 403);
  const accepted = await fetch(`${backend.url}/api/session`, {
    headers: { Origin: 'http://127.0.0.1:3000' },
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:3000');
});

test('browser microphone and control sockets share the authenticated receiver', async (t) => {
  const backend = await setup(t);
  const session = await (await fetch(`${backend.url}/api/session`)).json();
  const control = new WebSocket(socketUrl(backend, '/control', session.token), {
    origin: backend.url,
  });
  const initial = once(control, 'message');
  await once(control, 'open');
  assert.equal(JSON.parse((await initial)[0]).state.backendConnected, true);
  const sender = new WebSocket(socketUrl(backend, '/sender', session.token), {
    origin: backend.url,
  });
  await once(sender, 'open');
  const welcome = once(sender, 'message');
  sender.send(JSON.stringify({ type: 'hello', token: session.captureToken, name: 'Browser test' }));
  assert.equal(JSON.parse((await welcome)[0]).type, 'welcome');
  assert.equal(backend.receiver.snapshot().name, 'Browser test');
  const result = new Promise((resolve) =>
    control.on('message', (raw, binary) => {
      if (!binary && JSON.parse(raw).id === 1) resolve(JSON.parse(raw));
    }),
  );
  control.send(JSON.stringify({ id: 1, command: { type: 'mute', muted: true } }));
  assert.equal((await result).state.muted, true);
  sender.send('null');
  assert.equal(backend.receiver.snapshot().muted, true);
});

test('missing session token cannot open a browser control connection', async (t) => {
  const backend = await setup(t);
  const socket = new WebSocket(socketUrl(backend, '/control', 'bad'), { origin: backend.url });
  await assert.rejects(once(socket, 'open'), /403/);
});
