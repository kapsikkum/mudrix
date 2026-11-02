import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Button } from '@/app/components/Button';
import { Select } from '@/app/components/Select';
import { presenceOverrideAtom, presenceSupportAtom, userIdAtom } from '@/app/store/atoms';
import type { PresenceOverride } from '@/app/store/atoms';
import {
  customStatusDialogOpenAtom,
  useSetCustomStatus,
  useUserStatusText,
} from '@/app/features/status/customStatus';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import * as css from '../Settings.css';

export function StatusSettings() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const userId = useAtomValue(userIdAtom);
  const [presenceOverride, setPresenceOverride] = useAtom(presenceOverrideAtom);
  const presenceUnsupported = useAtomValue(presenceSupportAtom) === 'unsupported';
  const statusText = useUserStatusText(client, userId);
  const setStatus = useSetCustomStatus(client);
  const openStatusDialog = useSetAtom(customStatusDialogOpenAtom);

  return (
    <>
      <div className={css.settingRow}>
        <div className={css.settingInfo}>
          <span className={css.settingLabel}>{t('presence.title')}</span>
          {presenceUnsupported && (
            <span className={css.settingNote}>{t('presence.unsupported')}</span>
          )}
        </div>
        <Select<PresenceOverride>
          aria-label={t('presence.title')}
          value={presenceOverride}
          options={[
            { value: 'auto', label: t('presence.auto') },
            { value: 'online', label: t('presence.online') },
            { value: 'unavailable', label: t('presence.away') },
            { value: 'offline', label: t('presence.offline') },
          ]}
          onChange={setPresenceOverride}
        />
      </div>
      <div className={css.settingRow}>
        <div className={css.settingInfo}>
          <span className={css.settingLabel}>{t('status.customStatus')}</span>
          <span className={css.settingNote}>{statusText ?? t('status.none')}</span>
        </div>
        <div className={css.inlineActions}>
          {statusText && (
            <Button variant="ghost" size="sm" onClick={() => setStatus(null)}>
              {t('status.clearStatus')}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => openStatusDialog(true)}>
            {statusText ? t('status.editCustomStatus') : t('status.setCustomStatus')}
          </Button>
        </div>
      </div>
    </>
  );
}
