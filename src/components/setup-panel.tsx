import { useLanguage } from '@/i18n/provider';

export function SetupPanel() {
  const { t } = useLanguage();
  const steps = [
    {
      title: t('guide1Title'),
      text: t('guide1Text'),
    },
    {
      title: t('guide2Title'),
      text: t('guide2Text'),
    },
    {
      title: t('guide3Title'),
      text: t('guide3Text'),
    },
    {
      title: t('guide4Title'),
      text: t('guide4Text'),
    },
  ];

  return (
    <div className="setup-grid">
      {steps.map((step, index) => (
        <section className="detail-card setup-card glass scale-enter" key={step.title}>
          <span className="step-number">{index + 1}</span>
          <h2>{step.title}</h2>
          <p>{step.text}</p>
        </section>
      ))}
    </div>
  );
}
