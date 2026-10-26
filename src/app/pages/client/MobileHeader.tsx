import { useTranslation } from 'react-i18next';
import { ListIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  mobileDrawerOpenAtom,
  currentRoomIdAtom,
  globalSearchOpenAtom,
  roomSearchAtom,
} from '@/app/store/atoms';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import { Inbox } from '@/app/features/inbox';
import { UpdateButton } from '@/app/components/UpdateButton/UpdateButton';
import { EncryptionWarningButton } from '@/app/components/EncryptionWarningButton/EncryptionWarningButton';
import { RoomSearchField } from '@/app/features/roomSearch';
import * as css from './MobileHeader.css';

export function MobileHeader() {
  const { t } = useTranslation();
  const [, setDrawerOpen] = useAtom(mobileDrawerOpenAtom);
  const currentRoomId = useAtomValue(currentRoomIdAtom);
  const openGlobalSearch = useSetAtom(globalSearchOpenAtom);
  const roomSearch = useAtomValue(roomSearchAtom);
  // Inbox and the search field share global state, so they only mount here on mobile
  const isMobile = useMediaQuery('(max-width: 768px)');
  const searchingRoom = isMobile && !!roomSearch && roomSearch.roomId === currentRoomId;

  return (
    <div className={css.mobileHeader}>
      <button
        type="button"
        className={css.mobileMenuBtn}
        onClick={() => setDrawerOpen(true)}
        aria-label={t('common.menu')}
      >
        <ListIcon size={20} />
      </button>
      {searchingRoom ? (
        <div className={css.mobileSearch}>
          <RoomSearchField />
        </div>
      ) : (
        <>
          <span className={css.mobileHeaderTitle}>WizardChat</span>
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
            {isMobile && <Inbox />}
          </div>
        </>
      )}
    </div>
  );
}
