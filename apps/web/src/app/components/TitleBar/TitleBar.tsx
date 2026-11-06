import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue, useSetAtom } from 'jotai';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { currentRoomIdAtom, roomSearchAtom, globalSearchOpenAtom } from '@/app/store/atoms';
import { RoomSearchField } from '@/app/features/roomSearch';
import { MODIFIER_KEY } from '@/app/util/platform';
import { KeyCaps } from '@/app/components/KeyCaps';
import { drawsWindowControls } from '@/bridge/desktop';
import { WindowControls } from './WindowControls';
import * as css from './TitleBar.css';

interface TitleBarProps {
  start?: ReactNode;
  center?: ReactNode;
  end?: ReactNode;
  fixed?: boolean;
}

export function TitleBar({ start, center, end, fixed }: TitleBarProps) {
  return (
    <header className={fixed ? css.titleBarFixed : css.titleBar} data-tauri-drag-region>
      {start && <div className={css.start}>{start}</div>}
      {center && (
        <div className={css.center} data-global-search-anchor>
          {center}
        </div>
      )}
      {end && <div className={css.end}>{end}</div>}
      {drawsWindowControls && <WindowControls />}
    </header>
  );
}

export function TitleBarSearch() {
  const { t } = useTranslation();
  const openGlobalSearch = useSetAtom(globalSearchOpenAtom);
  const roomSearch = useAtomValue(roomSearchAtom);
  const currentRoomId = useAtomValue(currentRoomIdAtom);
  if (roomSearch && roomSearch.roomId === currentRoomId) return <RoomSearchField />;
  return (
    <button type="button" className={css.search} onClick={() => openGlobalSearch(true)}>
      <MagnifyingGlassIcon size={14} />
      <span className={css.searchLabel}>{t('titleBar.search')}</span>
      <KeyCaps keys={[MODIFIER_KEY, 'K']} size="sm" />
    </button>
  );
}
