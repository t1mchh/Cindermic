import { reconnectDelay } from '../../shared/protocol.mjs';
import type { Bridge } from './types';

export type SenderStatus = 'idle' | 'starting' | 'live' | 'reconnecting';

export class BrowserSender {
  onStatus?: (status: SenderStatus, error?: string) => void;
  private stream?: MediaStream;
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private socket?: WebSocket;
  private wanted = false;
  private authenticated = false;
  private muted = false;
  private generation = 0;
  private retry = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private handshake?: ReturnType<typeof setTimeout>;

  constructor(private bridge: Bridge) {}

  async start() {
    if (this.wanted) return;
    this.wanted = true;
    const generation = ++this.generation;
    this.onStatus?.('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (!this.wanted || generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const context = new AudioContext({ sampleRate: 48000 });
      this.context = context;
      await context.audioWorklet.addModule('/capture-worklet.js');
      if (!this.wanted || generation !== this.generation) return;
      this.node = new AudioWorkletNode(context, 'cindermic-capture');
      const silence = context.createGain();
      silence.gain.value = 0;
      context
        .createMediaStreamSource(stream)
        .connect(this.node)
        .connect(silence)
        .connect(context.destination);
      this.node.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
        if (
          this.authenticated &&
          this.socket?.readyState === WebSocket.OPEN &&
          this.socket.bufferedAmount < 65536
        )
          this.socket.send(data);
      };
      for (const track of stream.getAudioTracks())
        track.onended = () => {
          void this.stop();
          this.onStatus?.(
            'idle',
            'Microphone capture ended. Start it again when the device is available.',
          );
        };
      await context.resume();
      if (!this.wanted || generation !== this.generation) return;
      await this.openSocket(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      await this.stop();
      this.onStatus?.('idle', error instanceof Error ? error.message : String(error));
    }
  }

  private async openSocket(generation: number) {
    try {
      const session = await this.bridge.getSession();
      if (!this.wanted || generation !== this.generation) return;
      const url = new URL('/sender', session.url);
      url.protocol = 'ws:';
      url.searchParams.set('session', session.token);
      const socket = new WebSocket(url);
      this.socket = socket;
      this.handshake = setTimeout(() => socket.close(), 7000);
      socket.onopen = () =>
        socket.send(
          JSON.stringify({
            type: 'hello',
            name: 'Mac microphone',
            token: session.captureToken,
          }),
        );
      socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.type === 'welcome') {
          clearTimeout(this.handshake);
          this.authenticated = true;
          this.retry = 0;
          const muted = this.muted || message.muted;
          this.setMuted(muted);
          if (muted !== message.muted) socket.send(JSON.stringify({ type: 'mute', muted }));
          this.onStatus?.('live');
        }
        if (message.type === 'mute') this.setMuted(message.muted);
        if (message.type === 'disconnect') void this.stop();
      };
      socket.onclose = (event) => {
        if (this.socket !== socket || generation !== this.generation) return;
        this.authenticated = false;
        clearTimeout(this.handshake);
        if ([4001, 4002, 4003].includes(event.code)) {
          void this.stop();
          this.onStatus?.('idle', 'The sender was rejected or replaced. Start it again to pair.');
          return;
        }
        this.scheduleRetry(generation);
      };
      socket.onerror = () => socket.close();
    } catch {
      this.scheduleRetry(generation);
    }
  }

  private scheduleRetry(generation: number) {
    if (!this.wanted || generation !== this.generation) return;
    this.onStatus?.('reconnecting');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.openSocket(generation), reconnectDelay(++this.retry));
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.node?.port.postMessage({ muted });
  }

  async stop() {
    this.wanted = false;
    this.generation++;
    clearTimeout(this.timer);
    clearTimeout(this.handshake);
    this.authenticated = false;
    const socket = this.socket;
    this.socket = undefined;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'disconnect' }));
    socket?.close();
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = undefined;
    this.node?.disconnect();
    this.node = undefined;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') await context.close();
    this.onStatus?.('idle');
  }
}
