'use client';
import { useState } from 'react';
import { CircleHelp, X } from 'lucide-react';
import { useLanguage } from '@/i18n/provider';
import { localizeError } from '@/i18n/errors';
import { AppShell } from '@/components/app-shell';
import { MicrophonePanel } from '@/components/microphone-panel';
import { OutputPanel } from '@/components/output-panel';
import { PairingDialog } from '@/components/pairing-dialog';
import { SetupPanel } from '@/components/setup-panel';
import { useCindermic } from '@/hooks/use-cindermic';
import { useTheme } from '@/hooks/use-theme';
import { useSessionClock } from '@/hooks/use-session-clock';
import type { Panel } from '@/lib/types';

export default function Home() {
  const { t, locale } = useLanguage();
  const [panel, setPanel] = useState<Panel>('mic');
  const model = useCindermic();
  const { theme, toggleTheme } = useTheme();
  const elapsed = useSessionClock(model.connected);
  const status = !model.state.backendConnected
    ? t('gettingReady')
    : model.state.status === 'failed'
      ? t('failed')
      : model.state.status === 'interrupted'
        ? t('paused')
        : model.connected
          ? model.state.muted
            ? t('muted')
            : t('onAir')
          : model.senderStatus === 'starting' || model.state.status === 'connecting'
            ? t('connecting')
            : model.senderStatus === 'reconnecting' || model.state.status === 'reconnecting'
              ? t('reconnecting')
              : t('disconnected');
  const errors = [...new Set([model.notice, model.state.error].filter(Boolean))] as string[];
  return (
    <AppShell
      panel={panel}
      onPanelChange={setPanel}
      phone={model.phone}
      theme={theme}
      onThemeChange={toggleTheme}
    >
      <section className="page-heading">
        <h1>
          {panel === 'mic' ? t('navMic') : panel === 'output' ? t('navOutput') : t('navGuide')}
        </h1>
        <span className={`session-badge ${model.live ? 'is-live' : ''}`} role="status">
          <span className="status-indicator" />
          {status}
        </span>
      </section>
      {!model.pairingOpen &&
        errors.map((error) => (
          <div className="notice" role="alert" key={error}>
            <CircleHelp size={18} />
            <span>{localizeError(error, locale)}</span>
            {error === model.notice && (
              <button className="icon-button" aria-label={t('dismiss')} onClick={model.clearNotice}>
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      {panel === 'mic' && (
        <MicrophonePanel model={model} elapsed={elapsed} onOutput={() => setPanel('output')} />
      )}
      {panel === 'output' && <OutputPanel model={model} />}
      {panel === 'setup' && <SetupPanel />}
      {model.pairingOpen && <PairingDialog model={model} />}
    </AppShell>
  );
}
