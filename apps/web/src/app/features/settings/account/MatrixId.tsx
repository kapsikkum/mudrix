import { useTranslation } from 'react-i18next';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { CopyButton } from '@/app/components/Button';
import * as css from '../Settings.css';
import { Sensitive } from '@/app/components/Sensitive';

export function MatrixId() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();

  const userId = client?.userId();
  if (!userId) return null;

  return (
    <div className={css.flexOne}>
      <span className={css.fieldLabel}>{t('settings.account.username')}</span>
      <div className={css.tokenRow}>
        <code className={css.tokenField}>
          <Sensitive>{userId}</Sensitive>
        </code>
        <CopyButton text={userId} />
      </div>
    </div>
  );
}
