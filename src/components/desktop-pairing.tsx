import { useState } from 'react';
import { Check, Copy, Smartphone } from 'lucide-react';
import { useLanguage } from '@/i18n/provider';
import type { CindermicModel } from '@/hooks/use-cindermic';

export function DesktopPairing({ model }: { model: CindermicModel }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const { state } = model;
  return (
    <div className="desktop-pairing">
      <h2>
        <Smartphone size={18} />
        {t('pairPhone')}
      </h2>
      <p>{t('scanInstruction')}</p>
      {state.qr ? (
        <img className="pair-qr" src={state.qr} alt={t('qrAlt')} width={224} height={224} />
      ) : (
        <div className="pair-placeholder">
          {state.backendConnected && !state.addresses?.length ? t('noNetwork') : t('preparingCode')}
        </div>
      )}
      {(state.addresses?.length || 0) > 1 && (
        <label className="pair-network">
          {t('address')}
          <select
            value={state.pairing ? new URL(state.pairing).searchParams.get('host') || '' : ''}
            onChange={(event) => void model.command({ type: 'pairHost', host: event.target.value })}
          >
            {state.addresses?.map((address) => (
              <option key={address}>{address}</option>
            ))}
          </select>
        </label>
      )}
      <button
        className="secondary-button"
        disabled={!state.pairing}
        onClick={() => void model.copyPairing().then(setCopied)}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? t('copied') : t('copyLink')}
      </button>
      <details>
        <summary>{t('manualConnection')}</summary>
        <label className="sr-only" htmlFor="desktop-pairing">
          {t('pairingLink')}
        </label>
        <textarea id="desktop-pairing" readOnly value={state.pairing || ''} />
        <small>{t('privateLink')}</small>
      </details>
    </div>
  );
}
