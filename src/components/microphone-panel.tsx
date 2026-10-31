import { useLanguage } from '@/i18n/provider';
import { sourceName } from '@/i18n/errors';
import { useRef, type CSSProperties, type PointerEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Battery,
  Check,
  Headphones,
  Mic,
  MicOff,
  RefreshCw,
  Smartphone,
  Wifi,
} from 'lucide-react';
import type { CindermicModel } from '@/hooks/use-cindermic';

interface Props {
  model: CindermicModel;
  elapsed: string;
  onOutput: () => void;
}

export function MicrophonePanel({ model, elapsed, onOutput }: Props) {
  const { t, locale } = useLanguage();
  const { state, phone, connected, live, level, levels, senderStatus } = model;
  const stage = useRef<HTMLDivElement>(null);
  const busy =
    senderStatus === 'starting' ||
    senderStatus === 'reconnecting' ||
    state.status === 'connecting' ||
    state.status === 'reconnecting';
  const label = connected
    ? state.muted
      ? t('unmute')
      : t('muteMic')
    : busy
      ? t('cancel')
      : phone
        ? t('connect')
        : t('startMic');
  const status = !state.backendConnected
    ? t('studioPreparing')
    : state.status === 'interrupted'
      ? t('micWaiting')
      : senderStatus === 'reconnecting' || state.status === 'reconnecting'
        ? t('findingConnection')
        : busy
          ? t('connectingProgress')
          : connected
            ? state.muted
              ? t('quiet')
              : t('liveMessage')
            : t('idleMessage');
  const db = level > 0 ? Math.max(-60, Math.round(20 * Math.log10(level))) : null;

  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      '--tilt-x',
      `${((event.clientY - bounds.top) / bounds.height - 0.5) * -10}deg`,
    );
    event.currentTarget.style.setProperty(
      '--tilt-y',
      `${((event.clientX - bounds.left) / bounds.width - 0.5) * 10}deg`,
    );
  }
  function reset() {
    stage.current?.style.setProperty('--tilt-x', '0deg');
    stage.current?.style.setProperty('--tilt-y', '0deg');
  }

  return (
    <div className="dashboard-grid">
      <section
        className={`mic-card glass ${live ? 'is-live' : ''} ${state.muted && connected ? 'is-muted' : ''} scale-enter`}
        style={{ '--audio-level': Math.min(1, Math.sqrt(level) * 2) } as CSSProperties}
      >
        <div className="card-top">
          <span className="section-label">
            <span className="tiny-dot" />
            {t('navMic')}
          </span>
          <span className="format-label">
            48 kHz <i />
            {t('mono')}
          </span>
        </div>
        <span className="mic-card-word" aria-hidden="true">
          {t('onAirCaps')}
        </span>
        <div ref={stage} className="mic-stage" onPointerMove={move} onPointerLeave={reset}>
          <div className="orb-system">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="orbit orbit-three" />
            <span className="orb-tick tick-top" />
            <span className="orb-tick tick-bottom" />
            <span className="orb-tick tick-left" />
            <span className="orb-tick tick-right" />
            <span className="orb-satellite satellite-one" />
            <span className="orb-satellite satellite-two" />
            <button
              className="mic-button pulse"
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
              <span className="mic-button-glare" aria-hidden="true" />
              {state.muted && connected ? (
                <MicOff size={43} strokeWidth={1.6} />
              ) : busy ? (
                <RefreshCw className="connecting-icon" size={43} strokeWidth={1.6} />
              ) : (
                <Mic size={43} strokeWidth={1.6} />
              )}
              <strong>{label}</strong>
              <span className="mic-button-caption">
                {connected ? (state.muted ? t('voiceBack') : t('tapQuiet')) : t('makeNoise')}
              </span>
            </button>
          </div>
        </div>
        <div className="mic-status" aria-live="polite">
          {live && <span className="tiny-dot" />}
          {status}
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
                height: `${Math.max(3, Math.min(38, Math.sqrt(value) * 110))}px`,
                opacity: live && value > 0.001 ? 1 : 0.22,
              }}
            />
          ))}
        </div>
        <div className="mic-footer">
          <span>
            <AudioLines size={14} />
            {connected ? t('voiceLive') : t('readyHeard')}
          </span>
          <span className="session-duration">{connected ? elapsed : '— : —'}</span>
        </div>
      </section>

      <div className="details-column">
        <section className="detail-card connection-card glass">
          <div className="card-title">
            <h2>{t('yourConnection')}</h2>
            <span className="card-index">01 /</span>
          </div>
          <div className="wifi-connection">
            <span className="wifi-icon">
              <Wifi size={25} />
            </span>
            <div>
              <strong>Wi-Fi</strong>
              <span>{t('lessWire')}</span>
            </div>
            <span className="connection-tag">{t('wireless')}</span>
          </div>
          <div className="source-row">
            <span className="source-icon">
              {phone ? <Smartphone size={20} /> : <Mic size={20} />}
            </span>
            <div>
              <small>{connected ? t('connectedTo') : t('yourMicrophone')}</small>
              <strong>
                {connected
                  ? sourceName(state.name, locale)
                  : phone
                    ? t('pairDesktop')
                    : t('macReady')}
              </strong>
            </div>
            {connected && <span className="tiny-dot green" />}
          </div>
          <div className="connection-detail">
            <span>{t('autoReconnect')}</span>
            <strong>
              <Check size={13} />
              {t('on')}
            </strong>
          </div>
          {typeof state.battery === 'number' && (
            <div className="connection-detail">
              <span>{t('battery')}</span>
              <strong>
                <Battery size={15} />
                {Math.round(state.battery * 100)}%
              </strong>
            </div>
          )}
          <button
            className="text-button pair-action"
            aria-label={connected || senderStatus !== 'idle' ? t('ariaDisconnect') : t('ariaPair')}
            onClick={() =>
              connected || senderStatus !== 'idle'
                ? void model.disconnect()
                : model.setPairingOpen(true)
            }
          >
            {connected || senderStatus !== 'idle'
              ? t('disconnect')
              : phone
                ? t('pairADesktop')
                : t('pairIPhone')}
            <ArrowUpRight size={16} />
          </button>
        </section>
        <section className="detail-card signal-card glass">
          <div className="card-title">
            <h2>{t('soundCheck')}</h2>
            <span className="card-index">02 /</span>
          </div>
          <div className="signal-reading">
            <span className="signal-value">
              {db === null ? '−∞' : db}
              <small>{t('decibels')}</small>
            </span>
            <span className={`signal-state ${live ? 'active' : ''}`}>
              <span className="tiny-dot" />
              {state.muted && connected ? t('muted') : live ? t('listening') : t('standby')}
            </span>
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
          <p>{state.muted && connected ? t('mutedHint') : live ? t('liveHint') : t('idleHint')}</p>
        </section>
      </div>
      <section className="bottom-strip">
        <span className="strip-icon">
          <Headphones size={25} />
        </span>
        <div>
          <span className="strip-eyebrow">{t('finalTouch')}</span>
          <strong>{t('yourDestination')}</strong>
          <p>{model.routing ? t('outputReady') : t('outputChoose')}</p>
        </div>
        <button className="secondary-button" onClick={onOutput}>
          {t('navOutput')}
          <ArrowRight size={17} />
        </button>
        <span className="strip-decor" aria-hidden="true">
          ↗
        </span>
      </section>
    </div>
  );
}
