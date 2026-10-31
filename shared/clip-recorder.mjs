import { isAudioPacket, SAMPLE_RATE, HEADER_BYTES } from './protocol.mjs';

export const MAX_CLIP_SECONDS = 120;

export class ClipRecorder {
  constructor() {
    this.samples = null;
    this.cursor = 0;
    this.started = 0;
    this.gap = false;
  }
  start(now) {
    this.samples = new Uint8Array(SAMPLE_RATE * MAX_CLIP_SECONDS * 2);
    this.cursor = 0;
    this.started = now;
    this.gap = false;
  }
  markGap() {
    this.gap = true;
  }
  append(packet, now) {
    if (!this.samples || !isAudioPacket(packet)) return;
    const pcm = packet.subarray(HEADER_BYTES);
    const elapsed = Math.max(0, Math.floor(((now - this.started) * SAMPLE_RATE) / 1000) * 2);
    if (this.gap || elapsed - this.cursor > SAMPLE_RATE * 0.16) {
      this.cursor = Math.min(this.samples.length, Math.max(this.cursor, elapsed - pcm.length));
    }
    this.gap = false;
    const length = Math.min(pcm.length, this.samples.length - this.cursor);
    this.samples.set(pcm.subarray(0, length), this.cursor);
    this.cursor += length;
  }
  finish(now) {
    if (!this.samples) return null;
    const length = Math.min(
      this.samples.length,
      Math.max(this.cursor, Math.floor((Math.max(0, now - this.started) * SAMPLE_RATE) / 1000) * 2),
    );
    const bytes = new Uint8Array(44 + length);
    const view = new DataView(bytes.buffer);
    const text = (offset, value) => {
      for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
    };
    text(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, length, true);
    bytes.set(this.samples.subarray(0, length), 44);
    this.clear();
    return bytes.buffer;
  }
  clear() {
    this.samples = null;
    this.cursor = 0;
  }
}
