import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlusIcon, XIcon } from '@phosphor-icons/react';
import { useSetAtom } from 'jotai';
import { MembersList } from '@/app/features/room';
import { Tooltip } from '@/app/components/Tooltip';
import { inviteModalRoomIdAtom } from '@/app/store/atoms';
import { useRoomDetails } from '@/app/data';
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
  const space = useRoomDetails(spaceId);

  useEffect(() => {
    if (prevSpaceIdRef.current !== spaceId) {
      prevSpaceIdRef.current = spaceId;
      setEverOpened(open);
    } else if (open) {
      setEverOpened(true);
    }
  }, [spaceId, open]);

  if (!spaceId) return null;

  const canInvite = !!space?.permissions.invite;

  return (
    <aside
      data-swipe-back="panel"
      className={`${css.membersSidebar}${className ? ` ${className}` : ''}`}
      aria-label={t('common.members')}
    >
      <div className={css.membersSidebarHeader}>
        <h2 className={css.membersSidebarTitle}>{t('common.members')}</h2>
        {canInvite && space && (
          <Tooltip content={t('common.invite')}>
            <button
              type="button"
              className={css.membersSidebarClose}
              onClick={() =>
                setInviteModal({
                  roomId: space.id,
                  name: space.name ?? space.id,
                  isSpace: space.isSpace,
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
