import { reconnectDelay } from '../../shared/protocol.mjs';
import type { AppState, Bridge, Command } from './types';

export function backendUrl() {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  return window.location.port === '3000' ? 'http://127.0.0.1:43130' : window.location.origin;
}

export class WebBridge implements Bridge {
  constructor(
    private connectTimeout = 7000,
    private commandTimeout = 5000,
  ) {}
  private socket?: WebSocket;
  private stopped = true;
  private retry = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private sequence = 0;
  private generation = 0;
  private handshake?: ReturnType<typeof setTimeout>;
  private states = new Set<(state: Partial<AppState>) => void>();
  private audio = new Set<(data: Uint8Array) => void>();
  private pending = new Map<
    number,
    {
      resolve: (state: AppState) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  onState(listener: (state: Partial<AppState>) => void) {
    this.states.add(listener);
    return () => {
      this.states.delete(listener);
    };
  }
  onAudio(listener: (data: Uint8Array) => void) {
    this.audio.add(listener);
    return () => {
      this.audio.delete(listener);
    };
  }
  onPairingRequired() {
    return () => {};
  }

  async getSession() {
    const url = backendUrl();
    const response = await fetch(`${url}/api/session`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok)
      throw new Error('This session couldn’t connect. Reopen Cindermic and try again.');
    return { ...((await response.json()) as { token: string; captureToken: string }), url };
  }

  private publish(state: Partial<AppState>) {
    for (const listener of this.states) listener(state);
  }

  async connect() {
    this.stopped = false;
    const generation = ++this.generation;
    try {
      const session = await this.getSession();
      if (this.stopped || generation !== this.generation) return;
      const url = new URL('/control', session.url);
      url.protocol = 'ws:';
      url.searchParams.set('session', session.token);
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.binaryType = 'arraybuffer';
      this.handshake = setTimeout(() => socket.close(), this.connectTimeout);
      socket.onmessage = (event) => {
        if (this.stopped || this.socket !== socket) return;
        if (event.data instanceof ArrayBuffer) {
          for (const listener of this.audio) listener(new Uint8Array(event.data));
          return;
        }
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          socket.close(4003);
          return;
        }
        if (!message || typeof message !== 'object') return;
        if (message.state) {
          clearTimeout(this.handshake);
          this.retry = 0;
          this.publish(message.state);
        }
        const pending = this.pending.get(message.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if (message.type === 'error') pending.reject(new Error(message.error));
          else pending.resolve(message.state);
        }
      };
      socket.onclose = () => {
        if (this.socket !== socket) return;
        clearTimeout(this.handshake);
        this.rejectPending();
        this.scheduleRetry();
      };
      socket.onerror = () => socket.close();
    } catch {
      if (generation === this.generation) this.scheduleRetry();
    }
  }

  private scheduleRetry() {
    this.publish({
      backendConnected: false,
      status: 'offline',
      error: this.retry >= 2 ? 'Cindermic stopped responding. Reopen the desktop app.' : '',
    });
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.connect(), reconnectDelay(++this.retry));
  }

  command(command: Command): Promise<AppState> {
    const socket = this.socket;
    if (socket?.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error('Cindermic is reconnecting. Try again in a moment.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Your connection isn’t responding. Try again.'));
      }, this.commandTimeout);
      this.pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, command }));
    });
  }

  private rejectPending() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Connection lost. Reconnecting…'));
    }
    this.pending.clear();
  }

  close() {
    this.stopped = true;
    this.generation++;
    clearTimeout(this.timer);
    clearTimeout(this.handshake);
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.rejectPending();
  }
}
