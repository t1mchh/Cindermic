export type MicStatus =
  'offline' | 'connecting' | 'connected' | 'reconnecting' | 'interrupted' | 'failed';

export interface AppState {
  status: MicStatus;
  muted: boolean;
  backendConnected: boolean;
  name?: string;
  error?: string;
  battery?: number;
  level?: number;
  retry?: number;
  frames?: number;
  addresses?: string[];
  port?: number;
  pairing?: string | null;
  qr?: string | null;
}

export type Command =
  | { type: 'state' | 'connect' | 'disconnect' }
  | { type: 'mute'; muted: boolean }
  | { type: 'pairHost'; host: string }
  | { type: 'pair'; link: string };

export interface Bridge {
  connect(): Promise<void>;
  close(): void;
  command(command: Command): Promise<AppState | undefined>;
  onState(listener: (state: Partial<AppState>) => void): () => void;
  onAudio(listener: (data: Uint8Array) => void): () => void;
  onPairingRequired(listener: () => void): () => void;
  scanPairing?(): Promise<{ link?: string; cancelled?: boolean }>;
  getSession(): Promise<{ token: string; captureToken: string; url: string }>;
}

export type Panel = 'mic' | 'output' | 'setup';
