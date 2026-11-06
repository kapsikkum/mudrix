import { useTranslation } from 'react-i18next';
import { useAtom } from 'jotai';
import { ToggleRow } from '@/app/components/Toggle';
import { callShowReactionsAtom } from '@/app/store/atoms/call';
import * as layoutCss from '../Settings.css';

export function CallSection() {
  const { t } = useTranslation();
  const [reactions, setReactions] = useAtom(callShowReactionsAtom);

  return (
    <div className={layoutCss.section}>
      <h3 className={layoutCss.sectionTitle}>{t('settings.voice.callTitle')}</h3>
      <ToggleRow
        label={t('settings.voice.showReactions')}
        description={t('settings.voice.showReactionsNote')}
        checked={reactions}
        onChange={setReactions}
      />
    </div>
  );
}
