import { useEffect, useState } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useMediaBlobUrl } from '@/app/components/Avatar/useMediaBlobUrl';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useExtendedProfile, useStatusLine } from '@/app/hooks/useExtendedProfile';
import {
  avatarDecorationSrc,
  nameplatePaletteRgb,
  type NameplateId,
  type ProfileStatus,
} from '@/util/profileCosmetics';
import { useResolvedNameplate } from './ProfileCosmetics';
import * as css from './ListCosmetics.css';

/** Decorations in lists are drawn from a small thumbnail (96px covers a 48px avatar at 2x). */
const STATIC_THUMB_SIZE = 96;

/**
 * Callback ref plus a flag that turns true the first time the element scrolls near the
 * viewport and stays true. Lists use it so profile requests are only made for rows that are
 * (or were) actually visible.
 */
export function useInViewOnce<T extends Element>(): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, seen]);
  return [setEl, seen];
}

/**
 * Decoration and active custom status for a list row. One react-query entry per user is shared
 * by every row (and the profile card) that shows them; nothing is requested until `enabled`.
 */
export function useListCosmetics(
  client: MatrixClient | null | undefined,
  userId: string | null | undefined,
  enabled: boolean,
  options?: { refetchInterval?: number }
): {
  decoration: string | null;
  nameplate: NameplateId | null;
  status: ProfileStatus | null;
  loaded: boolean;
} {
  const { data } = useExtendedProfile(client ?? null, enabled ? (userId ?? null) : null, options);
  const status = useStatusLine(data?.status, data?.activities);
  return {
    decoration: data?.avatarDecoration ?? null,
    nameplate: data?.nameplate ?? null,
    status,
    loaded: !!data,
  };
}

/**
 * Static image for a decoration id, for use in lists: built-in ids are static SVGs, mxc packs
 * are fetched as a server-rendered thumbnail (which is not animated).
 */
export function useStaticDecorationSrc(
  decoration: string | null | undefined,
  client?: MatrixClient | null
): string | undefined {
  const c = client ?? getMatrixClientOrNull();
  const isMxc = !!decoration && decoration.startsWith('mxc://');
  const { src: thumb } = useMediaBlobUrl(c, isMxc ? decoration : null, {
    width: STATIC_THUMB_SIZE,
    height: STATIC_THUMB_SIZE,
    resizeMethod: 'scale',
  });
  if (!decoration) return undefined;
  if (isMxc) return thumb;
  return avatarDecorationSrc(decoration);
}

/**
 * Decoration overlay for a small avatar. Render it as a child of the avatar's `position:
 * relative` wrapper; it is a no-op until a decoration resolves, and hides itself on load error.
 */
export function ListDecoration({
  decoration,
  client,
}: {
  decoration: string | null | undefined;
  client?: MatrixClient | null;
}) {
  const src = useStaticDecorationSrc(decoration, client);
  if (!decoration || !src) return null;
  return (
    <img
      className={css.listDecoration}
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading="lazy"
      onError={(e) => {
        (e.currentTarget as HTMLElement).style.display = 'none';
      }}
    />
  );
}

/** Wraps an avatar and overlays a static decoration around it. */
export function ListDecoratedAvatar({
  decoration,
  client,
  children,
}: {
  decoration: string | null | undefined;
  client?: MatrixClient | null;
  children: React.ReactNode;
}) {
  return (
    <span className={css.listDecorated}>
      {children}
      <ListDecoration decoration={decoration} client={client} />
    </span>
  );
}

/** Nameplate background for a list row; a no-op without a nameplate. */
export function ListNameplate({
  nameplate,
  client,
}: {
  nameplate: NameplateId | null | undefined;
  client?: MatrixClient | null;
}) {
  const { src, palette, active } = useResolvedNameplate(nameplate, client);
  if (!active) return null;
  const rgb = nameplatePaletteRgb(palette);
  return (
    <span
      className={css.listNameplate}
      aria-hidden="true"
      style={{
        background: `linear-gradient(90deg, rgba(${rgb}, 0.15) 0%, rgba(${rgb}, 0.5) 100%)`,
      }}
    >
      {src && (
        <img
          src={src}
          alt=""
          className={css.listNameplateImg}
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
      )}
    </span>
  );
}
