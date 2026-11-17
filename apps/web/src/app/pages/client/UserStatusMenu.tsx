import type { RefObject } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { CheckIcon, GearIcon, SmileyIcon, UserCircleIcon, UserIcon } from '@phosphor-icons/react';
import { Popover } from '@/app/components/Popover';
import { Avatar } from '@/app/components/Avatar';
import { DecoratedAvatar } from '@/app/features/profile/ProfileCosmetics';
import {
  presenceOverrideAtom,
  settingsOpenAtom,
  settingsPageAtom,
  showPresenceAtom,
  userIdAtom,
} from '@/app/store/atoms';
import type { PresenceOverride } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useProfile } from '@/app/data';
import {
  useActiveStatus,
  useExtendedProfile,
  useExtendedProfileMutations,
  useExtendedProfileSupport,
} from '@/app/hooks/useExtendedProfile';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import type { ProfileStatus, StatusMode } from '@/util/profileCosmetics';
import * as css from './UserStatusMenu.css';

type Choice = 'auto' | 'online' | 'unavailable' | 'dnd' | 'offline';

const CHOICE_COLOR: Record<Exclude<Choice, 'auto'>, string> = {
  online: '#22f07a',
  unavailable: '#ffd21f',
  dnd: '#ff4747',
  offline: '#9aa3b2',
};

const CHOICE_LABEL: Record<Choice, string> = {
  auto: 'presence.auto',
  online: 'presence.online',
  unavailable: 'presence.idle',
  dnd: 'presence.dnd',
  offline: 'presence.invisible',
};

const CHOICES: Choice[] = ['auto', 'online', 'unavailable', 'dnd', 'offline'];

interface Props {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  onViewProfile: () => void;
  onEditStatus: () => void;
}

/**
 * Discord-style popover for the bottom-left user panel: presence choices (Matrix presence, with
 * Do Not Disturb additionally stored as the status mode), the custom status, and
 * quick links to the profile and settings.
 */
export function UserStatusMenu({ open, onClose, anchorRef, onViewProfile, onEditStatus }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const client = getMatrixClientOrNull();
  const myId = useAtomValue(userIdAtom);
  const { data: me } = useProfile(myId);
  const showPresence = useAtomValue(showPresenceAtom);
  const [override, setOverride] = useAtom(presenceOverrideAtom);
  const setSettingsOpen = useSetAtom(settingsOpenAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  const { supported } = useExtendedProfileSupport(client);
  const { data: fields } = useExtendedProfile(client, myId);
  const { saveFields } = useExtendedProfileMutations(client);
  const status = useActiveStatus(fields?.status);

  const mode = status?.mode ?? null;
  const current: Choice =
    mode === 'dnd'
      ? 'dnd'
      : mode === 'idle' || override === 'unavailable'
        ? 'unavailable'
        : override;

  const writeMode = async (wanted: StatusMode | null) => {
    if ((status?.mode ?? null) === wanted) return;
    const next: ProfileStatus | null = status
      ? { ...status, mode: wanted }
      : wanted
        ? { emoji: '', text: '', mode: wanted, expiresAt: null }
        : null;
    try {
      await saveFields({ status: next });
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  const choose = (choice: Choice) => {
    onClose();
    // Matrix presence is driven by the override atom (usePresenceSender); DND stays "online"
    // there and is carried by the profile field for other Mudrix users. Without presence on
    // the server only the local override and the profile field change.
    const presence: PresenceOverride = choice === 'dnd' ? 'online' : choice;
    setOverride(presence);
    const wantedMode: StatusMode | null =
      choice === 'dnd' ? 'dnd' : choice === 'unavailable' ? 'idle' : null;
    if (supported || status?.mode) void writeMode(wantedMode);
  };

  const openSettings = (page: 'account' | null) => {
    onClose();
    setSettingsPage(page);
    setSettingsOpen(true);
  };

  const hasText = !!status && (!!status.emoji || !!status.text);
  const displayName = me?.displayName ?? myId ?? '';

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="top-start"
      role="menu"
      dense
    >
      <div className={css.menu}>
        <div className={css.header}>
          <button
            type="button"
            className={css.headerAvatar}
            aria-label={t('presence.editProfile')}
            title={t('presence.editProfile')}
            onClick={() => openSettings('account')}
          >
            <DecoratedAvatar decoration={fields?.avatarDecoration ?? null} client={client}>
              <Avatar
                name={displayName}
                mxcUrl={me?.avatarUrl ?? null}
                client={client ?? undefined}
                size="lg"
                placeholder="logo"
              />
            </DecoratedAvatar>
          </button>
          <div className={css.headerText}>
            <span className={css.headerName}>{displayName}</span>
            {hasText && (
              <span className={css.headerStatus}>
                {status.emoji ? `${status.emoji} ` : ''}
                {status.text}
              </span>
            )}
          </div>
        </div>
        <div className={css.divider} role="separator" />
        <button
          type="button"
          role="menuitem"
          className={css.row}
          onClick={() => {
            onClose();
            onViewProfile();
          }}
        >
          <span className={css.rowIcon}>
            <UserCircleIcon size={14} />
          </span>
          <span className={css.rowLabel}>{t('presence.viewProfile')}</span>
        </button>
        <div className={css.divider} role="separator" />

        {CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            role="menuitemradio"
            aria-checked={current === choice}
            className={css.row}
            disabled={choice === 'dnd' && !supported}
            onClick={() => choose(choice)}
          >
            <span className={css.rowIcon}>
              {choice === 'auto' ? (
                <span className={css.dotAuto} />
              ) : (
                <span className={css.dot} style={{ backgroundColor: CHOICE_COLOR[choice] }} />
              )}
            </span>
            <span className={css.rowLabel}>{t(CHOICE_LABEL[choice])}</span>
            {current === choice && (
              <span className={css.rowCheck}>
                <CheckIcon size={14} weight="bold" />
              </span>
            )}
          </button>
        ))}
        {!showPresence && <p className={css.note}>{t('presence.sharingOffNote')}</p>}
        <div className={css.divider} role="separator" />

        <button
          type="button"
          role="menuitem"
          className={css.row}
          disabled={!supported}
          onClick={() => {
            onClose();
            onEditStatus();
          }}
        >
          <span className={css.rowIcon}>
            {hasText && status.emoji ? status.emoji : <SmileyIcon size={14} />}
          </span>
          <span className={css.rowLabel}>
            {hasText && status.text ? status.text : t('profile.status.setMenu')}
          </span>
        </button>
        {status && (
          <button
            type="button"
            role="menuitem"
            className={css.row}
            onClick={() => {
              onClose();
              saveFields({ status: null }).catch((err) =>
                toast.error(t('common.saveFailed', { error: getErrorMessage(err) }))
              );
            }}
          >
            <span className={css.rowIcon} />
            <span className={css.rowLabel}>{t('profile.status.clear')}</span>
          </button>
        )}
        <div className={css.divider} role="separator" />

        <button
          type="button"
          role="menuitem"
          className={css.row}
          onClick={() => openSettings('account')}
        >
          <span className={css.rowIcon}>
            <UserIcon size={14} />
          </span>
          <span className={css.rowLabel}>{t('presence.editProfile')}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className={css.row}
          onClick={() => openSettings(null)}
        >
          <span className={css.rowIcon}>
            <GearIcon size={14} />
          </span>
          <span className={css.rowLabel}>{t('settings.userSettings')}</span>
        </button>
      </div>
    </Popover>
  );
}
