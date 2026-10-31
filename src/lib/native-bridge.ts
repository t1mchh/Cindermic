import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { AppState, Bridge, Command } from './types';

const plugin = registerPlugin<{
  command(command: Command): Promise<AppState>;
  addListener(event: string, callback: (state: AppState) => void): Promise<PluginListenerHandle>;
}>('Cindermic');

export class NativeBridge implements Bridge {
  private listeners: PluginListenerHandle[] = [];
  private states = new Set<(state: Partial<AppState>) => void>();
  private pairing = new Set<() => void>();
  async connect() {
    this.listeners.push(
      await plugin.addListener('state', (state) => {
        for (const listener of this.states) listener({ ...state, backendConnected: true });
      }),
    );
    this.listeners.push(
      await plugin.addListener('pairingRequired', () => {
        for (const listener of this.pairing) listener();
      }),
    );
    const state = await plugin.command({ type: 'state' });
    for (const listener of this.states) listener({ ...state, backendConnected: true });
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
    for (const listener of this.listeners) void listener.remove();
    this.listeners = [];
  }
}
