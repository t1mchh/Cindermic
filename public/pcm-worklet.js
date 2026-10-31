/* Incoming packets: 'CND1', uint32 sequence LE, uint32 sample rate LE, mono PCM16 LE. */
class CindermicPCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(24000);
    this.read = 0;
    this.write = 0;
    this.count = 0;
    this.started = false;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'flush') {
        this.count = 0;
        this.read = this.write;
        this.started = false;
        return;
      }
      let packet;
      try {
        packet = new DataView(data.data);
      } catch {
        return;
      }
      if (
        packet.byteLength < 14 ||
        packet.byteLength > 9612 ||
        (packet.byteLength - 12) % 2 !== 0 ||
        packet.getUint32(0, false) !== 0x434e4431 ||
        packet.getUint32(8, true) !== 48000
      )
        return;
      const length = (packet.byteLength - 12) / 2;
      // TCP can deliver a burst of stale packets. Bound delay rather than replaying it.
      if (this.count + length > 9600) {
        this.count = 0;
        this.read = this.write;
        this.started = false;
      }
      for (let i = 0; i < length; i++) {
        this.buffer[this.write] = packet.getInt16(12 + i * 2, true) / 32768;
        this.write = (this.write + 1) % this.buffer.length;
        this.count++;
      }
    };
  }
  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;
    if (!this.started && this.count >= 2880) this.started = true;
    const step = 48000 / sampleRate;
    for (let i = 0; i < output.length; i++) {
      if (!this.started || this.count < Math.ceil(step) + 1) {
        output[i] = 0;
        if (this.started) this.started = false;
        continue;
      }
      const index = Math.floor(this.read),
        fraction = this.read - index;
      output[i] =
        this.buffer[index] * (1 - fraction) +
        this.buffer[(index + 1) % this.buffer.length] * fraction;
      const next = this.read + step;
      const consumed = Math.floor(next) - Math.floor(this.read);
      this.read = next % this.buffer.length;
      this.count -= consumed;
    }
    return true;
  }
}
registerProcessor('cindermic-pcm', CindermicPCM);
