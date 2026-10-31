import { WebPlugin } from '@capacitor/core';

export class CindermicAudioWeb extends WebPlugin {
  constructor() {
    super({
      name: 'CindermicAudio',
    });
  }

  async startAudio() {
    // Web implementation using Web Audio API
    return new Promise((resolve, reject) => {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          const audioContext = new AudioContext({ sampleRate: 48000 });
          const source = audioContext.createMediaStreamSource(stream);
          const processor = audioContext.createScriptProcessor(4096, 1, 1);

          let sequence = 0;

          processor.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const pcm = new Array(input.length);

            for (let i = 0; i < input.length; i++) {
              pcm[i] = input[i];
            }

            const level = Math.sqrt(input.reduce((sum, val) => sum + val * val, 0) / input.length);

            this.notifyListeners('onVolume', { level });

            // Create binary packet: magic(4) + seq(4) + rate(4) + PCM
            const packetSize = 12 + pcm.length * 2;
            const buffer = new ArrayBuffer(packetSize);
            const view = new DataView(buffer);

            view.setUint32(0, 0x434e4431, true); // Magic CND1
            view.setUint32(4, sequence++, true); // Sequence
            view.setUint32(8, 48000, true); // Sample rate

            for (let i = 0; i < pcm.length; i++) {
              view.setInt16(12 + i * 2, pcm[i], true);
            }

            const uint8 = new Uint8Array(buffer);
            this.notifyListeners('onSamples', { pcm: uint8, level });
          };

          source.connect(processor);
          processor.connect(audioContext.destination);
          resolve();
        })
        .catch((err) => reject(err));
    });
  }

  async stopAudio() {
    this.notifyListeners('onSamples', { pcm: new Uint8Array(0), level: 0 });
    return;
  }

  async disconnectAudio() {
    return this.stopAudio();
  }

  async checkPermission() {
    return { granted: 'Microphone' in navigator.mediaDevices };
  }

  async requestPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return { granted: true };
    } catch (e) {
      return { granted: false };
    }
  }
}

const CindermicAudio = new CindermicAudioWeb();

export { CindermicAudio };
export default CindermicAudio;
