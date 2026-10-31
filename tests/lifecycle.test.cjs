const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(filename, globals = {}, dependencies = {}) {
  const source = ts.transpileModule(fs.readFileSync(require.resolve(filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    setTimeout,
    clearTimeout,
    AbortSignal,
    process,
    require: (name) => dependencies[name] || require(name),
    ...globals,
  });
  return exports;
}

test('native listener registration completing after disposal is removed immediately', async () => {
  let register;
  let removed = 0;
  let commands = 0;
  const plugin = {
    addListener: () =>
      new Promise((resolve) => {
        register = resolve;
      }),
    command: async () => {
      commands++;
      return {};
    },
  };
  const { NativeBridge } = load(
    '../src/lib/native-bridge.ts',
    {},
    {
      '@capacitor/core': { registerPlugin: () => plugin },
    },
  );
  const bridge = new NativeBridge();
  const opening = bridge.connect();
  bridge.close();
  register({
    remove: async () => {
      removed++;
    },
  });
  await opening;
  assert.equal(removed, 1);
  assert.equal(commands, 0);
});

test('malformed control messages close safely', async () => {
  const sockets = [];
  class Socket {
    constructor() {
      sockets.push(this);
    }
    close() {
      this.closed = true;
      this.onclose?.();
    }
  }
  const { WebBridge } = load(
    '../src/lib/web-bridge.ts',
    {
      window: { location: { port: '43130', origin: 'http://127.0.0.1:43130' } },
      URL,
      fetch: async () => ({
        ok: true,
        json: async () => ({ token: 'test', captureToken: 'capture' }),
      }),
      WebSocket: Socket,
    },
    { '../../shared/protocol.mjs': require('../shared/protocol.mjs') },
  );
  const bridge = new WebBridge(100, 100);
  await bridge.connect();
  assert.doesNotThrow(() => sockets[0].onmessage({ data: '{' }));
  assert.equal(sockets[0].closed, true);
  bridge.close();
});

test('stopping playback during worklet load cannot restart a closed audio context', async () => {
  let release;
  let resumed = 0;
  let closed = 0;
  class Context {
    state = 'suspended';
    audioWorklet = {
      addModule: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    };
    async close() {
      this.state = 'closed';
      closed++;
    }
    async resume() {
      resumed++;
    }
  }
  const { AudioReceiver } = load('../src/lib/audio-receiver.ts', { AudioContext: Context });
  const receiver = new AudioReceiver();
  const opening = receiver.start('');
  await new Promise((resolve) => setImmediate(resolve));
  await receiver.stop();
  release();
  await opening;
  assert.equal(closed, 1);
  assert.equal(resumed, 0);
});

test('closing a bridge while session discovery is pending cannot open a socket later', async () => {
  let release;
  let opened = 0;
  const { WebBridge } = load(
    '../src/lib/web-bridge.ts',
    {
      window: { location: { port: '43130', origin: 'http://127.0.0.1:43130' } },
      URL,
      fetch: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      WebSocket: class {
        constructor() {
          opened++;
        }
      },
    },
    { '../../shared/protocol.mjs': require('../shared/protocol.mjs') },
  );
  const bridge = new WebBridge();
  const opening = bridge.connect();
  bridge.close();
  release({ ok: true, json: async () => ({ token: 'test', captureToken: 'capture' }) });
  await opening;
  assert.equal(opened, 0);
});
