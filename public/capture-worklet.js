class CindermicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(960);
    this.length = 0;
    this.sequence = 0;
    this.muted = false;
    this.port.onmessage = ({ data }) => {
      this.muted = data.muted;
    };
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const value of input) {
      this.samples[this.length++] = this.muted ? 0 : value;
      if (this.length !== 960) continue;
      const packet = new ArrayBuffer(1932);
      const view = new DataView(packet);
      view.setUint32(0, 0x434e4431);
      view.setUint32(4, this.sequence, true);
      this.sequence++;
      view.setUint32(8, 48000, true);
      for (let i = 0; i < 960; i++)
        view.setInt16(12 + i * 2, Math.max(-32768, Math.min(32767, this.samples[i] * 32767)), true);
      this.port.postMessage(packet, [packet]);
      this.length = 0;
    }
    return true;
  }
}

registerProcessor('cindermic-capture', CindermicCapture);
