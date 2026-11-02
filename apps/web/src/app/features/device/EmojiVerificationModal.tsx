import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import {
  SpinnerGapIcon,
  CheckCircleIcon,
  XCircleIcon,
  XIcon,
  CheckIcon,
} from '@phosphor-icons/react';
import { emojiVerificationAtom } from '@/app/store/atoms';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { vars } from '@/theme/vars.css';
import * as css from './EmojiVerificationModal.css';

export function EmojiVerificationModal() {
  const { t } = useTranslation();
  const [state, setAtom] = useAtom(emojiVerificationAtom);
  const isUserVerification = !!state.request && !state.request.isSelfVerification();

  const close = () => {
    setAtom({ open: false, phase: 'waiting' });
  };

  const handleConfirm = async () => {
    const request = state.request;
    if (!request) return;
    try {
      await request.confirm();
      setAtom((prev) => ({ ...prev, phase: 'done' }));
    } catch {
      setAtom((prev) => ({ ...prev, phase: 'cancelled' }));
    }
  };

  const handleMismatch = () => {
    const request = state.request;
    if (!request) return;
    void request.mismatch().catch(() => {});
    setAtom((prev) => ({ ...prev, phase: 'cancelled' }));
  };

  const handleCancel = () => {
    if (state.request) {
      void state.request.cancel().catch(() => {
        /* ignore */
      });
    }
    close();
  };

  const renderBody = () => {
    if (state.phase === 'waiting') {
      return (
        <div className={css.waitingMsg}>
          <SpinnerGapIcon size={24} className="icon-spin" style={{ color: vars.color.accent }} />
          <span>
            {state.otherUserId
              ? t('verification.waitingFor', { user: state.otherUserId })
              : t('verification.waitingForOther')}
          </span>
        </div>
      );
    }

    if (state.phase === 'comparing') {
      const emojis = state.emojis ?? [];
      return (
        <>
          <p className={css.instructions}>
            {isUserVerification
              ? t('verification.compareEmojisUser', { user: state.otherUserId })
              : t('verification.compareEmojisDevices')}
          </p>
          <div className={css.emojiGrid}>
            {emojis.map(({ symbol: emoji, description: name }) => (
              <div key={emoji} className={css.emojiItem}>
                <span className={css.emojiChar}>{emoji}</span>
                <span className={css.emojiName}>{name}</span>
              </div>
            ))}
          </div>
        </>
      );
    }

    if (state.phase === 'done') {
      return (
        <div className={css.doneMsg}>
          <CheckCircleIcon size={32} style={{ color: vars.color.success }} />
          <span className={css.doneMsgTitle}>{t('verification.complete')}</span>
          <span className={css.doneMsgSubtitle}>
            {state.otherUserId
              ? t('verification.deviceVerified', { user: state.otherUserId })
              : t('verification.deviceVerifiedOther')}
          </span>
        </div>
      );
    }

    if (state.phase === 'cancelled') {
      return (
        <div className={css.doneMsg}>
          <XCircleIcon size={32} style={{ color: vars.color.danger }} />
          <span className={css.doneMsgTitle}>{t('verification.cancelled')}</span>
          <span className={css.doneMsgSubtitle}>{t('verification.cancelledNote')}</span>
        </div>
      );
    }

    return null;
  };

  const renderFooter = () => {
    if (state.phase === 'waiting') {
      return (
        <Button variant="secondary" size="md" onClick={handleCancel}>
          {t('common.cancel')}
        </Button>
      );
    }
    if (state.phase === 'comparing') {
      return (
        <>
          <Button variant="secondary" size="md" onClick={handleMismatch}>
            <XIcon size={14} className={css.iconBefore} />
            {t('verification.theyDontMatch')}
          </Button>
          <Button variant="primary" size="md" onClick={handleConfirm}>
            <CheckIcon size={14} className={css.iconBefore} />
            {t('verification.theyMatch')}
          </Button>
        </>
      );
    }
    return (
      <Button variant="primary" size="md" onClick={close}>
        {t('common.done')}
      </Button>
    );
  };

  return (
    <Modal
      open={state.open}
      onClose={state.phase === 'waiting' || state.phase === 'comparing' ? handleCancel : close}
      title={isUserVerification ? t('verification.verifyUser') : t('verification.verifyDevice')}
      size="md"
      zIndex={8500}
      footer={renderFooter()}
    >
      {renderBody()}
    </Modal>
  );
}
