import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlusIcon, XIcon } from '@phosphor-icons/react';
import { useSetAtom } from 'jotai';
import { MembersList } from '@/app/features/room';
import { Tooltip } from '@/app/components/Tooltip';
import { inviteModalRoomIdAtom } from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import * as css from './MembersSidebar.css';

interface MembersSidebarProps {
  spaceId?: string | null;
  className?: string;
  onClose?: () => void;
  open?: boolean;
}

export function MembersSidebar({
  spaceId,
  className,
  onClose,
  open = false,
}: MembersSidebarProps = {}) {
  const { t } = useTranslation();
  const setInviteModal = useSetAtom(inviteModalRoomIdAtom);

  const [everOpened, setEverOpened] = useState(open);

  const prevSpaceIdRef = useRef(spaceId);

  useEffect(() => {
    if (prevSpaceIdRef.current !== spaceId) {
      prevSpaceIdRef.current = spaceId;
      setEverOpened(open);
    } else if (open) {
      setEverOpened(true);
    }
  }, [spaceId, open]);

  if (!spaceId) return null;

  const client = getMatrixClientOrNull();
  const room = client?.getRoom(spaceId);
  const myId = client?.getUserId();
  const canInvite = !!room && !!myId && room.canInvite(myId);

  return (
    <aside
      data-swipe-back="panel"
      className={`${css.membersSidebar}${className ? ` ${className}` : ''}`}
      aria-label={t('common.members')}
    >
      <div className={css.membersSidebarHeader}>
        <h2 className={css.membersSidebarTitle}>{t('common.members')}</h2>
        {canInvite && room && (
          <Tooltip content={t('common.invite')}>
            <button
              type="button"
              className={css.membersSidebarClose}
              onClick={() =>
                setInviteModal({
                  roomId: room.roomId,
                  name: room.name,
                  isSpace: room.isSpaceRoom(),
                })
              }
              aria-label={t('common.invite')}
            >
              <UserPlusIcon size={16} />
            </button>
          </Tooltip>
        )}
        {onClose && (
          <Tooltip content={t('common.close')}>
            <button
              type="button"
              className={css.membersSidebarClose}
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <XIcon size={16} />
            </button>
          </Tooltip>
        )}
      </div>
      <div className={css.membersList}>{everOpened && <MembersList roomId={spaceId} />}</div>
    </aside>
  );
}
