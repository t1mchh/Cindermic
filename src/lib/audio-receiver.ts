type RoutedAudioContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

export class AudioReceiver {
  private context?: RoutedAudioContext;
  private node?: AudioWorkletNode;
  private gain?: GainNode;
  private highpass?: BiquadFilterNode;
  private compressor?: DynamicsCompressorNode;
  private isMuted = false;
  private volume = 1;

  async start(deviceId: string) {
    await this.stop();
    const context = new AudioContext({
      latencyHint: 'interactive',
      sampleRate: 48000,
    }) as RoutedAudioContext;
    this.context = context;
    try {
      if (context.setSinkId) await context.setSinkId(deviceId);
      else if (deviceId) throw new Error('This runtime cannot select an audio output.');
      await context.audioWorklet.addModule('/pcm-worklet.js');
      this.node = new AudioWorkletNode(context, 'cindermic-pcm', { outputChannelCount: [1] });
      this.highpass = context.createBiquadFilter();
      this.highpass.type = 'highpass';
      this.highpass.frequency.value = 70;
      this.compressor = context.createDynamicsCompressor();
      this.compressor.threshold.value = -8;
      this.compressor.ratio.value = 8;
      this.compressor.knee.value = 6;
      this.compressor.attack.value = 0.003;
      this.gain = context.createGain();
      this.gain.gain.value = this.isMuted ? 0 : this.volume;
      this.node
        .connect(this.highpass)
        .connect(this.gain)
        .connect(this.compressor)
        .connect(context.destination);
      await context.resume();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  push(data: Uint8Array) {
    if (!this.node) return;
    const copy = new Uint8Array(data);
    this.node.port.postMessage({ type: 'pcm', data: copy.buffer }, [copy.buffer]);
  }
  mute(muted: boolean) {
    this.isMuted = muted;
    if (this.context && this.gain)
      this.gain.gain.setTargetAtTime(muted ? 0 : this.volume, this.context.currentTime, 0.005);
    if (muted) this.flush();
  }
  setGain(value: number) {
    this.volume = value;
    this.mute(this.isMuted);
  }
  flush() {
    this.node?.port.postMessage({ type: 'flush' });
  }
  async stop() {
    this.node?.disconnect();
    this.node = undefined;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') await context.close();
  }
}
