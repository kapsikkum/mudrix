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
  const [percent, setPercent] = useState<number | null>(null);

  useEffect(() => {
    window.desktopAPI?.onUpdateDownloaded?.(() => setDesktopUpdateReady(true));
    const stop = window.desktopAPI?.onUpdateProgress?.(({ percent: next }) => setPercent(next));
    return () => stop?.();
  }, []);

  if (!desktopUpdateReady && !updateAvailable) return null;

  const handleUpdate = () => {
    if (desktopUpdateReady) {
      window.desktopAPI?.installUpdate?.();
    } else {
      window.location.reload();
    }
  };

  const label =
    percent !== null && percent !== undefined
      ? t('update.downloading', { percent })
      : t('update.action');

  return (
    <Tooltip placement="bottom" content={label}>
      <button
        type="button"
        className={css.button}
        onClick={handleUpdate}
        aria-label={label}
        aria-busy={percent !== null && !desktopUpdateReady ? true : undefined}
      >
        {percent !== null && !desktopUpdateReady ? (
          <span className={css.percent}>{percent}%</span>
        ) : (
          <DownloadSimpleIcon size={18} weight="bold" />
        )}
      </button>
    </Tooltip>
  );
}
