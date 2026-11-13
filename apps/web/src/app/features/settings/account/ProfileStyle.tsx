import {
  CosmeticChooserModal,
  useCosmeticActions,
  buildCosmeticCategories,
} from './CosmeticChooserModal';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtom } from 'jotai';
import { Toggle } from '@/app/components/Toggle';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import {
  SmileyIcon,
  SparkleIcon,
  UserCircleIcon,
  ArrowCounterClockwiseIcon,
  TrashIcon,
  IdentificationBadgeIcon,
  FrameCornersIcon,
} from '@phosphor-icons/react';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { Button } from '@/app/components/Button';
import { Field } from '@/app/components/Field';
import { Input } from '@/app/components/Input';
import { Avatar } from '@/app/components/Avatar';
import { useMediaBlobUrl } from '@/app/components/Avatar/useMediaBlobUrl';
import { useToast } from '@/app/hooks/useToast';
import { useInView } from '@/app/hooks/useInView';
import { useProfile } from '@/app/hooks/useProfile';
import {
  useDecorationPacks,
  useEffectPacks,
  useNameplatePacks,
  useProfileFramePacks,
  useFavoritePacks,
  saveFavoritePacks,
  lookupPackImage,
  uploadUserDecoration,
  deleteUserDecoration,
  uploadUserEffect,
  deleteUserEffect,
  uploadUserNameplate,
  deleteUserNameplate,
  uploadUserProfileFrame,
  deleteUserProfileFrame,
  type DecorationPackImage,
  type EffectPackImage,
  type NameplatePackImage,
  type ProfileFramePackImage,
  type RoomPackSummary,
} from '@/app/hooks/useUserPacks';
import {
  useActiveStatus,
  useExtendedProfile,
  useExtendedProfileMutations,
  useExtendedProfileSupport,
} from '@/app/hooks/useExtendedProfile';
import { useUserBannerBlob } from '@/app/hooks/useUserBanner';
import { CustomStatusModal } from '@/app/features/profile/CustomStatusModal';
import * as cardCss from '@/app/features/profile/ProfileCard.css';
import {
  DECORATION_LABEL_KEYS,
  DecoratedAvatar,
  PROFILE_BADGES,
  type BadgeDefinition,
  ProfileBadges,
  StatusPill,
  useDecorationSrc,
  useEffectSrc,
  useNameplateSrc,
  NameplateWrapper,
} from '@/app/features/profile/ProfileCosmetics';
import { vars } from '@/theme/vars.css';
import { ProfileEffect } from '@/app/features/profile/ProfileEffect';
import { ProfileFrame } from '@/app/features/profile/ProfileFrame';
import { getErrorMessage } from '@/util/error';
import {
  ACCENT_PRESETS,
  BUILTIN_DECORATION_IDS,
  BUILTIN_PROFILE_EFFECT_IDS,
  accentGradient,
  normalizeHex,
  readableTextColor,
  nameplatePaletteRgb,
  type AvatarDecorationId,
  type ProfileEffectId,
  type NameplateId,
  type ProfileFrameId,
} from '@/util/profileCosmetics';
import {
  BUILTIN_FRAMES,
  BUILTIN_NAMEPLATES,
  builtinFramePreviewSrc,
  getBuiltinFrame,
  getBuiltinNameplate,
} from '@/util/builtinCosmetics';
import { formatPronouns } from '@/util/profileFields';
import * as settingsCss from '@/app/components/Settings/Settings.css';
import * as css from './ProfileStyle.css';
import { zIndex } from '@/theme/zIndex';

const DEFAULT_PICKER_COLOR = '#5865f2';

export const BUILTIN_EFFECT_LABELS: Record<string, string> = {
  'falling-stars': 'profile.effect.fallingStars',
  hearts: 'profile.effect.hearts',
  snow: 'profile.effect.snow',
  sparkles: 'profile.effect.sparkles',
  'claude-sparks': 'profile.effect.claudeSparks',
  bubbles: 'profile.effect.bubbles',
  confetti: 'profile.effect.confetti',
  fireflies: 'profile.effect.fireflies',
  'autumn-leaves': 'profile.effect.autumnLeaves',
  'mud-splatter': 'profile.effect.mudSplatter',
  'creeping-hands': 'profile.effect.creepingHands',
  'signal-intrusion': 'profile.effect.signalIntrusion',
  'broadcast-hijack': 'profile.effect.broadcastHijack',
  'eevee-stars': 'profile.effect.eeveeStars',
};

interface DecorationOptionProps {
  id: string | null;
  label: string;
  isSelected: boolean;
  isCustomUpload?: boolean;
  /** Extra tooltip text, e.g. that the pack is no longer subscribed. */
  hint?: string;
  client: MatrixClient | null;
  onSelect: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

function DecorationOptionItem({
  id,
  label,
  isSelected,
  isCustomUpload,
  hint,
  client,
  onSelect,
  onDelete,
}: DecorationOptionProps) {
  const { t } = useTranslation();
  const [viewRef, inView] = useInView<HTMLDivElement>();
  const [hovered, setHovered] = useState(false);
  // Grid tiles load a small still thumbnail, and only while on screen. The full animated media
  // is fetched (one at a time) only for the hovered or selected tile.
  const thumbSrc = useDecorationSrc(id, client, { thumb: 96, enabled: inView });
  const fullSrc = useDecorationSrc(id, client, { enabled: inView && (hovered || isSelected) });
  const src = fullSrc ?? thumbSrc;

  return (
    <div
      ref={viewRef}
      className={css.decorationOptionWrap}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={css.decorationOption}
        aria-pressed={isSelected}
        onClick={onSelect}
        title={hint ? label + ' - ' + hint : label}
      >
        <span className={css.decorationPreview}>
          <span className={css.decorationPreviewAvatar} />
          {id && src && (
            <img
              className={cardCss.decoration}
              src={src}
              alt=""
              loading="lazy"
              draggable={false}
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          )}
        </span>
        <span className={css.decorationLabel}>{label}</span>
      </button>
      {isCustomUpload && id && onDelete && (
        <button
          type="button"
          className={css.deleteCustomBtn}
          title={t('profile.decoration.deleteUploaded')}
          onClick={onDelete}
        >
          <TrashIcon size={11} />
        </button>
      )}
    </div>
  );
}

interface EffectOptionProps {
  id: string | null;
  label: string;
  category: string;
  isSelected: boolean;
  isCustomUpload?: boolean;
  hint?: string;
  client: MatrixClient | null;
  onSelect: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

function EffectOptionItem({
  id,
  label,
  category,
  isSelected,
  isCustomUpload,
  hint,
  client,
  onSelect,
  onDelete,
}: EffectOptionProps) {
  const { t } = useTranslation();
  const [viewRef, inView] = useInView<HTMLDivElement>();
  const [hovered, setHovered] = useState(false);
  const thumbSrc = useEffectSrc(id, client, { thumb: 144, enabled: inView });
  const fullSrc = useEffectSrc(id, client, { enabled: inView && (hovered || isSelected) });
  const src = fullSrc ?? thumbSrc;

  return (
    <div
      ref={viewRef}
      className={css.decorationOptionWrap}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={css.effectOption}
        aria-pressed={isSelected}
        onClick={onSelect}
        title={hint ? label + ' - ' + hint : label}
      >
        {src ? (
          <img
            className={css.effectOptionThumb}
            src={src}
            alt=""
            loading="lazy"
            draggable={false}
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <div
            className={css.effectOptionThumb}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SparkleIcon size={28} style={{ color: '#a78bfa' }} />
          </div>
        )}
        <span className={css.effectOptionTitle}>{label}</span>
        <span className={css.effectOptionCategory}>{category}</span>
      </button>
      {isCustomUpload && id && onDelete && (
        <button
          type="button"
          className={css.deleteCustomBtn}
          title={t('profile.effect.deleteUploaded')}
          onClick={onDelete}
        >
          <TrashIcon size={11} />
        </button>
      )}
    </div>
  );
}

function EffectCosmeticThumb({
  effect,
  client,
}: {
  effect: ProfileEffectId | null;
  client: MatrixClient | null;
}) {
  const src = useEffectSrc(effect, client);
  if (!effect) {
    return <SparkleIcon size={24} style={{ color: vars.color.textMuted }} />;
  }
  if (src) {
    return <img className={css.cosmeticThumbImg} src={src} alt="" />;
  }
  return <SparkleIcon size={24} style={{ color: '#a78bfa' }} />;
}

interface NameplateOptionProps {
  id: string | null;
  label: string;
  category: string;
  palette?: string;
  isSelected: boolean;
  isCustomUpload?: boolean;
  client: MatrixClient | null;
  onSelect: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

function NameplateOptionItem({
  id,
  label,
  category,
  palette,
  isSelected,
  isCustomUpload,
  client,
  onSelect,
  onDelete,
}: NameplateOptionProps) {
  const { t } = useTranslation();
  const [viewRef, inView] = useInView<HTMLDivElement>();
  const src = useNameplateSrc(id, client, { enabled: inView });
  const rgb = nameplatePaletteRgb(palette);

  return (
    <div ref={viewRef} className={css.decorationOptionWrap}>
      <button
        type="button"
        className={css.nameplateOption}
        aria-pressed={isSelected}
        onClick={onSelect}
        title={label}
      >
        <div
          className={css.nameplateOptionPlate}
          style={{
            background: `linear-gradient(90deg, rgba(${rgb}, 0.2) 0%, rgba(${rgb}, 0.55) 100%), rgba(0, 0, 0, 0.25)`,
          }}
        >
          {src && (
            <img
              src={src}
              alt=""
              className={cardCss.nameplateBg}
              draggable={false}
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          )}
          <span
            style={{
              position: 'relative',
              zIndex: zIndex.raised,
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#ffffff',
              textShadow: '0 1px 3px rgba(0, 0, 0, 0.8)',
            }}
          >
            {label}
          </span>
        </div>
        <span className={css.effectOptionCategory}>{category}</span>
      </button>
      {isCustomUpload && id && onDelete && (
        <button
          type="button"
          className={css.deleteCustomBtn}
          title={t('profile.cosmetics.deleteCustom')}
          onClick={onDelete}
        >
          <TrashIcon size={11} />
        </button>
      )}
    </div>
  );
}

function NameplateCosmeticThumb({
  nameplate,
  client,
}: {
  nameplate: NameplateId | null;
  client: MatrixClient | null;
}) {
  const url =
    typeof nameplate === 'object' && nameplate !== null ? nameplate.url : (nameplate ?? null);
  const palette =
    typeof nameplate === 'object' && nameplate !== null
      ? nameplate.palette
      : getBuiltinNameplate(url)?.palette;
  const src = useNameplateSrc(url, client);
  const rgb = nameplatePaletteRgb(palette);

  if (!nameplate || !url) {
    return <IdentificationBadgeIcon size={24} style={{ color: vars.color.textMuted }} />;
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: 'inherit',
        overflow: 'hidden',
        background: `linear-gradient(90deg, rgba(${rgb}, 0.25) 0%, rgba(${rgb}, 0.6) 100%), rgba(0, 0, 0, 0.25)`,
      }}
    >
      {src && (
        <img
          src={src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          draggable={false}
        />
      )}
    </div>
  );
}

interface FrameOptionProps {
  id: string | null;
  label: string;
  category: string;
  isSelected: boolean;
  isCustomUpload?: boolean;
  client: MatrixClient | null;
  onSelect: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

function FrameOptionItem({
  id,
  label,
  category,
  isSelected,
  isCustomUpload,
  client,
  onSelect,
  onDelete,
}: FrameOptionProps) {
  const { t } = useTranslation();
  const [viewRef, inView] = useInView<HTMLDivElement>();
  const isMxc = !!id && id.startsWith('mxc://');
  const { src: blobSrc } = useMediaBlobUrl(client, isMxc ? id : null, {
    enabled: inView,
    queue: true,
  });
  const builtin = getBuiltinFrame(id);
  const src = builtin ? builtinFramePreviewSrc(builtin) : blobSrc;

  return (
    <div ref={viewRef} className={css.decorationOptionWrap}>
      <button
        type="button"
        className={css.frameOption}
        aria-pressed={isSelected}
        onClick={onSelect}
        title={label}
      >
        <div className={css.frameOptionThumb}>
          {src ? (
            <img
              src={src}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              draggable={false}
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <FrameCornersIcon size={32} style={{ color: vars.color.textMuted }} />
          )}
        </div>
        <span className={css.effectOptionTitle}>{label}</span>
        <span className={css.effectOptionCategory}>{category}</span>
      </button>
      {isCustomUpload && id && onDelete && (
        <button
          type="button"
          className={css.deleteCustomBtn}
          title={t('profile.cosmetics.deleteCustom')}
          onClick={onDelete}
        >
          <TrashIcon size={11} />
        </button>
      )}
    </div>
  );
}

function FrameCosmeticThumb({
  frame,
  client,
}: {
  frame: ProfileFrameId | null;
  client: MatrixClient | null;
}) {
  const url = typeof frame === 'object' && frame !== null ? frame.url : (frame ?? null);
  const isMxc = !!url && url.startsWith('mxc://');
  const { src: blobSrc } = useMediaBlobUrl(client, isMxc ? url : null, { queue: true });
  const builtin = getBuiltinFrame(url);
  const src = builtin ? builtinFramePreviewSrc(builtin) : blobSrc;

  if (!frame || !url) {
    return <FrameCornersIcon size={24} style={{ color: vars.color.textMuted }} />;
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {src && (
        <img
          src={src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          draggable={false}
        />
      )}
    </div>
  );
}

/**
 * Account settings for profile personalization: custom status, accent colour, avatar decoration
 * and profile effect, with a real-time Discord-style preview window. The Mudrix-user badge is
 * not configurable here - it's set automatically by useEnsureMudrixUserFlag.
 */
/** The switch of a badge that can be turned off; a hook per badge, so it lives in its own component. */
function BadgeSwitch({
  badge,
}: {
  badge: BadgeDefinition & { atom: NonNullable<BadgeDefinition['atom']> };
}) {
  const { t } = useTranslation();
  const [on, setOn] = useAtom(badge.atom);
  return <Toggle checked={on} onChange={setOn} ariaLabel={t(badge.labelKey)} />;
}

/** One badge in the Badges list: what it looks like, what it is, and how to turn it off. */
function BadgeItem({ badge }: { badge: BadgeDefinition }) {
  const { t } = useTranslation();
  const { Icon, atom } = badge;
  return (
    <div className={css.badgeItem}>
      <span className={css.badgeIcon}>
        <Icon />
      </span>
      <span className={css.badgeText}>
        <span className={css.badgeTitle}>{t(badge.labelKey)}</span>
        <span className={css.badgeHint}>{t(badge.hintKey)}</span>
      </span>
      {atom ? (
        <BadgeSwitch badge={{ ...badge, atom }} />
      ) : (
        <span className={css.badgeAuto}>{t('profile.badges.automatic')}</span>
      )}
    </div>
  );
}

export function ProfileStyle() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const toast = useToast();
  const { supported, loading: supportLoading } = useExtendedProfileSupport(client);
  const myId = client?.userId() ?? null;
  const { data: fields } = useExtendedProfile(client, myId);
  const { profile: ownProfile } = useProfile(client);
  const { data: bannerSrc } = useUserBannerBlob(client, fields?.bannerMxc);
  const { saveFields, busy } = useExtendedProfileMutations(client);
  const status = useActiveStatus(fields?.status);

  const [statusOpen, setStatusOpen] = useState(false);
  const [accent, setAccent] = useState('');
  const [decoration, setDecoration] = useState<AvatarDecorationId | null>(null);
  const [effect, setEffect] = useState<ProfileEffectId | null>(null);
  const [nameplate, setNameplate] = useState<NameplateId | null>(null);
  const [profileFrame, setProfileFrame] = useState<ProfileFrameId | null>(null);

  // Modals for choosing cosmetics
  const [decorationModalOpen, setDecorationModalOpen] = useState(false);
  const [effectModalOpen, setEffectModalOpen] = useState(false);
  const [nameplateModalOpen, setNameplateModalOpen] = useState(false);
  const [frameModalOpen, setFrameModalOpen] = useState(false);

  // Filter state for decoration modal
  const [decorationSearch, setDecorationSearch] = useState('');
  const [decorationCategory, setDecorationCategory] = useState('all');

  // Filter state for effect modal
  const [effectSearch, setEffectSearch] = useState('');
  const [effectCategory, setEffectCategory] = useState('all');

  // Filter state for nameplate modal
  const [nameplateSearch, setNameplateSearch] = useState('');
  const [nameplateCategory, setNameplateCategory] = useState('all');

  // Filter state for frame modal
  const [frameSearch, setFrameSearch] = useState('');
  const [frameCategory, setFrameCategory] = useState('all');

  const decorationPacks = useDecorationPacks(client);
  const effectPacks = useEffectPacks(client);
  const nameplatePacks = useNameplatePacks(client);
  const framePacks = useProfileFramePacks(client);
  const favoritePacks = useFavoritePacks(client);
  const decoActions = useCosmeticActions({
    client,
    uploadFn: uploadUserDecoration,
    deleteFn: deleteUserDecoration,
    current: decoration,
    onSelect: setDecoration,
    maxSizeMb: 10,
    uploadedToast: (name) => t('profile.cosmetics.uploadedDecoration', { name }),
    deletedToast: t('profile.cosmetics.decorationDeleted'),
  });

  const effectActions = useCosmeticActions({
    client,
    uploadFn: uploadUserEffect,
    deleteFn: deleteUserEffect,
    current: effect,
    onSelect: setEffect,
    maxSizeMb: 15,
    uploadedToast: (name) => t('profile.cosmetics.uploadedEffect', { name }),
    deletedToast: t('profile.cosmetics.effectDeleted'),
  });

  const nameplateActions = useCosmeticActions({
    client,
    uploadFn: uploadUserNameplate,
    deleteFn: deleteUserNameplate,
    current: nameplate,
    onSelect: setNameplate,
    maxSizeMb: 10,
    uploadedToast: (name) =>
      t('profile.cosmetics.uploadedNameplate', {
        defaultValue: 'Uploaded nameplate {{name}}',
        name,
      }),
  });

  const frameActions = useCosmeticActions({
    client,
    uploadFn: uploadUserProfileFrame,
    deleteFn: deleteUserProfileFrame,
    current: profileFrame,
    onSelect: setProfileFrame,
    maxSizeMb: 15,
    uploadedToast: (name) =>
      t('profile.cosmetics.uploadedFrame', {
        defaultValue: 'Uploaded profile frame {{name}}',
        name,
      }),
  });

  const customDecorationsMap = useMemo(() => {
    const map = new Map<string, DecorationPackImage>();
    for (const group of decorationPacks) {
      for (const item of group.decorations) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [decorationPacks]);

  const customEffectsMap = useMemo(() => {
    const map = new Map<string, EffectPackImage>();
    for (const group of effectPacks) {
      for (const item of group.effects) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [effectPacks]);

  const customNameplatesMap = useMemo(() => {
    const map = new Map<string, NameplatePackImage>();
    for (const group of nameplatePacks) {
      for (const item of group.nameplates) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [nameplatePacks]);

  const customFramesMap = useMemo(() => {
    const map = new Map<string, ProfileFramePackImage>();
    for (const group of framePacks) {
      for (const item of group.frames) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [framePacks]);

  const myUploadsLabel = t('profile.cosmetics.myUploads');

  const decorationCategories = useMemo(
    () =>
      buildCosmeticCategories(
        decorationPacks,
        myUploadsLabel,
        t('profile.cosmetics.allCategories'),
        t('profile.cosmetics.builtin')
      ),
    [decorationPacks, myUploadsLabel, t]
  );

  const effectCategories = useMemo(
    () =>
      buildCosmeticCategories(
        effectPacks,
        myUploadsLabel,
        t('profile.cosmetics.allCategories'),
        t('profile.cosmetics.builtinParticles')
      ),
    [effectPacks, myUploadsLabel, t]
  );

  const nameplateCategories = useMemo(
    () =>
      buildCosmeticCategories(
        nameplatePacks,
        myUploadsLabel,
        t('profile.cosmetics.allCategories'),
        t('profile.cosmetics.builtin')
      ),
    [nameplatePacks, myUploadsLabel, t]
  );

  const frameCategories = useMemo(
    () =>
      buildCosmeticCategories(
        framePacks,
        myUploadsLabel,
        t('profile.cosmetics.allCategories'),
        t('profile.cosmetics.builtin')
      ),
    [framePacks, myUploadsLabel, t]
  );

  // The current selection may come from a pack the user has since unsubscribed from. Keep it
  // visible (and selectable) instead of silently dropping it from the picker.
  const orphanDecoration = useMemo(() => {
    if (!client || !decoration || !decoration.startsWith('mxc://')) return null;
    if (customDecorationsMap.has(decoration)) return null;
    const ref = lookupPackImage(client, decoration);
    return { id: decoration, name: ref?.name ?? null, packName: ref?.packName ?? null };
  }, [client, decoration, customDecorationsMap]);

  const orphanEffect = useMemo(() => {
    if (!client || !effect || !effect.startsWith('mxc://')) return null;
    if (customEffectsMap.has(effect)) return null;
    const ref = lookupPackImage(client, effect);
    return { id: effect, name: ref?.name ?? null, packName: ref?.packName ?? null };
  }, [client, effect, customEffectsMap]);

  const getDecorationLabel = (id: string | null) => {
    if (!id) return t('profile.decoration.none');
    if (orphanDecoration && id === orphanDecoration.id) {
      return orphanDecoration.name ?? t('profile.cosmetics.unsubscribedPackItem');
    }
    const labelKey = DECORATION_LABEL_KEYS[id];
    if (labelKey) return t(labelKey);
    const custom = customDecorationsMap.get(id);
    if (custom) return custom.name;
    if (id.startsWith('mxc://')) return t('profile.cosmetics.customDecoration');
    return id;
  };

  const getEffectLabel = (id: string | null) => {
    if (!id) return t('profile.effect.none');
    const labelKey = BUILTIN_EFFECT_LABELS[id];
    if (labelKey) return t(labelKey);
    const custom = customEffectsMap.get(id);
    if (custom) return custom.name;
    if (orphanEffect && id === orphanEffect.id) {
      return orphanEffect.name ?? t('profile.cosmetics.unsubscribedPackItem');
    }
    if (id.startsWith('mxc://')) return t('profile.cosmetics.customEffect');
    return id;
  };

  const filteredDecorations = useMemo(() => {
    const query = decorationSearch.trim().toLowerCase();
    const result: (string | null)[] = [null]; // "None" option first
    if (orphanDecoration) result.push(orphanDecoration.id);

    // 1. Pack / custom decorations
    for (const group of decorationPacks) {
      if (decorationCategory !== 'all' && decorationCategory !== `pack:${group.category}`) {
        continue;
      }
      for (const item of group.decorations) {
        if (
          !query ||
          item.name.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          item.shortcode.toLowerCase().includes(query)
        ) {
          result.push(item.id);
        }
      }
    }

    // 2. Built-in decorations
    if (decorationCategory === 'all' || decorationCategory === 'builtin') {
      for (const id of BUILTIN_DECORATION_IDS) {
        const labelKey = DECORATION_LABEL_KEYS[id];
        const label = labelKey ? t(labelKey) : id;
        if (!query || label.toLowerCase().includes(query) || id.toLowerCase().includes(query)) {
          result.push(id);
        }
      }
    }

    return result;
  }, [decorationCategory, decorationSearch, decorationPacks, orphanDecoration, t]);

  const filteredEffects = useMemo(() => {
    const query = effectSearch.trim().toLowerCase();
    const result: (string | null)[] = [null]; // "None" option first
    if (orphanEffect) result.push(orphanEffect.id);

    // 1. Pack / custom effects
    for (const group of effectPacks) {
      if (effectCategory !== 'all' && effectCategory !== `pack:${group.category}`) {
        continue;
      }
      for (const item of group.effects) {
        if (
          !query ||
          item.name.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          item.shortcode.toLowerCase().includes(query)
        ) {
          result.push(item.id);
        }
      }
    }

    // 2. Built-in particles
    if (effectCategory === 'all' || effectCategory === 'builtin') {
      for (const id of BUILTIN_PROFILE_EFFECT_IDS) {
        const labelKey = BUILTIN_EFFECT_LABELS[id];
        const label = labelKey ? t(labelKey) : id;
        if (!query || label.toLowerCase().includes(query) || id.toLowerCase().includes(query)) {
          result.push(id);
        }
      }
    }

    return result;
  }, [effectCategory, effectSearch, effectPacks, orphanEffect, t]);

  const filteredNameplates = useMemo<Array<string | null>>(() => {
    const result: Array<string | null> = [null];
    const query = nameplateSearch.trim().toLowerCase();

    if (nameplateCategory === 'all' || nameplateCategory === 'builtin') {
      for (const item of BUILTIN_NAMEPLATES) {
        if (!query || item.name.toLowerCase().includes(query)) result.push(item.id);
      }
    }
    for (const group of nameplatePacks) {
      if (nameplateCategory !== 'all' && nameplateCategory !== `pack:${group.category}`) {
        continue;
      }
      for (const item of group.nameplates) {
        if (
          !query ||
          item.name.toLowerCase().includes(query) ||
          item.shortcode.toLowerCase().includes(query)
        ) {
          result.push(item.id);
        }
      }
    }
    return result;
  }, [nameplateCategory, nameplateSearch, nameplatePacks]);

  const filteredFrames = useMemo<Array<string | null>>(() => {
    const result: Array<string | null> = [null];
    const query = frameSearch.trim().toLowerCase();

    if (frameCategory === 'all' || frameCategory === 'builtin') {
      for (const item of BUILTIN_FRAMES) {
        if (!query || item.name.toLowerCase().includes(query)) result.push(item.id);
      }
    }
    for (const group of framePacks) {
      if (frameCategory !== 'all' && frameCategory !== `pack:${group.category}`) {
        continue;
      }
      for (const item of group.frames) {
        if (
          !query ||
          item.name.toLowerCase().includes(query) ||
          item.shortcode.toLowerCase().includes(query)
        ) {
          result.push(item.id);
        }
      }
    }
    return result;
  }, [frameCategory, frameSearch, framePacks]);

  const getNameplateLabel = (id: string | null) => {
    if (!id) return t('profile.nameplate.none', { defaultValue: 'None' });
    const builtin = getBuiltinNameplate(id);
    if (builtin) return builtin.name;
    const custom = customNameplatesMap.get(id);
    if (custom) return custom.name;
    return id.replace(/^mxc:\/\/[^/]+\//, '');
  };

  const getFrameLabel = (id: string | null) => {
    if (!id) return t('profile.frame.none', { defaultValue: 'None' });
    const builtin = getBuiltinFrame(id);
    if (builtin) return builtin.name;
    const custom = customFramesMap.get(id);
    if (custom) return custom.name;
    return id.replace(/^mxc:\/\/[^/]+\//, '');
  };

  useEffect(() => {
    if (!fields) return;
    setAccent(fields.accent ?? '');
    setDecoration(fields.avatarDecoration);
    setEffect(fields.profileEffect);
    setNameplate(fields.nameplate);
    setProfileFrame(fields.profileFrame);
  }, [fields]);

  if (!client) return null;

  const disabled = !supported || supportLoading;
  const accentHex = normalizeHex(accent);
  const accentInvalid = accent.trim() !== '' && !accentHex;
  const accentChanged = !!fields && !accentInvalid && accentHex !== fields.accent;
  const decorationChanged = !!fields && decoration !== fields.avatarDecoration;
  const effectChanged = !!fields && effect !== fields.profileEffect;
  const nameplateChanged =
    !!fields && JSON.stringify(nameplate) !== JSON.stringify(fields.nameplate);
  const frameChanged =
    !!fields && JSON.stringify(profileFrame) !== JSON.stringify(fields.profileFrame);
  const dirty =
    accentChanged || decorationChanged || effectChanged || nameplateChanged || frameChanged;

  const handleReset = () => {
    if (!fields) return;
    setAccent(fields.accent ?? '');
    setDecoration(fields.avatarDecoration);
    setEffect(fields.profileEffect);
    setNameplate(fields.nameplate);
    setProfileFrame(fields.profileFrame);
  };

  const handleSave = async () => {
    try {
      await saveFields({
        accent: accentChanged ? accentHex : undefined,
        avatarDecoration: decorationChanged ? decoration : undefined,
        profileEffect: effectChanged ? effect : undefined,
        nameplate: nameplateChanged ? nameplate : undefined,
        profileFrame: frameChanged ? profileFrame : undefined,
      });
      toast.success(t('settings.account.profileSaved'));
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  const handleSaveFavoritePacks = async (favorites: RoomPackSummary[]) => {
    if (!client) return;
    try {
      await saveFavoritePacks(client, favorites);
      toast.success(t('profile.cosmetics.packsUpdated'));
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  const ownAvatarMxc = ownProfile?.avatarUrl ?? null;
  const displayName =
    ownProfile?.displayName || (myId ? myId.split(':')[0].replace('@', '') : 'User');
  const localpart = myId ? myId.split(':')[0].replace('@', '') : 'user';

  const currentDecorationMeta = decoration ? customDecorationsMap.get(decoration) : null;
  const currentEffectMeta = effect ? customEffectsMap.get(effect) : null;
  const currentNameplateId =
    typeof nameplate === 'object' && nameplate !== null ? nameplate.url : (nameplate ?? null);
  const currentFrameId =
    typeof profileFrame === 'object' && profileFrame !== null
      ? profileFrame.url
      : (profileFrame ?? null);
  const currentNameplateMeta = currentNameplateId
    ? customNameplatesMap.get(currentNameplateId)
    : null;
  const currentFrameMeta = currentFrameId ? customFramesMap.get(currentFrameId) : null;

  return (
    <div className={css.group}>
      <h4 className={css.groupTitle} data-subsection={t('profile.cosmetics.title')}>
        {t('profile.cosmetics.title')}
        <span className={css.mudrixBadge}>{t('profile.cosmetics.mudrixOnly')}</span>
      </h4>
      <p className={css.note}>{t('profile.cosmetics.note')}</p>

      <div className={css.customizerLayout}>
        {/* Left Column: Customization Controls */}
        <div className={css.editorCol}>
          {/* Avatar Decoration Section */}
          <Field label={t('profile.decoration.title')}>
            <div className={css.cosmeticCard}>
              <div className={css.cosmeticHeader}>
                <div className={css.cosmeticThumbCircle}>
                  <DecoratedAvatar decoration={decoration} client={client}>
                    <Avatar
                      name={displayName}
                      mxcUrl={ownAvatarMxc}
                      client={client}
                      size="sm"
                      placeholder="logo"
                    />
                  </DecoratedAvatar>
                </div>
                <div className={css.cosmeticDetails}>
                  <span className={css.cosmeticName}>{getDecorationLabel(decoration)}</span>
                  <span className={css.cosmeticMeta}>
                    {currentDecorationMeta?.category ??
                      (decoration
                        ? t('profile.cosmetics.builtin')
                        : t('profile.cosmetics.noneSelected'))}
                  </span>
                </div>
              </div>
              <div className={css.cosmeticActions}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => setDecorationModalOpen(true)}
                >
                  <UserCircleIcon size={16} className={settingsCss.iconBefore} />
                  {t('profile.decoration.changeDecoration')}
                </Button>
                {decoration && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => setDecoration(null)}
                  >
                    {t('common.remove')}
                  </Button>
                )}
              </div>
            </div>
          </Field>

          {/* Nameplate Section */}
          <Field label={t('profile.nameplate.title', { defaultValue: 'Nameplates' })}>
            <div className={css.cosmeticCard}>
              <div className={css.cosmeticHeader}>
                <div className={css.cosmeticThumbSquare}>
                  <NameplateCosmeticThumb nameplate={nameplate} client={client} />
                </div>
                <div className={css.cosmeticDetails}>
                  <span className={css.cosmeticName}>{getNameplateLabel(currentNameplateId)}</span>
                  <span className={css.cosmeticMeta}>
                    {nameplate
                      ? (currentNameplateMeta?.category ??
                        (getBuiltinNameplate(currentNameplateId)
                          ? t('profile.cosmetics.builtin')
                          : null) ??
                        t('profile.cosmetics.selected', { defaultValue: 'Selected' }))
                      : t('profile.cosmetics.noneSelected')}
                  </span>
                </div>
              </div>
              <div className={css.cosmeticActions}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => setNameplateModalOpen(true)}
                >
                  <IdentificationBadgeIcon size={16} className={settingsCss.iconBefore} />
                  {t('profile.nameplate.change', { defaultValue: 'Change Nameplate' })}
                </Button>
                {nameplate && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => setNameplate(null)}
                  >
                    {t('common.remove')}
                  </Button>
                )}
              </div>
            </div>
          </Field>

          {/* Profile Effect Section */}
          <Field label={t('profile.effect.title')}>
            <div className={css.cosmeticCard}>
              <div className={css.cosmeticHeader}>
                <div className={css.cosmeticThumbSquare}>
                  <EffectCosmeticThumb effect={effect} client={client} />
                </div>
                <div className={css.cosmeticDetails}>
                  <span className={css.cosmeticName}>{getEffectLabel(effect)}</span>
                  <span className={css.cosmeticMeta}>
                    {currentEffectMeta?.category ??
                      (effect
                        ? t('profile.cosmetics.builtinParticle')
                        : t('profile.cosmetics.noneSelected'))}
                  </span>
                </div>
              </div>
              <div className={css.cosmeticActions}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => setEffectModalOpen(true)}
                >
                  <SparkleIcon size={16} className={settingsCss.iconBefore} />
                  {t('profile.effect.changeEffect')}
                </Button>
                {effect && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => setEffect(null)}
                  >
                    {t('common.remove')}
                  </Button>
                )}
              </div>
            </div>
          </Field>

          {/* Profile Frame Section */}
          <Field label={t('profile.frame.title', { defaultValue: 'Profile Frames' })}>
            <div className={css.cosmeticCard}>
              <div className={css.cosmeticHeader}>
                <div className={css.cosmeticThumbSquare}>
                  <FrameCosmeticThumb frame={profileFrame} client={client} />
                </div>
                <div className={css.cosmeticDetails}>
                  <span className={css.cosmeticName}>{getFrameLabel(currentFrameId)}</span>
                  <span className={css.cosmeticMeta}>
                    {profileFrame
                      ? (currentFrameMeta?.category ??
                        (getBuiltinFrame(currentFrameId) ? t('profile.cosmetics.builtin') : null) ??
                        t('profile.cosmetics.selected', { defaultValue: 'Selected' }))
                      : t('profile.cosmetics.noneSelected')}
                  </span>
                </div>
              </div>
              <div className={css.cosmeticActions}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => setFrameModalOpen(true)}
                >
                  <FrameCornersIcon size={16} className={settingsCss.iconBefore} />
                  {t('profile.frame.change', { defaultValue: 'Change Profile Frame' })}
                </Button>
                {profileFrame && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => setProfileFrame(null)}
                  >
                    {t('common.remove')}
                  </Button>
                )}
              </div>
            </div>
          </Field>

          {/* Status Section */}
          <Field label={t('profile.status.title')} hint={t('profile.status.settingsHint')}>
            <div className={css.statusRow}>
              {status && (status.emoji || status.text) ? (
                <StatusPill status={status} />
              ) : (
                <span className={css.note}>{t('profile.status.none')}</span>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => setStatusOpen(true)}
              >
                <SmileyIcon size={14} className={settingsCss.iconBefore} />
                {status ? t('profile.status.edit') : t('profile.status.set')}
              </Button>
            </div>
          </Field>
          <CustomStatusModal open={statusOpen} onClose={() => setStatusOpen(false)} />

          {/* Accent Color Section */}
          <Field
            label={t('profile.accent.title')}
            hint={t('profile.accent.hint')}
            error={accentInvalid ? t('profile.accent.invalid') : undefined}
          >
            <div className={css.swatches}>
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={css.swatch}
                  style={{ backgroundColor: preset }}
                  aria-pressed={accentHex === preset}
                  aria-label={preset}
                  disabled={disabled}
                  onClick={() => setAccent(preset)}
                />
              ))}
            </div>
            <div className={css.colorInputRow}>
              <input
                type="color"
                className={css.colorInput}
                value={accentHex ?? DEFAULT_PICKER_COLOR}
                onChange={(e) => setAccent(e.target.value)}
                disabled={disabled}
                aria-label={t('profile.accent.title')}
              />
              <Input
                className={css.hexInput}
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                placeholder="#5865f2"
                maxLength={7}
                spellCheck={false}
                disabled={disabled}
                aria-label={t('profile.accent.hex')}
              />
              {accentHex && (
                <span
                  className={css.accentPreview}
                  style={{ backgroundColor: accentHex, color: readableTextColor(accentHex) }}
                >
                  {t('profile.accent.preview')}
                </span>
              )}
              {accent !== '' && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => setAccent('')}
                >
                  {t('profile.accent.reset')}
                </Button>
              )}
            </div>
          </Field>

          {/* Badge: automatic, not a picker - see useEnsureMudrixUserFlag */}
          <Field label={t('profile.badges.title')}>
            <div className={css.badgeList}>
              {PROFILE_BADGES.map((badge) => (
                <BadgeItem key={badge.id} badge={badge} />
              ))}
            </div>
          </Field>
        </div>

        {/* Right Column: Live Interactive Profile Preview Window */}
        <div className={css.previewCol}>
          <h4 className={css.previewHeading}>{t('profile.cosmetics.preview')}</h4>
          <div
            className={css.previewCard}
            style={
              {
                ...(accentHex
                  ? {
                      '--card-accent': accentHex,
                      borderColor: `color-mix(in srgb, var(--card-accent) 70%, ${vars.color.border})`,
                    }
                  : {}),
                ...(profileFrame
                  ? { marginTop: '36px', marginBottom: '32px', minHeight: '340px' }
                  : { minHeight: '340px' }),
              } as React.CSSProperties
            }
          >
            {/* Banner */}
            <div className={css.previewBannerWrap}>
              {bannerSrc ? (
                <img src={bannerSrc} alt="" className={css.previewBanner} />
              ) : (
                <div
                  className={css.previewBannerFallback}
                  style={{ background: accentHex ? accentGradient(accentHex) : '#5865f2' }}
                />
              )}
              {accentHex && <div className={cardCss.coverTint} />}
            </div>

            {/* Avatar with selected decoration */}
            <div className={css.previewAvatarRow}>
              <DecoratedAvatar decoration={decoration} client={client}>
                <div className={css.previewAvatarWrap}>
                  <Avatar
                    name={displayName}
                    mxcUrl={ownAvatarMxc}
                    client={client}
                    size="xl"
                    placeholder="logo"
                  />
                </div>
              </DecoratedAvatar>
            </div>

            {/* Inset Body */}
            <div className={css.previewBody}>
              <NameplateWrapper nameplate={nameplate} client={client}>
                <span className={css.previewDisplayName}>{displayName}</span>
              </NameplateWrapper>
              <span className={css.previewUserId}>@{localpart}</span>
              {fields && fields.pronouns && fields.pronouns.length > 0 && (
                <span className={css.previewPronouns}>{formatPronouns(fields.pronouns)}</span>
              )}
              {status && (status.emoji || status.text) && (
                <div style={{ marginTop: '6px', marginBottom: '2px' }}>
                  <StatusPill status={status} />
                </div>
              )}
              {myId && (
                <ProfileBadges
                  userId={myId}
                  showMudrix={!!fields?.isMudrixUser}
                  floating
                  style={{ top: 12, right: 14 }}
                />
              )}

              <div className={css.previewDivider} />

              <span className={css.previewSectionHeader}>{t('profile.cosmetics.aboutMe')}</span>
              <span className={css.previewBio}>
                {fields?.bio || t('profile.cosmetics.bioPlaceholder')}
              </span>
            </div>

            {/* Selected Profile Effect active animation */}
            {effect && <ProfileEffect effect={effect} />}
            {/* Selected Profile Frame */}
            {profileFrame && <ProfileFrame frame={profileFrame} client={client} />}
          </div>
        </div>
      </div>

      {/* Floating Save Notice Bar */}
      {dirty && (
        <div className={css.floatingSaveBar}>
          <span className={css.floatingSaveText}>{t('profile.cosmetics.unsavedChanges')}</span>
          <div className={css.floatingSaveActions}>
            <Button variant="secondary" size="sm" disabled={disabled || busy} onClick={handleReset}>
              <ArrowCounterClockwiseIcon size={14} className={settingsCss.iconBefore} />
              {t('profile.cosmetics.resetChanges')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={disabled || accentInvalid}
              loading={busy}
              onClick={handleSave}
            >
              {t('profile.cosmetics.saveChanges')}
            </Button>
          </div>
        </div>
      )}

      {/* Avatar Decoration Chooser Modal */}
      <CosmeticChooserModal
        open={decorationModalOpen}
        onClose={() => setDecorationModalOpen(false)}
        title={t('profile.decoration.chooseTitle')}
        titleIcon={<UserCircleIcon size={20} />}
        search={decorationSearch}
        onSearchChange={setDecorationSearch}
        searchPlaceholder={t('profile.decoration.searchPlaceholder')}
        category={decorationCategory}
        onCategoryChange={setDecorationCategory}
        categories={decorationCategories}
        countLabel={t('profile.cosmetics.decorationsCount', {
          count: filteredDecorations.length - 1,
        })}
        fileInputRef={decoActions.fileInputRef}
        onUploadFile={decoActions.handleUpload}
        uploading={decoActions.uploading}
        uploadButtonLabel={t('profile.decoration.uploadDecoration')}
        client={client}
        favoritePacks={favoritePacks}
        onSaveFavoritePacks={handleSaveFavoritePacks}
        kind="decoration"
        hasOrphan={!!orphanDecoration}
        gridClassName={css.decorationGrid}
      >
        {filteredDecorations.map((id) => {
          const label = getDecorationLabel(id);
          const isSelected = decoration === id;
          const customMeta = id ? customDecorationsMap.get(id) : null;
          const isCustomUpload = customMeta?.isCustom;

          return (
            <DecorationOptionItem
              key={id ?? 'none'}
              id={id}
              label={label}
              isSelected={isSelected}
              isCustomUpload={isCustomUpload}
              hint={
                orphanDecoration && id === orphanDecoration.id
                  ? t('profile.cosmetics.unsubscribedHint', {
                      pack: orphanDecoration.packName ?? '',
                    })
                  : undefined
              }
              client={client}
              onSelect={() => setDecoration(id)}
              onDelete={isCustomUpload && id ? (e) => decoActions.handleDelete(id, e) : undefined}
            />
          );
        })}
      </CosmeticChooserModal>

      {/* Profile Effect Chooser Modal */}
      <CosmeticChooserModal
        open={effectModalOpen}
        onClose={() => setEffectModalOpen(false)}
        title={t('profile.effect.chooseTitle')}
        titleIcon={<SparkleIcon size={20} />}
        search={effectSearch}
        onSearchChange={setEffectSearch}
        searchPlaceholder={t('profile.effect.searchPlaceholder')}
        category={effectCategory}
        onCategoryChange={setEffectCategory}
        categories={effectCategories}
        countLabel={t('profile.cosmetics.effectsCount', { count: filteredEffects.length - 1 })}
        fileInputRef={effectActions.fileInputRef}
        onUploadFile={effectActions.handleUpload}
        uploading={effectActions.uploading}
        uploadButtonLabel={t('profile.effect.uploadEffectOrBorder')}
        client={client}
        favoritePacks={favoritePacks}
        onSaveFavoritePacks={handleSaveFavoritePacks}
        kind="effect"
        hasOrphan={!!orphanEffect}
        gridClassName={css.effectGrid}
      >
        {filteredEffects.map((id) => {
          const label = getEffectLabel(id);
          const isSelected = effect === id;
          const customMeta = id ? customEffectsMap.get(id) : null;
          const isCustomUpload = customMeta?.isCustom;
          const category =
            customMeta?.category ??
            (id ? t('profile.cosmetics.builtinParticle') : t('profile.effect.none'));

          return (
            <EffectOptionItem
              key={id ?? 'none'}
              id={id}
              label={label}
              category={category}
              isSelected={isSelected}
              isCustomUpload={isCustomUpload}
              hint={
                orphanEffect && id === orphanEffect.id
                  ? t('profile.cosmetics.unsubscribedHint', {
                      pack: orphanEffect.packName ?? '',
                    })
                  : undefined
              }
              client={client}
              onSelect={() => setEffect(id)}
              onDelete={isCustomUpload && id ? (e) => effectActions.handleDelete(id, e) : undefined}
            />
          );
        })}
      </CosmeticChooserModal>

      {/* Nameplate Chooser Modal */}
      <CosmeticChooserModal
        open={nameplateModalOpen}
        onClose={() => setNameplateModalOpen(false)}
        title={t('profile.nameplate.chooseTitle', { defaultValue: 'Choose Nameplate' })}
        titleIcon={<IdentificationBadgeIcon size={20} />}
        search={nameplateSearch}
        onSearchChange={setNameplateSearch}
        searchPlaceholder={t('profile.nameplate.searchPlaceholder', {
          defaultValue: 'Search nameplates...',
        })}
        category={nameplateCategory}
        onCategoryChange={setNameplateCategory}
        categories={nameplateCategories}
        countLabel={t('profile.cosmetics.nameplatesCount', {
          defaultValue: '{{count}} nameplates',
          count: filteredNameplates.length - 1,
        })}
        fileInputRef={nameplateActions.fileInputRef}
        onUploadFile={nameplateActions.handleUpload}
        uploading={nameplateActions.uploading}
        uploadButtonLabel={t('profile.nameplate.upload', { defaultValue: 'Upload Nameplate' })}
        client={client}
        favoritePacks={favoritePacks}
        onSaveFavoritePacks={handleSaveFavoritePacks}
        kind="nameplate"
        gridClassName={css.nameplateGrid}
      >
        {filteredNameplates.map((id) => {
          const label = getNameplateLabel(id);
          const isSelected =
            (typeof nameplate === 'object' && nameplate !== null ? nameplate.url : nameplate) ===
            id;
          const customMeta = id ? customNameplatesMap.get(id) : null;
          const isCustomUpload = customMeta?.isCustom;
          const builtinPlate = getBuiltinNameplate(id);
          const category =
            customMeta?.category ??
            (builtinPlate
              ? t('profile.cosmetics.builtin')
              : id
                ? 'Catalog'
                : t('profile.nameplate.none', { defaultValue: 'None' }));
          const palette = customMeta?.palette ?? builtinPlate?.palette;

          return (
            <NameplateOptionItem
              key={id ?? 'none'}
              id={id}
              label={label}
              category={category}
              palette={palette}
              isSelected={isSelected}
              isCustomUpload={isCustomUpload}
              client={client}
              onSelect={() =>
                setNameplate(id ? (palette && !builtinPlate ? { url: id, palette } : id) : null)
              }
              onDelete={
                isCustomUpload && id ? (e) => nameplateActions.handleDelete(id, e) : undefined
              }
            />
          );
        })}
      </CosmeticChooserModal>

      {/* Profile Frame Chooser Modal */}
      <CosmeticChooserModal
        open={frameModalOpen}
        onClose={() => setFrameModalOpen(false)}
        title={t('profile.frame.chooseTitle', { defaultValue: 'Choose Profile Frame' })}
        titleIcon={<FrameCornersIcon size={20} />}
        search={frameSearch}
        onSearchChange={setFrameSearch}
        searchPlaceholder={t('profile.frame.searchPlaceholder', {
          defaultValue: 'Search profile frames...',
        })}
        category={frameCategory}
        onCategoryChange={setFrameCategory}
        categories={frameCategories}
        countLabel={t('profile.cosmetics.framesCount', {
          defaultValue: '{{count}} frames',
          count: filteredFrames.length - 1,
        })}
        fileInputRef={frameActions.fileInputRef}
        onUploadFile={frameActions.handleUpload}
        uploading={frameActions.uploading}
        uploadButtonLabel={t('profile.frame.upload', { defaultValue: 'Upload Profile Frame' })}
        client={client}
        favoritePacks={favoritePacks}
        onSaveFavoritePacks={handleSaveFavoritePacks}
        kind="profile_frame"
        gridClassName={css.frameGrid}
      >
        {filteredFrames.map((id) => {
          const label = getFrameLabel(id);
          const isSelected =
            (typeof profileFrame === 'object' && profileFrame !== null
              ? profileFrame.url
              : profileFrame) === id;
          const customMeta = id ? customFramesMap.get(id) : null;
          const isCustomUpload = customMeta?.isCustom;
          const category =
            customMeta?.category ??
            (getBuiltinFrame(id)
              ? t('profile.cosmetics.builtin')
              : id
                ? 'Catalog'
                : t('profile.frame.none', { defaultValue: 'None' }));

          return (
            <FrameOptionItem
              key={id ?? 'none'}
              id={id}
              label={label}
              category={category}
              isSelected={isSelected}
              isCustomUpload={isCustomUpload}
              client={client}
              onSelect={() =>
                setProfileFrame(
                  id
                    ? customMeta?.pieces && customMeta.pieces.length > 0
                      ? { url: id, pieces: customMeta.pieces }
                      : id
                    : null
                )
              }
              onDelete={isCustomUpload && id ? (e) => frameActions.handleDelete(id, e) : undefined}
            />
          );
        })}
      </CosmeticChooserModal>
    </div>
  );
}
