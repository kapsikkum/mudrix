import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { updateAvailableAtom } from '@/app/store/atoms';
import * as css from './UpdateButton.css';

export function UpdateButton() {
  const { t } = useTranslation();
  const updateAvailable = useAtomValue(updateAvailableAtom);
  const [desktopUpdateReady, setDesktopUpdateReady] = useState(false);

  useEffect(() => {
    window.desktopAPI?.onUpdateDownloaded?.(() => setDesktopUpdateReady(true));
  }, []);

  if (!desktopUpdateReady && !updateAvailable) return null;

  const handleUpdate = () => {
    if (desktopUpdateReady) {
      window.desktopAPI?.installUpdate?.();
    } else {
      window.location.reload();
    }
  };

  return (
    <Tooltip placement="bottom" content={t('update.action')}>
      <button
        type="button"
        className={css.button}
        onClick={handleUpdate}
        aria-label={t('update.action')}
      >
        <DownloadSimpleIcon size={18} weight="bold" />
      </button>
    </Tooltip>
  );
}
