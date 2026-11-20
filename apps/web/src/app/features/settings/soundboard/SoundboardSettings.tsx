import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, PencilSimpleIcon, VinylRecordIcon, XIcon } from '@phosphor-icons/react';
import type { MudrixClient, SoundPack } from '@mudrix/core';
import { soundboardEmoji } from '@/call/soundboard';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { Button, IconButton } from '@/app/components/Button';
import { Popover } from '@/app/components/Popover';
import { SoundPackEditor } from '@/app/features/soundboard/SoundPackEditor';
import { SoundboardSection } from '@/app/features/settings/voice/SoundboardSection';
import * as panelCss from '@/app/components/Settings/Settings.css';
import * as css from './SoundboardSettings.css';

function soundCount(t: ReturnType<typeof useTranslation>['t'], pack: SoundPack): string {
  return t('settings.soundboard.soundCount', { count: pack.sounds.length });
}

/** The person's own pack; it is the one used in every call. */
function DefaultPack({
  client,
  reload,
  onEdit,
}: {
  client: MudrixClient;
  reload: number;
  onEdit: (pack: SoundPack) => void;
}) {
  const { t } = useTranslation();
  const [pack, setPack] = useState<SoundPack | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .mySounds()
      .then((mine) => {
        if (!cancelled) setPack(mine);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [client, reload]);

  const first = pack?.sounds[0];

  return (
    <div className={panelCss.section}>
      <h3 className={panelCss.sectionTitle}>{t('settings.soundboard.defaultPack')}</h3>
      <p className={panelCss.settingNote}>{t('settings.soundboard.defaultPackNote')}</p>
      {failed ? (
        <div className={css.emptyPacks}>{t('settings.soundboard.loadFailed')}</div>
      ) : !pack ? (
        <div className={css.skeleton} style={{ height: 58 }} />
      ) : (
        <div className={css.packCard}>
          <div className={css.packCardPreview}>
            {first ? soundboardEmoji(first.shortcode, first.emoji) : <VinylRecordIcon size={20} />}
          </div>
          <div className={css.packCardInfo}>
            <span className={css.packCardName}>
              {pack.name || t('settings.soundboard.defaultPackName')}
            </span>
            <span className={css.packCardMeta}>{soundCount(t, pack)}</span>
          </div>
          <div className={css.packCardActions}>
            <Button variant="secondary" size="sm" onClick={() => onEdit(pack)}>
              <PencilSimpleIcon size={14} className={panelCss.iconBefore} />
              {t('common.edit')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A checkbox list of every sound pack in the person's rooms, grouped by room. */
function SelectPacks({
  client,
  onToggle,
}: {
  client: MudrixClient;
  onToggle: (pack: SoundPack, everywhere: boolean) => void;
}) {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<SoundPack[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setAll(null);
    client
      .allSoundPacks()
      .then(setAll)
      .catch(() => {
        setAll([]);
        setFailed(true);
      });
  }, [client]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const groups = useMemo(() => {
    const byRoom = new Map<string, SoundPack[]>();
    for (const pack of all ?? []) {
      const key = pack.roomName ?? pack.roomId ?? '';
      byRoom.set(key, [...(byRoom.get(key) ?? []), pack]);
    }
    return [...byRoom.entries()];
  }, [all]);

  const toggle = (pack: SoundPack) => {
    const everywhere = !pack.everywhere;
    setAll(
      (prev) =>
        prev?.map((current) => (current.id === pack.id ? { ...current, everywhere } : current)) ??
        prev
    );
    onToggle(pack, everywhere);
  };

  return (
    <>
      <Button ref={anchorRef} variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        {t('settings.soundboard.selectPacks')}
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} role="dialog">
        {!all ? (
          <div className={css.popList} role="status" aria-label={t('common.loading')}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={css.skeleton} style={{ height: 28, margin: '6px 8px' }} />
            ))}
          </div>
        ) : failed ? (
          <div className={css.popEmpty}>{t('settings.soundboard.loadFailed')}</div>
        ) : groups.length === 0 ? (
          <div className={css.popEmpty}>{t('settings.soundboard.noPacksFound')}</div>
        ) : (
          <div className={css.popList}>
            {groups.map(([room, packs]) => (
              <div key={room} className={css.popRoomGroup}>
                <div className={css.popRoomName}>{room}</div>
                {packs.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    role="checkbox"
                    aria-checked={pack.everywhere}
                    className={pack.everywhere ? css.popPackRowSelected : css.popPackRow}
                    onClick={() => toggle(pack)}
                  >
                    <span className={css.popPackThumb}>
                      <VinylRecordIcon size={14} />
                    </span>
                    <span className={css.popPackName}>{pack.name}</span>
                    <span
                      className={
                        pack.everywhere
                          ? `${css.popPackCheckbox} ${css.popPackCheckboxSelected}`
                          : css.popPackCheckbox
                      }
                    >
                      {pack.everywhere && <CheckIcon size={11} weight="bold" />}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </Popover>
    </>
  );
}

/** Packs favourited from other rooms, which apply in every call. */
function FavoritePacks({ client, reload }: { client: MudrixClient; reload: number }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [packs, setPacks] = useState<SoundPack[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .favoriteSoundPacks()
      .then((list) => {
        if (!cancelled) setPacks(list);
      })
      .catch(() => {
        if (!cancelled) {
          setPacks([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, reload]);

  const setEverywhere = useCallback(
    async (pack: SoundPack, everywhere: boolean) => {
      if (!pack.roomId || !pack.stateKey) return;
      const before = packs ?? [];
      const optimistic = (on: boolean) =>
        setPacks((prev) => {
          const rest = (prev ?? []).filter((current) => current.id !== pack.id);
          return on ? [...rest, { ...pack, everywhere: true }] : rest;
        });
      optimistic(everywhere);
      try {
        await client.setSoundPackEverywhere(pack.roomId, pack.stateKey, everywhere);
      } catch (error) {
        setPacks(before);
        toast.error(t('common.saveFailed', { error: getErrorMessage(error) }));
      }
    },
    [client, packs, toast, t]
  );

  const favorites = packs ?? [];

  return (
    <div className={panelCss.section}>
      <div className={css.headerRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className={panelCss.sectionTitle}>{t('settings.soundboard.favoritePacks')}</h3>
          <p className={panelCss.settingNote}>{t('settings.soundboard.favoritePacksNote')}</p>
        </div>
        <div className={css.headerButton}>
          <SelectPacks
            client={client}
            onToggle={(pack, everywhere) => void setEverywhere(pack, everywhere)}
          />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {failed ? (
          <div className={css.emptyPacks}>{t('settings.soundboard.loadFailed')}</div>
        ) : !packs ? (
          <div className={css.skeleton} style={{ height: 58 }} />
        ) : favorites.length === 0 ? (
          <div className={css.emptyPacks}>{t('settings.soundboard.noFavoritePacks')}</div>
        ) : (
          <div className={css.packList}>
            {favorites.map((pack) => (
              <div key={pack.id} className={css.packCard}>
                <div className={css.packCardPreview}>
                  <VinylRecordIcon size={20} />
                </div>
                <div className={css.packCardInfo}>
                  <span className={css.packCardName}>{pack.name}</span>
                  <span className={css.packCardMeta}>
                    {pack.roomName ?? pack.roomId}
                    {' · '}
                    {soundCount(t, pack)}
                  </span>
                </div>
                <div className={css.packCardActions}>
                  <IconButton
                    size="sm"
                    onClick={() => void setEverywhere(pack, false)}
                    aria-label={t('settings.soundboard.removeFavorite', { name: pack.name })}
                    tooltip={t('settings.soundboard.removeFavorite', { name: pack.name })}
                  >
                    <XIcon size={14} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The soundboard's settings page: the on/off switch, volume and muted people on this device, the
 * person's default pack (edited here) and the room packs that are favourited into every call.
 */
export function SoundboardSettings() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const [editing, setEditing] = useState<SoundPack | null>(null);
  const [revision, setRevision] = useState(0);

  if (!client) return null;

  return (
    <div>
      <h2 className={panelCss.panelTitle}>{t('settings.soundboard.title')}</h2>

      {editing ? (
        <SoundPackEditor
          client={client}
          pack={editing}
          onBack={() => setEditing(null)}
          onSave={async (name, attribution, sounds) => {
            await client.saveSoundPack(null, '', name, attribution || null, sounds);
            setEditing(null);
            setRevision((value) => value + 1);
          }}
        />
      ) : (
        <>
          <SoundboardSection />
          <div className={panelCss.divider} />
          <DefaultPack client={client} reload={revision} onEdit={setEditing} />
          <div className={panelCss.divider} />
          <FavoritePacks client={client} reload={revision} />
        </>
      )}
    </div>
  );
}
