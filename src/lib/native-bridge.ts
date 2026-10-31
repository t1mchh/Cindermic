import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { AppState, Bridge, Command } from './types';

const plugin = registerPlugin<{
  command(command: Command): Promise<AppState>;
  scanPairing(): Promise<{ link?: string; cancelled?: boolean }>;
  addListener(event: string, callback: (state: AppState) => void): Promise<PluginListenerHandle>;
}>('Cindermic');

export class NativeBridge implements Bridge {
  private closed = false;
  private listeners: PluginListenerHandle[] = [];
  private states = new Set<(state: Partial<AppState>) => void>();
  private pairing = new Set<() => void>();
  async connect() {
    for (const event of ['state', 'pairingRequired']) {
      const handle = await plugin.addListener(event, (state) => {
        if (this.closed) return;
        if (event === 'state') {
          for (const listener of this.states) listener({ ...state, backendConnected: true });
        } else {
          for (const listener of this.pairing) listener();
        }
      });
      if (this.closed) {
        await handle.remove();
        return;
      }
      this.listeners.push(handle);
    }
    const state = await plugin.command({ type: 'state' });
    if (!this.closed)
      for (const listener of this.states) listener({ ...state, backendConnected: true });
  }
  scanPairing() {
    return plugin.scanPairing();
  }
  command(command: Command) {
    return plugin.command(command);
  }
  onState(listener: (state: Partial<AppState>) => void) {
    this.states.add(listener);
    return () => {
      this.states.delete(listener);
    };
  }
  onAudio() {
    return () => {};
  }
  onPairingRequired(listener: () => void) {
    this.pairing.add(listener);
    return () => {
      this.pairing.delete(listener);
    };
  }
  async getSession(): Promise<never> {
    throw new Error('Browser microphone testing is available on the Mac.');
  }
  close() {
    this.closed = true;
    for (const listener of this.listeners) void listener.remove();
    this.listeners = [];
  }
}
