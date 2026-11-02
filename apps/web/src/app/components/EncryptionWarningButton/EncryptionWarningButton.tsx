import { useTranslation } from 'react-i18next';
import { useAtomValue, useSetAtom } from 'jotai';
import { LockKeyIcon, ShieldWarningIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { sessionVerificationAtom, settingsOpenAtom, settingsPageAtom } from '@/app/store/atoms';
import * as css from './EncryptionWarningButton.css';

export function EncryptionWarningButton() {
  const { t } = useTranslation();
  const { status } = useAtomValue(sessionVerificationAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);

  if (status !== 'no-identity' && status !== 'unverified') return null;

  const notSetUp = status === 'no-identity';
  const label = notSetUp ? t('verifySession.setupButton') : t('verifySession.title');

  const handleClick = () => {
    setSettingsPage(notSetUp ? 'encryption' : 'sessions');
    setSettingsOpen(true);
  };

  return (
    <Tooltip placement="bottom" content={label}>
      <button type="button" className={css.button} onClick={handleClick} aria-label={label}>
        {notSetUp ? (
          <LockKeyIcon size={18} weight="regular" />
        ) : (
          <ShieldWarningIcon size={18} weight="regular" />
        )}
      </button>
    </Tooltip>
  );
}
