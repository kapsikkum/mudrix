import { Fragment, useCallback, useMemo } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { SparkleIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { showCosmeticPacksAtom } from '@/app/store/atoms';
import { useExtendedProfile, useExtendedProfileMutations } from '@/app/hooks/useExtendedProfile';
import { useFavoritePackEntries, useUserPack } from '@/app/hooks/useUserPacks';
import { useToast } from '@/app/hooks/useToast';
import { ToggleRow } from '@/app/components/Toggle';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import { DECORATION_LABEL_KEYS } from '@/app/features/profile/ProfileCosmetics';
import { BUILTIN_EFFECT_LABELS } from '../account/ProfileStyle';
import {
  BUILTIN_FRAMES,
  BUILTIN_NAMEPLATES,
  builtinFramePreviewSrc,
  builtinNameplateSrc,
} from '@/util/builtinCosmetics';
import {
  BUILTIN_DECORATION_IDS,
  BUILTIN_PROFILE_EFFECT_IDS,
  avatarDecorationSrc,
  parseNameplate,
  parseProfileFrame,
  type AvatarDecorationId,
  type NameplateId,
  type ProfileEffectId,
  type ProfileFrameId,
} from '@/util/profileCosmetics';
import {
  COSMETIC_KINDS,
  cosmeticValueOf,
  packItemsOfKind,
  parseCosmeticPack,
  type CosmeticKind,
  type CosmeticPack,
  type CosmeticPackItem,
} from '@/util/cosmeticPacks';
import { getErrorMessage } from '@/util/error';
import { FavoritePacks } from '../emojis/FavoritePacks';
import { useRoomNames } from '../emojis/roomNames';
import * as panelCss from '@/app/components/Settings/Settings.css';
import * as css from './Cosmetics.css';

interface BuiltinCosmetic {
  id: string;
  name: string;
  src?: string;
}

function storedId(
  value: AvatarDecorationId | ProfileEffectId | NameplateId | ProfileFrameId | null
) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.url || null;
}

interface PackEntry {
  key: string;
  name: string;
  source: string;
  pack: CosmeticPack;
}

function userPackEntry(userPack: ReturnType<typeof useUserPack>, name: string): PackEntry | null {
  if (!userPack) return null;
  const contents = [
    {
      pack: { display_name: userPack.displayName, usage: userPack.usage },
      images: userPack.images,
    },
  ];
  const pack = parseCosmeticPack(null, 'personal', contents);
  return pack ? { key: 'personal', name, source: '', pack } : null;
}

function Items({
  client,
  items,
  current,
  onPick,
}: {
  client: MatrixClient;
  items: CosmeticPackItem[];
  current: string | null;
  onPick: (item: CosmeticPackItem) => void;
}) {
  return (
    <div className={css.grid}>
      {items.map((item) => (
        <button
          key={item.shortcode}
          type="button"
          className={current === item.url ? `${css.tile} ${css.tileSelected}` : css.tile}
          aria-pressed={current === item.url}
          title={item.name}
          onClick={() => onPick(item)}
        >
          <span className={css.tileArt}>
            <AuthMediaImg
              client={client}
              mxcUrl={item.url}
              width={96}
              height={96}
              alt={item.name}
              placeholder="sticker"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </span>
          <span className={css.tileName}>{item.name}</span>
        </button>
      ))}
    </div>
  );
}

function PackList({
  client,
  kind,
  current,
  onPick,
}: {
  client: MatrixClient;
  kind: CosmeticKind;
  current: string | null;
  onPick: (item: CosmeticPackItem) => void;
}) {
  const { t } = useTranslation();
  const entries = useFavoritePackEntries(client);
  const userPack = useUserPack(client);
  const roomNames = useRoomNames();

  const packs = useMemo(() => {
    const out: PackEntry[] = [];
    const own = userPackEntry(userPack, t('profile.cosmetics.myUploads'));
    if (own) out.push(own);
    for (const entry of entries) {
      const pack = parseCosmeticPack(entry.summary.roomId, entry.summary.stateKey, entry.contents);
      if (!pack) continue;
      out.push({
        key: `${entry.summary.roomId}/${entry.summary.stateKey}`,
        name: pack.displayName,
        source: roomNames.get(entry.summary.roomId) ?? entry.summary.roomId,
        pack,
      });
    }
    return out;
  }, [entries, userPack, roomNames, t]);

  return (
    <>
      {packs.map((entry) => {
        const items = packItemsOfKind(entry.pack, kind);
        if (items.length === 0) return null;
        return (
          <div key={entry.key} className={css.packBlock}>
            <div className={css.packHead}>
              <span className={css.packName}>{entry.name}</span>
              {entry.source && <span className={css.packSource}>{entry.source}</span>}
            </div>
            <Items client={client} items={items} current={current} onPick={onPick} />
          </div>
        );
      })}
    </>
  );
}

export function Cosmetics() {
  const { t } = useTranslation();
  const toast = useToast();
  const client = getMatrixClientOrNull();
  const [showPacks, setShowPacks] = useAtom(showCosmeticPacksAtom);
  const { data: fields } = useExtendedProfile(client, client?.userId() ?? null);
  const { saveFields } = useExtendedProfileMutations(client);

  const builtins = useMemo(() => {
    const groups: Record<CosmeticKind, BuiltinCosmetic[]> = {
      decoration: BUILTIN_DECORATION_IDS.map((id) => ({
        id,
        name: DECORATION_LABEL_KEYS[id] ? t(DECORATION_LABEL_KEYS[id]) : id,
        src: avatarDecorationSrc(id),
      })),
      effect: BUILTIN_PROFILE_EFFECT_IDS.map((id) => ({
        id,
        name: BUILTIN_EFFECT_LABELS[id] ? t(BUILTIN_EFFECT_LABELS[id]) : id,
      })),
      nameplate: BUILTIN_NAMEPLATES.map((plate) => ({
        id: plate.id,
        name: plate.name,
        src: builtinNameplateSrc(plate),
      })),
      profile_frame: BUILTIN_FRAMES.map((frame) => ({
        id: frame.id,
        name: frame.name,
        src: builtinFramePreviewSrc(frame),
      })),
    };
    return groups;
  }, [t]);

  const currentIds = useMemo(
    () => ({
      decoration: storedId(fields?.avatarDecoration ?? null),
      effect: storedId(fields?.profileEffect ?? null),
      nameplate: storedId(fields?.nameplate ?? null),
      profile_frame: storedId(fields?.profileFrame ?? null),
    }),
    [fields]
  );

  const pick = useCallback(
    async (kind: CosmeticKind, value: unknown) => {
      try {
        if (kind === 'decoration') {
          await saveFields({ avatarDecoration: value as AvatarDecorationId });
        } else if (kind === 'effect') {
          await saveFields({ profileEffect: value as ProfileEffectId });
        } else if (kind === 'nameplate') {
          await saveFields({ nameplate: parseNameplate(value) });
        } else {
          await saveFields({ profileFrame: parseProfileFrame(value) });
        }
      } catch (err) {
        toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
      }
    },
    [saveFields, toast, t]
  );

  if (!client) return null;

  return (
    <div>
      <h2 className={panelCss.panelTitle}>{t('settings.cosmetics.title')}</h2>
      <p className={panelCss.settingNote} style={{ marginBottom: 16 }}>
        {t('settings.cosmetics.note')}
      </p>

      <ToggleRow
        label={t('settings.cosmetics.showPacks')}
        description={t('settings.cosmetics.showPacksDescription')}
        checked={showPacks}
        onChange={setShowPacks}
      />

      {!showPacks && (
        <p className={panelCss.settingNote} style={{ marginTop: 12 }}>
          {t('settings.cosmetics.packsOff')}
        </p>
      )}

      {COSMETIC_KINDS.map((kind) => (
        <Fragment key={kind}>
          <div className={panelCss.divider} />
          <div className={panelCss.section}>
            <h3 className={panelCss.sectionTitle}>{t(`settings.cosmetics.kindPlural.${kind}`)}</h3>
            <div className={css.label}>{t('profile.cosmetics.builtin')}</div>
            <div className={css.grid}>
              {builtins[kind].map((item) => {
                const selected = currentIds[kind] === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={selected ? `${css.tile} ${css.tileSelected}` : css.tile}
                    aria-pressed={selected}
                    title={item.name}
                    onClick={() => void pick(kind, item.id)}
                  >
                    <span className={css.tileArt}>
                      {item.src ? (
                        <img
                          src={item.src}
                          alt=""
                          className={css.tileArt}
                          loading="lazy"
                          draggable={false}
                        />
                      ) : (
                        <SparkleIcon size={28} />
                      )}
                    </span>
                    <span className={css.tileName}>{item.name}</span>
                  </button>
                );
              })}
            </div>
            {showPacks && (
              <>
                <PackList
                  client={client}
                  kind={kind}
                  current={currentIds[kind]}
                  onPick={(item) => void pick(kind, cosmeticValueOf(item))}
                />
                <FavoritePacks
                  client={client}
                  kind={kind}
                  title={t('settings.emojisStickers.favoritePacks')}
                  note={t('settings.cosmetics.hint')}
                  empty={t('settings.cosmetics.empty')}
                />
              </>
            )}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
