import { useLanguage } from '@/i18n/provider';
import { CircleHelp, RefreshCw, Volume2 } from 'lucide-react';
import type { CindermicModel } from '@/hooks/use-cindermic';

export function OutputPanel({ model }: { model: CindermicModel }) {
  const { t } = useLanguage();
  if (model.phone)
    return (
      <section className="output-panel">
        <h2>{t('desktopSound')}</h2>
        <p>{t('desktopSoundHint')}</p>
      </section>
    );
  return (
    <section className="output-panel">
      <div className="output-selector">
        <label htmlFor="device">{t('outputDevice')}</label>
        <div>
          <select
            id="device"
            value={model.deviceId}
            onChange={(event) => model.selectDevice(event.target.value)}
          >
            <option value="">{t('chooseOutput')}</option>
            <option value="default">{t('systemDefault')}</option>
            {model.devices
              .filter((device) => device.deviceId !== 'default')
              .map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || device.deviceId}
                </option>
              ))}
          </select>
          <button className="secondary-button" onClick={() => void model.findOutputs()}>
            <RefreshCw size={15} />
            {t('refresh')}
          </button>
        </div>
      </div>
      <label className="gain-label" htmlFor="gain">
        {t('volume')}
        <strong>{model.gain}%</strong>
      </label>
      <input
        id="gain"
        type="range"
        min="0"
        max="200"
        value={model.gain}
        onChange={(event) => model.changeGain(Number(event.target.value))}
      />
      <div className="routing-row">
        <span>
          <span className={`tiny-dot ${model.routing ? 'green' : ''}`} />
          {model.routing ? t('outputOn') : t('outputOff')}
        </span>
        <button className="primary-button" onClick={() => void model.toggleRouting()}>
          {model.routing ? t('stopOutput') : t('enableOutput')}
          <Volume2 size={16} />
        </button>
      </div>
      <div className="note">
        <CircleHelp size={17} />
        <span>{t('outputNote')}</span>
      </div>
    </section>
  );
}
