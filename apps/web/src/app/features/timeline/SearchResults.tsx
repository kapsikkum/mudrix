import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchHit } from '@wizardchat/core';
import { highlightQuery } from '@/app/hooks/useSearch';
import type { ServerSearchStatus } from '@/app/hooks/useRoomServerSearch';
import { useMembers } from '@/app/data';
import { formatShortDateLabel, formatTime } from '@/util/format';
import { formatUserId } from '@/util/matrix';
import { Spinner } from '@/app/components/Spinner';
import { makeSnippet } from './searchSnippet';
import * as css from './SearchResults.css';

interface Props {
  roomId: string;
  query: string;
  status: ServerSearchStatus;
  results: SearchHit[];
  loadingMore: boolean;
  next: string | null;
  error: string | null;
  onLoadMore: () => void;
  onJump: (result: SearchHit) => void;
}

/** What a server-side search of the room's unencrypted messages found, with "load more". */
export function SearchResults({
  roomId,
  query,
  status,
  results,
  loadingMore,
  next,
  error,
  onLoadMore,
  onJump,
}: Props) {
  const { t, i18n } = useTranslation();
  const members = useMembers(roomId).data;
  const names = useMemo(
    () => new Map((members ?? []).map((m) => [m.userId, m.displayName ?? formatUserId(m.userId)])),
    [members]
  );

  if (status === 'loading' || (status === 'idle' && query.trim())) {
    return (
      <div className={css.status}>
        <Spinner />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={`${css.status} ${css.statusError}`}>
        {t('room.header.serverSearchFailed', { error })}
      </div>
    );
  }

  if (results.length === 0) {
    return <div className={css.status}>{t('room.header.searchEmpty', { query })}</div>;
  }

  return (
    <div className={css.list}>
      {results.map((hit) => {
        const senderName = names.get(hit.sender) ?? formatUserId(hit.sender);
        const parts = highlightQuery(makeSnippet(hit.body, query), query);
        return (
          <button key={hit.eventId} type="button" className={css.item} onClick={() => onJump(hit)}>
            <span className={css.itemMeta}>
              <span className={css.itemSender}>{senderName}</span>
              <span className={css.itemTime}>
                {formatShortDateLabel(hit.timestamp, t, i18n.language)}{' '}
                {formatTime(hit.timestamp, i18n.language)}
              </span>
            </span>
            <span className={css.itemBody}>
              {parts.map((part, i) =>
                part.highlighted ? (
                  <mark key={i} className={css.highlight}>
                    {part.text}
                  </mark>
                ) : (
                  <span key={i}>{part.text}</span>
                )
              )}
            </span>
          </button>
        );
      })}
      {next !== null && (
        <button type="button" className={css.loadMore} onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? t('common.searching') : t('room.header.loadMoreResults')}
        </button>
      )}
    </div>
  );
}
