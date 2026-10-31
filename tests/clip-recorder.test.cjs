const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ClipRecorder, MAX_CLIP_SECONDS } = require('../shared/clip-recorder.mjs');
function packet() {
  const data = Buffer.alloc(1932);
  data.write('CND1');
  data.writeUInt32LE(48000, 8);
  for (let i = 12; i < data.length; i += 2) data.writeInt16LE(1234, i);
  return data;
}
test('WAV clips contain standard PCM headers and original microphone samples', () => {
  const recorder = new ClipRecorder();
  recorder.start(1000);
  recorder.append(packet(), 1020);
  const result = Buffer.from(recorder.finish(1020));
  assert.equal(result.toString('ascii', 0, 4), 'RIFF');
  assert.equal(result.toString('ascii', 8, 12), 'WAVE');
  assert.equal(result.readUInt32LE(24), 48000);
  assert.equal(result.readUInt16LE(22), 1);
  assert.equal(result.readUInt16LE(34), 16);
  assert.equal(result.readUInt32LE(40), 1920);
  assert.equal(result.readInt16LE(44), 1234);
  assert.equal(recorder.samples, null);
});
test('mute and reconnect gaps become silence instead of moving later speech earlier', () => {
  const recorder = new ClipRecorder();
  recorder.start(0);
  recorder.append(packet(), 20);
  recorder.markGap();
  recorder.append(packet(), 1020);
  const result = Buffer.from(recorder.finish(1020));
  assert.equal(result.readInt16LE(44), 1234);
  assert.equal(
    result.subarray(44 + 1920, 44 + 96000).every((value) => value === 0),
    true,
  );
  assert.equal(result.readInt16LE(44 + 96000), 1234);
});
test('recordings are bounded to two minutes and ignore malformed packets', () => {
  const recorder = new ClipRecorder();
  recorder.start(0);
  recorder.append(new Uint8Array(20), 20);
  assert.equal(recorder.cursor, 0);
  recorder.append(packet(), 999999);
  const result = recorder.finish(999999);
  assert.equal(result.byteLength, 44 + 48000 * 2 * MAX_CLIP_SECONDS);
  assert.equal(recorder.finish(999999), null);
});
