const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdir, mkdtemp, rm, readFile } = require('node:fs/promises');
const { app, BrowserWindow, session } = require('electron');
const { createBackend } = require('../server/backend.cjs');
const { readLevel } = require('../shared/protocol.mjs');

app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('mute-audio');
app.on('window-all-closed', () => {});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, description, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await pause(50);
  }
  throw new Error(`Timed out: ${description}`);
}

app
  .whenReady()
  .then(async () => {
    const root = path.resolve(__dirname, '..');
    await mkdir(path.join(root, '.local'), { recursive: true });
    const storage = await mkdtemp(path.join(root, '.local/audio-test-'));
    let backend;
    let window;
    const results = [];
    try {
      backend = await createBackend({
        storageDirectory: storage,
        controlPort: 0,
        audioPort: 0,
        audioHost: '127.0.0.1',
      });
      const testSession = session.fromPartition(`audio-test-${Date.now()}`);
      testSession.setPermissionRequestHandler((contents, permission, callback) =>
        callback(['media', 'speaker-selection'].includes(permission)),
      );
      testSession.setPermissionCheckHandler(() => true);
      window = new BrowserWindow({
        show: false,
        webPreferences: {
          session: testSession,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
        },
      });
      window.webContents.on('console-message', (details) => {
        if (details.level === 'error') console.error(details.message);
      });
      await window.loadURL(backend.url);
      const evaluate = (script) => window.webContents.executeJavaScript(script, true);
      await until(
        () =>
          evaluate(
            `!!document.querySelector('[aria-label="Start Mac microphone"]:not(:disabled)')`,
          ),
        'frontend connects to backend',
      );
      await evaluate(`document.querySelector('[aria-label="Start Mac microphone"]').click()`);
      let received = 0;
      let rms = 0;
      backend.receiver.on('audio', (packet) => {
        received++;
        rms = readLevel(packet);
      });
      await until(() => received >= 8 && rms > 0.001, 'browser capture reaches receiver');
      results.push('Browser microphone → AudioWorklet → WebSocket → backend: passed');
      await evaluate(
        `Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Record clip')).click()`,
      );
      await until(
        () => evaluate(`document.body.innerText.includes('Stop recording')`),
        'clip recording starts',
      );
      await evaluate(
        `Array.from(document.querySelectorAll('nav[aria-label="Main navigation"] button')).find(button => button.textContent.includes('Audio output')).click()`,
      );
      await until(() => evaluate(`!!document.querySelector('#device')`), 'output panel opens');
      await evaluate(
        `Array.from(document.querySelectorAll('.sound-profiles button')).find(button => button.textContent.includes('Voice')).click()`,
      );
      await until(
        () =>
          evaluate(
            `document.querySelector('.sound-profiles button[aria-pressed="true"]').textContent.includes('Voice')`,
          ),
        'voice profile selected',
      );
      await evaluate(
        `document.querySelector('#device').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM',bubbles:true}))`,
      );
      await pause(100);
      assert.equal(backend.receiver.snapshot().muted, false);
      await evaluate(
        `const select = document.querySelector('#device'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, 'default'); select.dispatchEvent(new Event('change', { bubbles: true }));`,
      );
      await evaluate(
        `Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Enable output')).click()`,
      );
      await until(
        () => evaluate(`document.body.innerText.includes('Output on')`),
        'playback AudioWorklet starts',
      );
      results.push('Output routing and playback AudioWorklet: passed');
      await evaluate(`document.querySelector('nav[aria-label="Main navigation"] button').click()`);
      await until(
        () => evaluate(`!!document.querySelector('[aria-label="Mute microphone"]')`),
        'microphone panel opens',
      );
      await evaluate(
        `document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyM',bubbles:true}))`,
      );
      await until(() => backend.receiver.snapshot().muted, 'mute reaches backend');
      const atMute = received;
      await pause(250);
      assert.equal(received, atMute);
      results.push(
        'M shortcut mutes; output selector ignores shortcut; mute suppresses audio: passed',
      );
      const options = {
        storageDirectory: storage,
        controlPort: Number(new URL(backend.url).port),
        audioPort: backend.receiver.port,
        audioHost: '127.0.0.1',
      };
      await backend.close();
      backend = await createBackend(options);
      await until(
        () =>
          backend.receiver.snapshot().status === 'connected' &&
          backend.receiver.snapshot().frames > 5,
        'automatic reconnect after backend restart',
      );
      assert.equal(backend.receiver.snapshot().muted, true);
      results.push('Backend restart reconnects and preserves mute: passed');
      await until(
        () => evaluate(`!!document.querySelector('[aria-label="Unmute microphone"]')`),
        'reconnected mute state renders',
      );
      received = 0;
      rms = 0;
      backend.receiver.on('audio', (packet) => {
        received++;
        rms = readLevel(packet);
      });
      await evaluate(`document.querySelector('[aria-label="Unmute microphone"]').click()`);
      await until(() => received > 5 && rms > 0.001, 'unmute resumes audio');
      await evaluate(
        `Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Stop recording')).click()`,
      );
      await until(() => evaluate(`!!document.querySelector('.download-clip')`), 'WAV clip ready');
      const savedClip = path.join(storage, 'clip.wav');
      const downloaded = new Promise((resolve, reject) =>
        testSession.once('will-download', (_, item) => {
          item.setSavePath(savedClip);
          item.once('done', (_, state) =>
            state === 'completed' ? resolve() : reject(new Error('WAV download failed')),
          );
        }),
      );
      await evaluate(`document.querySelector('.download-clip').click()`);
      await downloaded;
      const clip = await readFile(savedClip);
      assert.equal(clip.toString('ascii', 0, 4), 'RIFF');
      assert.equal(clip.readUInt32LE(24), 48000);
      assert.ok(clip.length > 1920);
      assert.ok(clip.subarray(44).some((value) => value !== 0));
      results.push('Voice output profile and local WAV recording through mute/reconnect: passed');
      await evaluate(`document.querySelector('[aria-label="Disconnect source"]').click()`);
      await until(() => backend.receiver.snapshot().status === 'offline', 'intentional disconnect');
      await pause(1800);
      assert.equal(backend.receiver.snapshot().status, 'offline');
      results.push('Intentional disconnect stops reconnection: passed');
      console.log(JSON.stringify({ passed: true, results }, null, 2));
    } finally {
      window?.destroy();
      await backend?.close();
      await rm(storage, { recursive: true, force: true });
    }
  })
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
