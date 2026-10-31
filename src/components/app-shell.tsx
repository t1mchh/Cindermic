import { useLanguage } from '@/i18n/provider';
import { LanguageSelect } from '@/components/language-select';
import {
  AudioLines,
  ArrowUpRight,
  CircleHelp,
  Headphones,
  Mic,
  Moon,
  Sun,
  SlidersHorizontal,
} from 'lucide-react';
import type { Panel } from '@/lib/types';
import type { Theme } from '@/hooks/use-theme';

interface Props {
  panel: Panel;
  onPanelChange: (panel: Panel) => void;
  phone: boolean;
  theme: Theme;
  onThemeChange: () => void;
  children: React.ReactNode;
}

export function AppShell({ panel, onPanelChange, phone, theme, onThemeChange, children }: Props) {
  const { t } = useLanguage();
  const navigation = [
    { id: 'mic', label: t('navMic'), icon: Mic },
    { id: 'output', label: t('navOutput'), icon: Headphones },
    { id: 'setup', label: t('navGuide'), icon: SlidersHorizontal },
  ] as const;

  return (
    <div className={`app-shell ${phone ? 'phone-mode' : ''}`}>
      <div className="ambient-light ambient-yellow" aria-hidden="true" />
      <div className="ambient-light ambient-violet" aria-hidden="true" />
      <aside className="sidebar">
        <a className="brand" href="/" aria-label={t('home')}>
          <span className="brand-mark">
            <AudioLines size={25} strokeWidth={2.5} />
          </span>
          <span>
            CINDER<span className="brand-accent">MIC</span>
            <small>{t('brandTag')}</small>
          </span>
        </a>
        <div className="nav-caption">{t('yourStudio')}</div>
        <nav aria-label={t('navMain')} data-testid="main-navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${panel === id ? 'selected' : ''}`}
              aria-label={label}
              title={label}
              onClick={() => onPanelChange(id)}
              aria-current={panel === id ? 'page' : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              <ArrowUpRight size={14} className="nav-arrow" />
            </button>
          ))}
        </nav>
        <div className="sidebar-poster" aria-hidden="true">
          <div className="poster-wave">
            {[20, 38, 66, 44, 82, 100, 58, 76, 34, 55, 24].map((height, index) => (
              <i key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          <span>
            {t('posterFirst')}
            <br />
            <em>{t('posterSecond')}</em>
          </span>
          <div className="poster-caption">
            {t('noSubscriptions')}
            <br />
            {t('noStrings')}
          </div>
        </div>
        <div className="sidebar-bottom">
          <span className="profile-avatar">{t('you')}</span>
          <div>
            <strong>{t('yourSpace')}</strong>
            <small>{t('personalStudio')}</small>
          </div>
          <span className="tiny-dot" />
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <AudioLines size={17} />
            <span>{t('studio')}</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{navigation.find((item) => item.id === panel)?.label}</strong>
          </div>
          <div className="topbar-right">
            <LanguageSelect />
            <span className="private-badge">
              <span className="tiny-dot" />
              {t('privacy')}
            </span>
            <button
              className="icon-button theme-button"
              onClick={onThemeChange}
              aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
            >
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="icon-button"
              aria-label={t('openGuide')}
              onClick={() => onPanelChange('setup')}
            >
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <div className="mobile-brand">
          <span className="brand-mark">
            <AudioLines size={23} />
          </span>
          <strong>
            CINDER<span>MIC</span>
          </strong>
          <LanguageSelect />
          <button
            className="icon-button theme-button"
            onClick={onThemeChange}
            aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
        <div className="page-content">{children}</div>
        <nav className="mobile-nav" aria-label={t('navMobile')}>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={panel === id ? 'active' : ''}
              onClick={() => onPanelChange(id)}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </main>
    </div>
  );
}
