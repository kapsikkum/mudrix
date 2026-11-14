import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, StickerIcon } from '@phosphor-icons/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import {
  useAllRoomsPacks,
  packKindOf,
  type PackKind,
  type RoomPackSummary,
} from '@/app/hooks/useUserPacks';
import { useRoomNames } from './roomNames';
import { Popover } from '@/app/components/Popover';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import { vars } from '@/theme/vars.css';
import * as css from './EmojisStickers.css';

interface Props {
  client: MatrixClient;
  /** All current subscriptions (every kind). */
  current: RoomPackSummary[];
  /** Receives the complete subscription list (every kind), not just the visible kind. */
  onSave: (favorites: RoomPackSummary[]) => void;
  /**
   * Which kind of pack this picker manages. Avatar decorations, profile effects and emoji packs
   * are listed and bulk-edited strictly separately.
   */
  kind?: PackKind;
}

type PackKey = string;

function makeKey(fav: RoomPackSummary): PackKey {
  return `${fav.roomId}/${fav.stateKey}`;
}

const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 40;
const LIST_HEIGHT = 230;

type Row =
  | { type: 'header'; id: string; roomName: string }
  | { type: 'pack'; id: string; pack: RoomPackSummary };

interface PickerListProps {
  client: MatrixClient;
  kind: PackKind | undefined;
  current: RoomPackSummary[];
  onSave: (favorites: RoomPackSummary[]) => void;
}

function PackPickerList({ client, kind, current, onSave }: PickerListProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<PackKey>>(() => new Set(current.map(makeKey)));

  const allPacks = useAllRoomsPacks(client);
  const roomNames = useRoomNames();

  const visiblePacks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allPacks.filter((p) => {
      if (kind && packKindOf(p.usage) !== kind) return false;
      if (!q) return true;
      const roomName = roomNames.get(p.roomId) ?? '';
      return p.displayName.toLowerCase().includes(q) || roomName.toLowerCase().includes(q);
    });
  }, [allPacks, kind, query, roomNames]);

  const rows = useMemo<Row[]>(() => {
    const byRoom = new Map<string, RoomPackSummary[]>();
    for (const pack of visiblePacks) {
      const list = byRoom.get(pack.roomId) ?? [];
      list.push(pack);
      byRoom.set(pack.roomId, list);
    }
    const out: Row[] = [];
    for (const [roomId, packs] of byRoom) {
      out.push({
        type: 'header',
        id: `h:${roomId}`,
        roomName: roomNames.get(roomId) ?? roomId,
      });
      packs
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .forEach((pack) => out.push({ type: 'pack', id: makeKey(pack), pack }));
    }
    return out;
  }, [visiblePacks, roomNames]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i].type === 'header' ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: 8,
  });

  // Keep the not-yet-listed subscriptions (e.g. packs of other kinds) when saving.
  const commit = useCallback(
    (next: Set<PackKey>) => {
      setSelected(next);
      const known = new Map(allPacks.map((p) => [makeKey(p), p]));
      const list = allPacks.filter((p) => next.has(makeKey(p)));
      for (const fav of current) {
        const key = makeKey(fav);
        if (next.has(key) && !known.has(key)) list.push(fav);
      }
      onSave(list);
    },
    [allPacks, current, onSave]
  );

  const handleToggle = useCallback(
    (fav: RoomPackSummary) => {
      const key = makeKey(fav);
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      commit(next);
    },
    [selected, commit]
  );

  const setAllVisible = useCallback(
    (on: boolean) => {
      const next = new Set(selected);
      for (const pack of visiblePacks) {
        if (on) next.add(makeKey(pack));
        else next.delete(makeKey(pack));
      }
      commit(next);
    },
    [selected, visiblePacks, commit]
  );

  const selectedVisible = visiblePacks.filter((p) => selected.has(makeKey(p))).length;

  return (
    <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Input
        placeholder={t('settings.emojisStickers.searchPacks')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-dialog-autofocus
      />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Button
          variant="secondary"
          size="sm"
          disabled={visiblePacks.length === 0 || selectedVisible === visiblePacks.length}
          onClick={() => setAllVisible(true)}
        >
          {t('settings.emojisStickers.subscribeAll')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={selectedVisible === 0}
          onClick={() => setAllVisible(false)}
        >
          {t('settings.emojisStickers.unsubscribeAll')}
        </Button>
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: vars.color.textMuted }}>
          {selectedVisible}/{visiblePacks.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className={css.popEmpty}>
          {allPacks.length === 0
            ? t('settings.emojisStickers.noPacksFound')
            : t('settings.emojisStickers.noPacksMatch')}
        </div>
      ) : (
        <div ref={scrollRef} style={{ height: LIST_HEIGHT, overflowY: 'auto' }}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              const style: React.CSSProperties = {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: item.size,
                transform: `translateY(${item.start}px)`,
              };
              if (row.type === 'header') {
                return (
                  <div key={row.id} style={style} className={css.popRoomName}>
                    {row.roomName}
                  </div>
                );
              }
              const { pack } = row;
              const isSelected = selected.has(row.id);
              return (
                <div key={row.id} style={style}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    className={isSelected ? css.popPackRowSelected : css.popPackRow}
                    style={{ height: '100%', boxSizing: 'border-box' }}
                    onClick={() => handleToggle(pack)}
                  >
                    <span className={css.popPackThumb}>
                      {pack.avatarMxc ? (
                        <AuthMediaImg
                          client={client}
                          mxcUrl={pack.avatarMxc}
                          width={48}
                          height={48}
                          alt=""
                          className={css.popPackThumbImg}
                        />
                      ) : (
                        <StickerIcon size={14} />
                      )}
                    </span>
                    <span className={css.popPackName}>{pack.displayName}</span>
                    <span
                      className={
                        isSelected
                          ? `${css.popPackCheckbox} ${css.popPackCheckboxSelected}`
                          : css.popPackCheckbox
                      }
                    >
                      {isSelected && <CheckIcon size={11} weight="bold" />}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function FavoritePacksSelect({ client, current, onSave, kind }: Props) {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  // The list below captures `current` when it opens. Re-syncing it on every account-data echo
  // would undo clicks made before the previous write came back.
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  return (
    <>
      <Button ref={anchorRef} variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        {t('settings.emojisStickers.selectPacks')}
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} role="dialog">
        {open && (
          <PackPickerList
            client={client}
            kind={kind}
            current={currentRef.current}
            onSave={onSave}
          />
        )}
      </Popover>
    </>
  );
}
