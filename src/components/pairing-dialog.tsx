import { useLanguage } from '@/i18n/provider';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Monitor, ShieldCheck, Smartphone, X } from 'lucide-react';
import type { CindermicModel } from '@/hooks/use-cindermic';

export function PairingDialog({ model }: { model: CindermicModel }) {
  const { t } = useLanguage();
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const { state, phone } = model;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="pair-modal glass"
      aria-labelledby="pair-title"
      onCancel={() => model.setPairingOpen(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) model.setPairingOpen(false);
      }}
    >
      <button
        className="modal-close icon-button"
        aria-label={t('closePairing')}
        onClick={() => model.setPairingOpen(false)}
      >
        <X size={20} />
      </button>
      <span className="pair-icon">{phone ? <Monitor size={26} /> : <Smartphone size={26} />}</span>
      <h2 id="pair-title">{phone ? t('meetDesktop') : t('pairPhone')}</h2>
      <p>{phone ? t('pasteLink') : t('useCode')}</p>
      {phone ? (
        <>
          <label htmlFor="pairing">{t('desktopLink')}</label>
          <textarea
            id="pairing"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="cindermic://pair?..."
          />
          <button
            className="primary-button"
            disabled={!link.trim()}
            onClick={() => void model.command({ type: 'pair', link: link.trim() })}
          >
            {t('connectDesktop')}
          </button>
        </>
      ) : state.qr ? (
        <>
          <img className="pair-qr" src={state.qr} alt={t('qrAlt')} width={224} height={224} />
          {(state.addresses?.length || 0) > 1 && (
            <label className="pair-network">
              {t('address')}
              <select
                value={new URL(state.pairing!).searchParams.get('host') || ''}
                onChange={(event) =>
                  void model.command({ type: 'pairHost', host: event.target.value })
                }
              >
                {state.addresses?.map((address) => (
                  <option key={address}>{address}</option>
                ))}
              </select>
            </label>
          )}
          <label className="sr-only" htmlFor="desktop-pairing">
            {t('pairingLink')}
          </label>
          <textarea id="desktop-pairing" readOnly value={state.pairing || ''} />
          <button
            className="secondary-button"
            onClick={() => {
              void model.copyPairing().then((success) => setCopied(success));
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? t('copied') : t('copyLink')}
          </button>
          <small>{t('privateLink')}</small>
        </>
      ) : (
        <p>{t('preparingCode')}</p>
      )}
      <div className="pair-security">
        <ShieldCheck size={14} />
        {t('encrypted')}
      </div>
    </dialog>
  );
}
