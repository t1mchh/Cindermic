import { Circle, Download, Square, Trash2 } from 'lucide-react';
import { useLanguage } from '@/i18n/provider';
import type { CindermicModel } from '@/hooks/use-cindermic';

export function ClipControls({ model }: { model: CindermicModel }) {
  const { t } = useLanguage();
  const { clip } = model;
  const duration = `${Math.floor(clip.seconds / 60)}:${String(clip.seconds % 60).padStart(2, '0')}`;
  return (
    <div className={`clip-controls ${clip.recording ? 'is-recording' : ''}`}>
      <div className="clip-heading">
        <span className="clip-dot" />
        <strong>{t('quickClip')}</strong>
        <small>{clip.recording ? duration : t('clipLimit')}</small>
      </div>
      <div className="clip-actions">
        <button
          className="secondary-button"
          disabled={!clip.recording && !model.connected}
          onClick={clip.recording ? clip.finish : clip.start}
        >
          {clip.recording ? <Square size={14} fill="currentColor" /> : <Circle size={14} />}{' '}
          {clip.recording ? t('stopRecording') : t('recordClip')}
        </button>
        {clip.clipUrl && !clip.recording && (
          <>
            <a
              className="secondary-button download-clip"
              href={clip.clipUrl}
              download={clip.filename}
            >
              <Download size={15} />
              {t('saveWav')}
            </a>
            <button className="icon-button" aria-label={t('discardClip')} onClick={clip.discard}>
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
