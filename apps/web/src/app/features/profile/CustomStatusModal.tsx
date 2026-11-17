import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SmileyIcon } from '@phosphor-icons/react';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { Button } from '@/app/components/Button';
import { Field } from '@/app/components/Field';
import { Input } from '@/app/components/Input';
import { Modal } from '@/app/components/Modal';
import { Select } from '@/app/components/Select';
import { useToast } from '@/app/hooks/useToast';
import {
  useExtendedProfile,
  useExtendedProfileMutations,
  useExtendedProfileSupport,
} from '@/app/hooks/useExtendedProfile';
import { getErrorMessage } from '@/util/error';
import {
  MAX_STATUS_TEXT_CHARS,
  sanitizeStatusEmoji,
  isStatusExpired,
  sanitizeStatusText,
  statusExpiryFor,
  type ProfileStatus,
  type StatusClearAfter,
  type StatusMode,
} from '@/util/profileCosmetics';
import * as css from './ProfileCard.css';
import { zIndex } from '@/theme/zIndex';

const EMOJI_PRESETS = ['😀', '🎮', '💻', '📚', '🎧', '🍕', '🏠', '💤', '🚧', '🎉'];

/** Above the profile popup (z-index 7501) and the settings dialog (7500). */
const MODAL_Z = zIndex.dialogNested;

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Edit the signed-in user's Mudrix custom status (emoji + text + optional idle/DND mode). */
export function CustomStatusModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const client = getMatrixClientOrNull();
  const { supported, loading } = useExtendedProfileSupport(client);
  const { data: fields } = useExtendedProfile(client, client?.userId() ?? null);
  const { saveFields, busy } = useExtendedProfileMutations(client);

  const [emoji, setEmoji] = useState('');
  const [text, setText] = useState('');
  const [mode, setMode] = useState<StatusMode | ''>('');
  const [clearAfter, setClearAfter] = useState<StatusClearAfter | 'keep'>('never');

  useEffect(() => {
    if (!open) return;
    const current = isStatusExpired(fields?.status) ? null : (fields?.status ?? null);
    setEmoji(current?.emoji ?? '');
    setText(current?.text ?? '');
    setMode(current?.mode ?? '');
    setClearAfter(current?.expiresAt ? 'keep' : 'never');
    // Re-seed only when the dialog opens; edits in flight should not be overwritten by refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const disabled = !supported || loading;

  const persist = async (status: ProfileStatus | null) => {
    try {
      await saveFields({ status });
      toast.success(t('profile.status.saved'));
      onClose();
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  const handleSave = () => {
    const cleanEmoji = sanitizeStatusEmoji(emoji);
    const cleanText = sanitizeStatusText(text);
    if (!cleanEmoji && !cleanText && !mode) {
      void persist(null);
      return;
    }
    const expiresAt =
      clearAfter === 'keep' ? (fields?.status?.expiresAt ?? null) : statusExpiryFor(clearAfter);
    void persist({ emoji: cleanEmoji, text: cleanText, mode: mode || null, expiresAt });
  };

  const modeOptions = [
    { value: '', label: t('profile.status.modeNone') },
    { value: 'idle', label: t('profile.status.modeIdle') },
    { value: 'dnd', label: t('profile.status.modeDnd') },
  ];

  const clearAfterOptions = [
    ...(clearAfter === 'keep' ? [{ value: 'keep', label: t('profile.status.clearKeep') }] : []),
    { value: 'never', label: t('profile.status.clearNever') },
    { value: '1h', label: t('profile.status.clear1h') },
    { value: '4h', label: t('profile.status.clear4h') },
    { value: 'today', label: t('profile.status.clearToday') },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('profile.status.title')}
      titleIcon={<SmileyIcon size={20} />}
      size="sm"
      zIndex={MODAL_Z}
      footer={
        <>
          {fields?.status && (
            <Button
              variant="secondary"
              disabled={disabled || busy}
              onClick={() => void persist(null)}
            >
              {t('profile.status.clear')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={disabled}
            loading={busy}
            spinnerWhileLoading
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {!loading && !supported && (
        <p className={css.mutualNote}>{t('settings.account.extendedProfileUnsupported')}</p>
      )}
      <Field label={t('profile.status.emoji')}>
        <Input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="🙂"
          maxLength={16}
          disabled={disabled}
        />
        <div className={css.statusEmojiRow}>
          {EMOJI_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={css.statusEmojiBtn}
              aria-pressed={emoji === preset}
              disabled={disabled}
              onClick={() => setEmoji(emoji === preset ? '' : preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </Field>
      <Input
        label={t('profile.status.text')}
        placeholder={t('profile.status.textPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_STATUS_TEXT_CHARS}
        disabled={disabled}
      />
      <Field label={t('profile.status.mode')} hint={t('profile.status.modeHint')}>
        <Select
          value={mode}
          onChange={(v) => setMode(v === 'idle' || v === 'dnd' ? v : '')}
          options={modeOptions}
          disabled={disabled}
        />
      </Field>
      <Field label={t('profile.status.clearAfter')}>
        <Select
          value={clearAfter}
          onChange={(v) => setClearAfter(v as StatusClearAfter | 'keep')}
          options={clearAfterOptions}
          disabled={disabled}
        />
      </Field>
      <p className={css.mutualNote}>{t('profile.mudrixOnlyNote')}</p>
    </Modal>
  );
}
