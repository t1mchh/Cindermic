export type SoundProfile = 'natural' | 'voice' | 'warm';

type RoutedAudioContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

export class AudioReceiver {
  private context?: RoutedAudioContext;
  private node?: AudioWorkletNode;
  private gain?: GainNode;
  private highpass?: BiquadFilterNode;
  private presence?: BiquadFilterNode;
  private profile: SoundProfile = 'natural';
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
      this.presence = context.createBiquadFilter();
      this.presence.type = 'peaking';
      this.presence.Q.value = 0.7;
      this.setProfile(this.profile);
      this.compressor = context.createDynamicsCompressor();
      this.compressor.threshold.value = -8;
      this.compressor.ratio.value = 8;
      this.compressor.knee.value = 6;
      this.compressor.attack.value = 0.003;
      this.gain = context.createGain();
      this.gain.gain.value = this.isMuted ? 0 : this.volume;
      this.node
        .connect(this.highpass)
        .connect(this.presence)
        .connect(this.gain)
        .connect(this.compressor)
        .connect(context.destination);
      await context.resume();
    } catch (error) {
      if (generation === this.generation) await this.stop();
      throw error;
    }
  }
  setProfile(profile: SoundProfile) {
    this.profile = profile;
    if (!this.context || !this.highpass || !this.presence) return;
    const now = this.context.currentTime;
    this.highpass.frequency.setTargetAtTime(
      profile === 'voice' ? 120 : profile === 'warm' ? 50 : 70,
      now,
      0.04,
    );
    this.presence.frequency.setTargetAtTime(profile === 'warm' ? 220 : 2800, now, 0.04);
    this.presence.gain.setTargetAtTime(
      profile === 'natural' ? 0 : profile === 'voice' ? 3 : 2.5,
      now,
      0.04,
    );
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
    this.presence?.disconnect();
    this.presence = undefined;
    this.gain?.disconnect();
    this.gain = undefined;
    this.compressor?.disconnect();
    this.compressor = undefined;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') await context.close();
  }
}
