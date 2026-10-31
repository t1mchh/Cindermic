const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function processor(sampleRate = 48000) {
  let Processor;
  const context = vm.createContext({
    AudioWorkletProcessor: class {
      constructor() {
        this.port = {};
      }
    },
    sampleRate,
    registerProcessor: (_, value) => {
      Processor = value;
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../public/pcm-worklet.js'), 'utf8'), context);
  return new Processor();
}
function feed(worklet, count = 4) {
  for (let i = 0; i < count; i++) {
    const frame = new ArrayBuffer(1932);
    const data = new DataView(frame);
    data.setUint32(0, 0x434e4431);
    data.setUint32(8, 48000, true);
    for (let j = 12; j < 1932; j += 2) data.setInt16(j, 16384, true);
    worklet.port.onmessage({ data: { type: 'pcm', data: frame } });
  }
}
test('jitter buffer starts silent, renders PCM, and flushes immediately', () => {
  const worklet = processor();
  const block = new Float32Array(128);
  worklet.process([], [[block]]);
  assert.equal(
    block.every((x) => x === 0),
    true,
  );
  feed(worklet);
  worklet.process([], [[block]]);
  assert.equal(
    block.every((x) => x === 0.5),
    true,
  );
  worklet.port.onmessage({ data: { type: 'flush' } });
  worklet.process([], [[block]]);
  assert.equal(
    block.every((x) => x === 0),
    true,
  );
});
test('network bursts cannot grow the playback delay without bound', () => {
  const worklet = processor();
  feed(worklet, 100);
  assert.ok(worklet.count <= 9600);
});
test('underrun produces silence instead of repeating the last sample', () => {
  const worklet = processor(44100);
  feed(worklet);
  const block = new Float32Array(128);
  for (let i = 0; i < 40; i++) worklet.process([], [[block]]);
  assert.equal(
    block.every((x) => x === 0),
    true,
  );
  assert.ok(Number.isFinite(worklet.read));
});
