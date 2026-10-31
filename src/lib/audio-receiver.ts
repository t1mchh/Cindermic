type RoutedAudioContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

export class AudioReceiver {
  private context?: RoutedAudioContext;
  private node?: AudioWorkletNode;
  private gain?: GainNode;
  private highpass?: BiquadFilterNode;
  private compressor?: DynamicsCompressorNode;
  private isMuted = false;
  private volume = 1;
  private generation = 0;

  async start(deviceId: string) {
    const generation = ++this.generation;
    await this.cleanup();
    if (generation !== this.generation) return;
    const context = new AudioContext({
      latencyHint: 'interactive',
      sampleRate: 48000,
    }) as RoutedAudioContext;
    this.context = context;
    try {
      if (context.setSinkId) await context.setSinkId(deviceId);
      else if (deviceId) throw new Error('This runtime cannot select an audio output.');
      await context.audioWorklet.addModule('/pcm-worklet.js');
      if (generation !== this.generation) return;
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
      if (generation === this.generation) await this.stop();
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
    this.generation++;
    await this.cleanup();
  }
  private async cleanup() {
    this.node?.disconnect();
    this.node = undefined;
    this.highpass?.disconnect();
    this.highpass = undefined;
    this.gain?.disconnect();
    this.gain = undefined;
    this.compressor?.disconnect();
    this.compressor = undefined;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') await context.close();
  }
}
