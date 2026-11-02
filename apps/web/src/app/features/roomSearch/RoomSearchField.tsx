import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom, useAtomValue } from 'jotai';
import {
  CaretDownIcon,
  CaretUpIcon,
  HashStraightIcon,
  MagnifyingGlassIcon,
  XIcon,
} from '@phosphor-icons/react';
import { roomSearchAtom, roomSearchResultsAtom } from '@/app/store/atoms';
import { useRoom } from '@/app/data';
import * as css from './RoomSearchField.css';

export function RoomSearchField() {
  const { t } = useTranslation();
  const [roomSearch, setRoomSearch] = useAtom(roomSearchAtom);
  const results = useAtomValue(roomSearchResultsAtom);
  const inputRef = useRef<HTMLInputElement>(null);

  const room = useRoom(roomSearch?.roomId);
  const openedAt = roomSearch?.openedAt;
  useEffect(() => {
    if (openedAt !== undefined) inputRef.current?.focus();
  }, [openedAt]);

  if (!roomSearch) return null;

  const roomName = room?.name ?? '';
  const ownResults = results?.roomId === roomSearch.roomId ? results : null;
  const matchCount = ownResults?.matchCount ?? 0;
  const hasQuery = roomSearch.query.trim() !== '';
  const close = () => setRoomSearch(null);

  return (
    <div className={css.field}>
      <MagnifyingGlassIcon size={14} />
      <span className={css.scope}>
        <HashStraightIcon size={11} weight="bold" />
        <span className={css.scopeName}>{roomName}</span>
      </span>
      <input
        ref={inputRef}
        className={css.input}
        placeholder={t('room.header.searchMessages')}
        value={roomSearch.query}
        onChange={(e) => setRoomSearch({ ...roomSearch, query: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
          else if (e.key === 'Enter') {
            if (e.shiftKey) ownResults?.prev();
            else ownResults?.next();
          }
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {hasQuery && (
        <>
          <span className={css.count}>
            {matchCount === 0
              ? t('room.header.noResults')
              : t('room.header.searchResultCount', {
                  active: (ownResults?.activeMatch ?? 0) + 1,
                  total: matchCount,
                })}
          </span>
          <button
            type="button"
            className={css.iconBtn}
            onClick={() => ownResults?.prev()}
            disabled={matchCount === 0}
            aria-label={t('room.header.prevMatch')}
          >
            <CaretUpIcon size={14} />
          </button>
          <button
            type="button"
            className={css.iconBtn}
            onClick={() => ownResults?.next()}
            disabled={matchCount === 0}
            aria-label={t('room.header.nextMatch')}
          >
            <CaretDownIcon size={14} />
          </button>
        </>
      )}
      <button type="button" className={css.iconBtn} onClick={close} aria-label={t('common.close')}>
        <XIcon size={14} />
      </button>
    </div>
  );
}
