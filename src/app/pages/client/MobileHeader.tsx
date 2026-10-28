import { useTranslation } from 'react-i18next';
import { CaretLeftIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  mobileDrawerOpenAtom,
  currentRoomIdAtom,
  currentSpaceIdAtom,
  globalSearchOpenAtom,
  inboxOpenAtom,
  mobileYouOpenAtom,
  roomSearchAtom,
  sidebarViewAtom,
} from '@/app/store/atoms';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useMobileListOpen } from './hooks/useMobileListOpen';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { UpdateButton } from '@/app/components/UpdateButton/UpdateButton';
import { EncryptionWarningButton } from '@/app/components/EncryptionWarningButton/EncryptionWarningButton';
import { RoomSearchField } from '@/app/features/roomSearch';
import * as css from './MobileHeader.css';

export function MobileHeader() {
  const { t } = useTranslation();
  const setDrawerOpen = useSetAtom(mobileDrawerOpenAtom);
  const listOpen = useMobileListOpen();
  const sidebarView = useAtomValue(sidebarViewAtom);
  const currentSpaceId = useAtomValue(currentSpaceIdAtom);
  const currentRoomId = useAtomValue(currentRoomIdAtom);
  const openGlobalSearch = useSetAtom(globalSearchOpenAtom);
  const roomSearch = useAtomValue(roomSearchAtom);
  const inboxOpen = useAtomValue(inboxOpenAtom);
  const youOpen = useAtomValue(mobileYouOpenAtom);
  // Inbox and the search field share global state, so they only mount here on mobile
  const isMobile = useMediaQuery('(max-width: 768px)');
  const searchingRoom = isMobile && !!roomSearch && roomSearch.roomId === currentRoomId;

  const listTitle = youOpen
    ? t('settings.userSettings')
    : inboxOpen
      ? t('inbox.title')
      : sidebarView === 'dms'
        ? t('room.dm.directMessages')
        : sidebarView === 'space'
          ? (getMatrixClientOrNull()?.getRoom(currentSpaceId ?? '')?.name ?? t('mobileNav.spaces'))
          : t('room.home');

  return (
    <div className={css.mobileHeader}>
      {listOpen ? (
        <span className={css.mobileHeaderSpacer} />
      ) : (
        <button
          type="button"
          className={css.mobileMenuBtn}
          onClick={() => setDrawerOpen(true)}
          aria-label={t('common.back')}
          data-back-dismiss={isMobile || undefined}
        >
          <CaretLeftIcon size={20} />
        </button>
      )}
      {searchingRoom ? (
        <div className={css.mobileSearch}>
          <RoomSearchField />
        </div>
      ) : (
        <>
          <span className={css.mobileHeaderTitle}>
            <span className={css.mobileHeaderTitleText}>{listOpen ? listTitle : 'WizardChat'}</span>
          </span>
          <div className={css.mobileActions}>
            <button
              type="button"
              className={css.mobileActionBtn}
              onClick={() => openGlobalSearch(true)}
              aria-label={t('roomSwitcher.title')}
            >
              <MagnifyingGlassIcon size={16} />
            </button>
            <UpdateButton />
            <EncryptionWarningButton />
          </div>
        </>
      )}
    </div>
  );
}
