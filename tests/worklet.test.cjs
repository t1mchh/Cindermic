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

test('capture worklet produces receiver-compatible CND1 packets and muted silence', () => {
  const { validPacket } = require('../server/receiver.cjs');
  let Processor;
  const packets = [];
  const context = vm.createContext({
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { postMessage: (packet) => packets.push(packet) };
      }
    },
    registerProcessor: (_, value) => {
      Processor = value;
    },
  });
  vm.runInContext(
    fs.readFileSync(require.resolve('../public/capture-worklet.js'), 'utf8'),
    context,
  );
  const capture = new Processor();
  capture.process([[new Float32Array(960).fill(0.5)]]);
  assert.equal(validPacket(new Uint8Array(packets[0])), true);
  assert.equal(Buffer.from(packets[0]).subarray(0, 4).toString(), 'CND1');
  assert.equal(new DataView(packets[0]).getInt16(12, true), 16383);
  capture.port.onmessage({ data: { muted: true } });
  capture.process([[new Float32Array(960).fill(0.5)]]);
  assert.equal(
    Buffer.from(packets[1])
      .subarray(12)
      .every((value) => value === 0),
    true,
  );
});

test('playback consumes audio at the actual output sample rate', () => {
  const worklet = processor();
  feed(worklet, 5);
  const before = worklet.count;
  worklet.process([], [[new Float32Array(128)]]);
  assert.equal(before - worklet.count, 128);
});
