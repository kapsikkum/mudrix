import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { updateAvailableAtom } from '@/app/store/atoms';
import { useUpdateProgress } from '@/app/hooks/useUpdateProgress';
import { barPercent } from './updateProgress';
import * as css from './UpdateButton.css';

export function UpdateButton() {
  const { t } = useTranslation();
  const updateAvailable = useAtomValue(updateAvailableAtom);
  const { percent, ready } = useUpdateProgress();
  const downloading = percent !== null && !ready;

  if (!ready && !updateAvailable) return null;

  const handleUpdate = () => {
    if (ready) {
      window.desktopAPI?.installUpdate?.();
    } else {
      window.location.reload();
    }
  };

  const label = downloading ? t('update.downloading', { percent }) : t('update.action');

  return (
    <Tooltip placement="bottom" content={label}>
      <button
        type="button"
        className={css.button}
        onClick={handleUpdate}
        aria-label={label}
        aria-busy={downloading ? true : undefined}
      >
        {downloading ? (
          <>
            <span className={css.percent}>{percent}%</span>
            <span className={css.bar} style={{ width: `${barPercent(percent)}%` }} aria-hidden />
          </>
        ) : (
          <DownloadSimpleIcon size={18} weight="bold" />
        )}
      </button>
    </Tooltip>
  );
}
