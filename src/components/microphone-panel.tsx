import type { CSSProperties } from 'react';
import { ClipControls } from './clip-controls';
import { AudioLines, Mic, MicOff, RefreshCw, ScanLine, Unplug, Wifi } from 'lucide-react';
import { useLanguage } from '@/i18n/provider';
import { sourceName } from '@/i18n/errors';
import { DesktopPairing } from './desktop-pairing';
import type { CindermicModel } from '@/hooks/use-cindermic';

interface Props {
  model: CindermicModel;
  elapsed: string;
  onOutput: () => void;
}
export function MicrophonePanel({ model, elapsed, onOutput }: Props) {
  const { t, locale } = useLanguage();
  const { state, phone, connected, live, level, levels, senderStatus } = model;
  const busy =
    senderStatus === 'starting' ||
    senderStatus === 'reconnecting' ||
    ['connecting', 'reconnecting'].includes(state.status);
  const label = connected
    ? state.muted
      ? t('unmute')
      : t('muteMic')
    : busy
      ? t('cancel')
      : phone
        ? t('connect')
        : t('startMic');
  const db = level > 0 ? Math.max(-60, Math.round(20 * Math.log10(level))) : null;
  return (
    <div className="microphone-layout">
      <section
        className={`mic-card ${live ? 'is-live' : ''} ${busy ? 'is-connecting' : ''}`}
        style={{ '--mic-energy': live ? Math.min(1, Math.sqrt(level) * 2) : 0 } as CSSProperties}
      >
        <div className="card-top">
          <span>
            <AudioLines size={17} />
            {connected
              ? sourceName(state.name, locale)
              : phone
                ? t('pairDesktop')
                : t('macMicrophone')}
          </span>
          <small>48 kHz · {t('mono')}</small>
        </div>
        <div className="mic-controls">
          <div className="mic-orbit" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <button
            className={`mic-button ${state.muted && connected ? 'is-muted' : ''}`}
            onClick={() => void model.mainAction()}
            disabled={!state.backendConnected}
            aria-label={
              connected
                ? state.muted
                  ? t('ariaUnmute')
                  : t('ariaMute')
                : busy
                  ? t('ariaCancel')
                  : phone
                    ? t('ariaConnect')
                    : t('ariaStartMac')
            }
          >
            {connected && state.muted ? (
              <MicOff size={36} />
            ) : busy ? (
              <RefreshCw size={36} className="connecting-icon" />
            ) : (
              <Mic size={36} />
            )}
            <strong>{label}</strong>
          </button>
          <div className="mic-under-button">
            {connected && <span className="session-duration">{elapsed}</span>}
            {!phone && (
              <span className="shortcut-hint" title={t('muteShortcut')}>
                <kbd>M</kbd> {t('muteShortcut')}
              </span>
            )}
          </div>
        </div>
        <div
          className="waveform"
          role="img"
          aria-label={live && level > 0 ? t('waveformLive') : t('waveformEmpty')}
        >
          {levels.map((value, index) => (
            <span
              key={index}
              style={{
                height: `${Math.max(3, Math.min(42, Math.sqrt(value) * 110))}px`,
                opacity: live && value > 0.001 ? 1 : 0.2,
              }}
            />
          ))}
        </div>
        <div className="meter-heading">
          <span>{t('inputLevel')}</span>
          <strong>
            {db === null ? '−∞' : db} {t('decibels')}
          </strong>
        </div>
        <div className="meter" aria-label={t('inputLevel')}>
          {Array.from({ length: 32 }, (_, index) => (
            <span
              key={index}
              className={
                db !== null && ((db + 60) / 60) * 32 > index
                  ? index > 27
                    ? 'meter-hot'
                    : 'meter-on'
                  : ''
              }
            />
          ))}
        </div>
        <div className="meter-scale">
          <span>−60</span>
          <span>−30</span>
          <span>−12</span>
          <span>0</span>
        </div>
        <div className="connection-detail">
          <span>
            <Wifi size={15} /> Wi-Fi
          </span>
          <span>
            {t('autoReconnect')} <CheckMark />
          </span>
        </div>
        {phone && !connected && (
          <div className="phone-pair-actions">
            {model.native && (
              <button
                className="primary-button"
                disabled={model.scanning}
                onClick={() => void model.scanPairing()}
              >
                <ScanLine size={18} />
                {model.scanning ? t('scanning') : t('scanQR')}
              </button>
            )}
            <button className="secondary-button" onClick={() => model.setPairingOpen(true)}>
              {t('manualConnection')}
            </button>
          </div>
        )}
        {(connected || busy) && (
          <button
            className="secondary-button disconnect-button"
            aria-label={t('ariaDisconnect')}
            onClick={() => void model.disconnect()}
          >
            <Unplug size={16} />
            {t('disconnect')}
          </button>
        )}
        {!phone && <ClipControls model={model} />}
        {!phone && (
          <button className="text-button" onClick={onOutput}>
            {t('navOutput')} →
          </button>
        )}
      </section>
      {!phone && (
        <section className="detail-card pairing-card">
          <DesktopPairing model={model} />
        </section>
      )}
    </div>
  );
}
function CheckMark() {
  return <span className="enabled-dot" aria-hidden="true" />;
}
