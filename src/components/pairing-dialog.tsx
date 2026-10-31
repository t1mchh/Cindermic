import { localizeError } from '@/i18n/errors';
import { useLanguage } from '@/i18n/provider';
import { useEffect, useRef, useState } from 'react';
import { ScanLine, X } from 'lucide-react';
import { DesktopPairing } from './desktop-pairing';
import type { CindermicModel } from '@/hooks/use-cindermic';

export function PairingDialog({ model }: { model: CindermicModel }) {
  const { t, locale } = useLanguage();
  const [link, setLink] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="pair-modal"
      aria-label={t('manualConnection')}
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
      {model.phone ? (
        <>
          <h2>{t('pairDesktop')}</h2>
          {model.native && (
            <button
              className="primary-button scanner-action"
              disabled={model.scanning}
              onClick={() => void model.scanPairing()}
            >
              <ScanLine size={20} />
              {model.scanning ? t('scanning') : t('scanQR')}
            </button>
          )}
          <p>{t('pasteLink')}</p>
          <label htmlFor="pairing">{t('desktopLink')}</label>
          <textarea
            id="pairing"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="cindermic://pair?..."
          />
          {(model.notice || model.state.error) && (
            <p role="alert">{localizeError(model.notice || model.state.error || '', locale)}</p>
          )}
          <button
            className="primary-button"
            disabled={!link.trim()}
            onClick={() => void model.command({ type: 'pair', link: link.trim() })}
          >
            {t('connectDesktop')}
          </button>
        </>
      ) : (
        <DesktopPairing model={model} />
      )}
    </dialog>
  );
}
