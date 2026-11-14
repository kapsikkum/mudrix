import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CaretRightIcon, UsersThreeIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { Avatar } from '@/app/components/Avatar';
import { Modal } from '@/app/components/Modal';
import { useMutualRooms, type MutualRoom } from '@/app/hooks/useMutualRooms';
import * as css from './ProfileCard.css';
import { zIndex } from '@/theme/zIndex';

/** Above the profile popup (z-index 7501). */
const MODAL_Z = zIndex.dialogNested;
const PREVIEW_AVATARS = 4;

interface Props {
  client: MatrixClient | null | undefined;
  userId: string;
  displayName: string;
  /** Called after navigating to a room so the popup can close. */
  onNavigate: () => void;
}

export function MutualRooms({ client, userId, displayName, onNavigate }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { rooms, spaces, source } = useMutualRooms(client, userId);

  const total = rooms.length + spaces.length;
  if (total === 0) return null;

  const summary = [
    rooms.length > 0 ? t('profile.mutualRooms', { count: rooms.length }) : null,
    spaces.length > 0 ? t('profile.mutualSpaces', { count: spaces.length }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const preview = [...rooms, ...spaces].slice(0, PREVIEW_AVATARS);

  const go = (entry: MutualRoom, kind: 'room' | 'space') => {
    setOpen(false);
    navigate(`/${kind === 'space' ? 'space' : 'r'}/${encodeURIComponent(entry.roomId)}`);
    onNavigate();
  };

  const renderList = (entries: MutualRoom[], kind: 'room' | 'space', heading: string) =>
    entries.length > 0 && (
      <>
        <h4 className={css.mutualHeading}>{heading}</h4>
        <div className={css.mutualList}>
          {entries.map((entry) => (
            <button
              key={entry.roomId}
              type="button"
              className={css.mutualItem}
              onClick={() => go(entry, kind)}
            >
              <Avatar
                name={entry.name}
                mxcUrl={entry.avatarMxc}
                client={client ?? undefined}
                size="sm"
              />
              <span className={css.mutualItemName}>{entry.name}</span>
            </button>
          ))}
        </div>
      </>
    );

  return (
    <>
      <button type="button" className={css.mutualRow} onClick={() => setOpen(true)}>
        <span className={css.mutualAvatars}>
          {preview.map((entry) => (
            <span key={entry.roomId} className={css.mutualAvatar}>
              <Avatar
                name={entry.name}
                mxcUrl={entry.avatarMxc}
                client={client ?? undefined}
                size="xs"
              />
            </span>
          ))}
        </span>
        <span className={css.mutualLabel}>{summary}</span>
        <CaretRightIcon size={14} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('profile.mutualTitle', { name: displayName })}
        titleIcon={<UsersThreeIcon size={20} />}
        size="sm"
        zIndex={MODAL_Z}
      >
        {renderList(spaces, 'space', t('profile.mutualSpacesHeading'))}
        {renderList(rooms, 'room', t('profile.mutualRoomsHeading'))}
        {source === 'local' && <p className={css.mutualNote}>{t('profile.mutualLocalNote')}</p>}
      </Modal>
    </>
  );
}
