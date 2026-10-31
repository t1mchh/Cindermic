'use client';

import { useLanguage } from '@/i18n/provider';

import { localizeError } from '@/i18n/errors';

import { useState } from 'react';
import { ArrowUpRight, CircleHelp, X } from 'lucide-react';
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
  const headings = {
    mic: {
      label: t('heroMicLabel'),
      title: t('heroMicTitle'),
      accent: t('heroMicAccent'),
      description: t('heroMicDescription'),
    },
    output: {
      label: t('heroOutputLabel'),
      title: t('heroOutputTitle'),
      accent: t('heroOutputAccent'),
      description: t('heroOutputDescription'),
    },
    setup: {
      label: t('heroGuideLabel'),
      title: t('heroGuideTitle'),
      accent: t('heroGuideAccent'),
      description: t('heroGuideDescription'),
    },
  };

  const [panel, setPanel] = useState<Panel>('mic');
  const model = useCindermic();
  const { theme, toggleTheme } = useTheme();
  const elapsed = useSessionClock(model.connected);
  const heading = headings[panel];
  const status = !model.state.backendConnected
    ? t('gettingReady')
    : model.connected
      ? model.state.muted
        ? t('muted')
        : model.state.status === 'interrupted'
          ? t('paused')
          : t('onAir')
      : model.senderStatus === 'starting' || model.state.status === 'connecting'
        ? t('connecting')
        : model.senderStatus === 'reconnecting' || model.state.status === 'reconnecting'
          ? t('reconnecting')
          : t('standby');

  return (
    <AppShell
      panel={panel}
      onPanelChange={setPanel}
      phone={model.phone}
      theme={theme}
      onThemeChange={toggleTheme}
    >
      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <span />
            {heading.label}
          </div>
          <h1>
            {heading.title} <em>{heading.accent}</em>
          </h1>
          <p>{heading.description}</p>
        </div>
        <div className={`session-badge ${model.live ? 'is-live' : ''}`}>
          <span className="status-indicator" />
          <div>
            <span>{status}</span>
            <small>
              {model.connected ? elapsed : status === t('standby') ? t('micOff') : t('oneMoment')}
            </small>
          </div>
          <AudioBadge />
        </div>
      </section>
      <div className="panel-content" key={panel}>
        {panel === 'mic' && (
          <MicrophonePanel model={model} elapsed={elapsed} onOutput={() => setPanel('output')} />
        )}
        {panel === 'output' && <OutputPanel model={model} />}
        {panel === 'setup' && <SetupPanel />}
      </div>
      {model.notice && (
        <div className="notice" role="alert">
          <CircleHelp size={18} />
          <span>{localizeError(model.notice, locale)}</span>
          <button className="icon-button" aria-label={t('dismiss')} onClick={model.clearNotice}>
            <X size={16} />
          </button>
        </div>
      )}
      {model.state.error && (
        <div className="notice" role="alert">
          <CircleHelp size={18} />
          <span>{localizeError(model.state.error, locale)}</span>
        </div>
      )}
      <footer className="page-footer">
        <span>
          CINDERMIC <i /> {t('footer')}
        </span>
        <button onClick={() => setPanel('setup')}>
          {t('help')}
          <ArrowUpRight size={13} />
        </button>
      </footer>
      {model.pairingOpen && <PairingDialog model={model} />}
    </AppShell>
  );
}

function AudioBadge() {
  return (
    <span className="badge-bars" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
