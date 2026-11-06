import { useTranslation } from 'react-i18next';
import { SealCheckIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { Tooltip } from '@/app/components/Tooltip';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useMediaBlobUrl } from '@/app/components/Avatar/useMediaBlobUrl';
import {
  avatarDecorationSrc,
  nameplatePaletteRgb,
  type AvatarDecorationId,
  type NameplateId,
} from '@/util/profileCosmetics';
import { builtinNameplateSrc, getBuiltinNameplate } from '@/util/builtinCosmetics';
import { useRestartingSrc } from './useRestartingSrc';
import * as css from './ProfileCard.css';

/** Label of each built-in avatar decoration (i18n keys under `profile.decoration`). */
export const DECORATION_LABEL_KEYS: Record<string, string> = {
  ring: 'profile.decoration.ring',
  thorns: 'profile.decoration.thorns',
  sparkle: 'profile.decoration.sparkle',
  flame: 'profile.decoration.flame',
  'pixel-hearts': 'profile.decoration.pixelHearts',
  stars: 'profile.decoration.stars',
  halo: 'profile.decoration.halo',
  'cat-ears': 'profile.decoration.catEars',
  'bunny-ears': 'profile.decoration.bunnyEars',
  crown: 'profile.decoration.crown',
  'leaf-wreath': 'profile.decoration.leafWreath',
  'neon-ring': 'profile.decoration.neonRing',
  'glitch-ring': 'profile.decoration.glitchRing',
  'snowflake-ring': 'profile.decoration.snowflakeRing',
  'cherry-blossoms': 'profile.decoration.cherryBlossoms',
  'angel-wings': 'profile.decoration.angelWings',
  'devil-horns': 'profile.decoration.devilHorns',
  'claude-buddy': 'profile.decoration.claudeBuddy',
  headphones: 'profile.decoration.headphones',
  'rain-cloud': 'profile.decoration.rainCloud',
  butterflies: 'profile.decoration.butterflies',
  'orbiting-planets': 'profile.decoration.orbitingPlanets',
  'mud-splat': 'profile.decoration.mudSplat',
  'grasping-hands': 'profile.decoration.graspingHands',
  'corrupted-gaze': 'profile.decoration.corruptedGaze',
  'uncanny-alternate': 'profile.decoration.uncannyAlternate',
};

/**
 * The one real badge: set automatically (never user-picked) by any Mudrix client the account
 * has signed into, via useEnsureMudrixUserFlag.
 */
export function MudrixBadgeIcon() {
  const { t } = useTranslation();
  const label = t('profile.badge.mudrixUser');
  return (
    <Tooltip content={label}>
      <span className={css.badge} role="img" aria-label={label}>
        <SealCheckIcon size={14} color="#4ade80" weight="fill" />
      </span>
    </Tooltip>
  );
}

/**
 * The badges on a profile card (today only the automatic Mudrix-user one). `floating` pins the
 * row to the top-right of the nearest positioned ancestor (the card's name block).
 */
export function ProfileBadges({
  showMudrix,
  floating = false,
  style,
}: {
  showMudrix: boolean;
  floating?: boolean;
  style?: React.CSSProperties;
}) {
  if (!showMudrix) return null;
  return (
    <div className={floating ? `${css.badgeRow} ${css.badgeFloating}` : css.badgeRow} style={style}>
      <MudrixBadgeIcon />
    </div>
  );
}

/** Resolves a decoration to an image source; `mxc://` media is fetched with the session's login. */
export function useDecorationSrc(
  decoration: AvatarDecorationId | null | undefined,
  client?: MatrixClient | null
): string | undefined {
  const c = client ?? getMatrixClientOrNull();
  const isMxc = !!decoration && decoration.startsWith('mxc://');
  const { src: blobUrl } = useMediaBlobUrl(c, isMxc ? decoration : null);
  if (!decoration) return undefined;
  return isMxc ? blobUrl : avatarDecorationSrc(decoration);
}

/** Wraps an avatar and draws an avatar decoration around it. */
export function DecoratedAvatar({
  decoration,
  children,
  client,
}: {
  decoration: AvatarDecorationId | null;
  children: React.ReactNode;
  client?: MatrixClient | null;
}) {
  const src = useRestartingSrc(useDecorationSrc(decoration, client));
  if (!decoration) return <>{children}</>;
  return (
    <span className={css.decorated} style={{ display: 'inline-flex' }}>
      {children}
      {src && (
        <img
          className={css.decoration}
          src={src}
          alt=""
          aria-hidden="true"
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
      )}
    </span>
  );
}

/** A nameplate's image: a built-in by id, or `mxc://` media. Nothing else is ever loaded. */
export function useNameplateSrc(
  nameplate: NameplateId | null | undefined,
  client?: MatrixClient | null
): string | undefined {
  const c = client ?? getMatrixClientOrNull();
  const url =
    typeof nameplate === 'object' && nameplate !== null ? nameplate.url : (nameplate ?? null);
  const isMxc = !!url && url.startsWith('mxc://');
  const builtin = isMxc ? undefined : getBuiltinNameplate(url);
  const { src: blobUrl } = useMediaBlobUrl(c, isMxc ? url : null);
  if (builtin) return builtinNameplateSrc(builtin);
  return isMxc ? blobUrl : undefined;
}

/** A stored nameplate (object, `mxc://` string or built-in id) as its image source and palette. */
export function useResolvedNameplate(
  nameplate: NameplateId | null | undefined,
  client?: MatrixClient | null
): { src: string | undefined; palette?: string; active: boolean } {
  const c = client ?? getMatrixClientOrNull();
  const { url, palette } = ((): { url: string | null; palette?: string } => {
    if (!nameplate) return { url: null };
    if (typeof nameplate === 'object') return { url: nameplate.url, palette: nameplate.palette };
    const builtin = getBuiltinNameplate(nameplate);
    if (builtin) return { url: builtin.id, palette: builtin.palette };
    return { url: nameplate };
  })();
  const src = useNameplateSrc(url, c);
  return { src, palette, active: !!url };
}

export function NameplateWrapper({
  nameplate,
  children,
  client,
  className,
  style,
}: {
  nameplate: NameplateId | null | undefined;
  children: React.ReactNode;
  client?: MatrixClient | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { src: rawSrc, palette, active } = useResolvedNameplate(nameplate, client);
  const src = useRestartingSrc(rawSrc);
  if (!active) return <>{children}</>;
  const rgb = nameplatePaletteRgb(palette);
  return (
    <span
      className={[css.nameplateWrapper, className].filter(Boolean).join(' ')}
      style={{
        background: `linear-gradient(90deg, rgba(${rgb}, 0.2) 0%, rgba(${rgb}, 0.55) 100%), rgba(0, 0, 0, 0.25)`,
        ...style,
      }}
    >
      {src && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className={css.nameplateBg}
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
      )}
      <span className={css.nameplateContent}>{children}</span>
    </span>
  );
}
