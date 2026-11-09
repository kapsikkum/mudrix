import { useMemo, useState, useCallback, useEffect } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { useMediaBlobUrl } from '@/app/components/Avatar/useMediaBlobUrl';
import { builtinFramePieces, getBuiltinFrame } from '@/util/builtinCosmetics';
import { useProfileFramePacks } from '@/app/hooks/useUserPacks';
import { type ProfileFrameId, type ProfileFramePiece } from '@/util/profileCosmetics';
import * as css from './ProfileCard.css';

interface ProfileFrameProps {
  frame: ProfileFrameId | null | undefined;
  client?: MatrixClient | null;
  /** Optionally render only the 'back' or 'front' layer if the caller places them separately. Defaults to rendering both. */
  layer?: 'back' | 'front' | 'both';
}

/** A piece plus, for built-in frames, the already-resolved static asset URL. */
type ResolvedPiece = ProfileFramePiece & { staticSrc?: string };

function FramePieceImg({
  piece,
  client,
  onDims,
}: {
  piece: ResolvedPiece;
  client: MatrixClient | null;
  onDims?: (dims: { width: number; height: number; pos: string }) => void;
}) {
  const isMxc = piece.url.startsWith('mxc://');
  const { src: blobUrl } = useMediaBlobUrl(client, isMxc ? piece.url : null, { queue: true });
  // Only mxc:// media or a built-in frame's own assets are ever loaded (a profile or pack must not
  // make clients fetch other hosts).
  const finalSrc = isMxc ? blobUrl : piece.staticSrc;

  if (!finalSrc) return null;

  const posClass =
    piece.pos === 'top'
      ? css.profileFramePieceTop
      : piece.pos === 'bottom'
        ? css.profileFramePieceBottom
        : css.profileFramePieceCenter;

  return (
    <img
      src={finalSrc}
      alt=""
      aria-hidden="true"
      className={`${css.profileFramePiece} ${posClass}`}
      draggable={false}
      onLoad={(e) => {
        const { naturalWidth, naturalHeight } = e.currentTarget;
        if (naturalWidth && naturalHeight && onDims) {
          onDims({ width: naturalWidth, height: naturalHeight, pos: piece.pos });
        }
      }}
      onError={(e) => {
        (e.currentTarget as HTMLElement).style.display = 'none';
      }}
    />
  );
}

export function ProfileFrame({ frame, client, layer = 'both' }: ProfileFrameProps) {
  const c = client ?? getMatrixClientOrNull();
  const packs = useProfileFramePacks(c);

  const resolvedPieces = useMemo<ResolvedPiece[]>(() => {
    if (!frame) return [];

    // 1. Direct pieces on object
    if (typeof frame === 'object' && frame !== null) {
      if (Array.isArray(frame.pieces) && frame.pieces.length > 0) {
        return frame.pieces;
      }
      if (frame.url) {
        return [{ layer: 'front', pos: 'center', url: frame.url }];
      }
      return [];
    }

    // 2. String frame id: look up in pack catalog
    if (typeof frame === 'string') {
      const builtin = getBuiltinFrame(frame);
      if (builtin) {
        return builtinFramePieces(builtin).map((p) => ({
          layer: p.layer,
          pos: p.pos,
          url: '',
          staticSrc: p.src,
        }));
      }
      for (const group of packs) {
        for (const item of group.frames) {
          if (item.id === frame || item.url === frame) {
            if (Array.isArray(item.pieces) && item.pieces.length > 0) {
              return item.pieces;
            }
            return [{ layer: 'front', pos: 'center', url: item.url }];
          }
        }
      }
      // Not in local pack catalog: treat the string url as a single center piece
      return [{ layer: 'front', pos: 'center', url: frame }];
    }

    return [];
  }, [frame, packs]);

  const frameKey = typeof frame === 'string' ? frame : frame?.url || '';
  const [dimsState, setDimsState] = useState<{
    overflowTop?: number;
    overflowBottom?: number;
    overflowHorizontal?: number;
  }>({});

  useEffect(() => {
    setDimsState({});
  }, [frameKey]);

  const handleDims = useCallback(
    ({ width, height, pos }: { width: number; height: number; pos: string }) => {
      setDimsState((prev) => {
        let changed = false;
        const next = { ...prev };
        // Discord formula: Math.round(Math.max(0, (width - 1200) / 2))
        const hOverflow = Math.round(Math.max(0, (width - 1200) / 2));
        if (hOverflow > 0 && next.overflowHorizontal !== hOverflow) {
          next.overflowHorizontal = hOverflow;
          changed = true;
        }
        if (pos === 'top') {
          // Discord formula: Math.max(0, height - 412)
          const topOverflow = Math.max(0, height - 412);
          if (next.overflowTop !== topOverflow) {
            next.overflowTop = topOverflow;
            changed = true;
          }
        } else if (pos === 'bottom') {
          // Discord formula: Math.max(0, height - 212)
          const bottomOverflow = Math.max(0, height - 212);
          if (next.overflowBottom !== bottomOverflow) {
            next.overflowBottom = bottomOverflow;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    []
  );

  if (resolvedPieces.length === 0) return null;

  const isCenterOnly = resolvedPieces.every((p) => p.pos === 'center');
  const backPieces = resolvedPieces.filter((p) => p.layer === 'back');
  const frontPieces = resolvedPieces.filter((p) => p.layer !== 'back');

  const renderBack = (layer === 'both' || layer === 'back') && backPieces.length > 0;
  const renderFront = (layer === 'both' || layer === 'front') && frontPieces.length > 0;

  const wrapperStyle = isCenterOnly
    ? ({
        '--custom-profile-frame-scaled-overflow-horizontal': '0px',
        '--custom-profile-frame-scaled-overflow-top': '0px',
        '--custom-profile-frame-scaled-overflow-bottom': '0px',
      } as React.CSSProperties)
    : dimsState.overflowHorizontal !== undefined ||
        dimsState.overflowTop !== undefined ||
        dimsState.overflowBottom !== undefined
      ? ({
          ...(dimsState.overflowHorizontal !== undefined
            ? {
                '--custom-profile-frame-scaled-overflow-horizontal': `calc(${dimsState.overflowHorizontal} * (100cqw / 1200))`,
              }
            : {}),
          ...(dimsState.overflowTop !== undefined
            ? {
                '--custom-profile-frame-scaled-overflow-top': `calc(${dimsState.overflowTop} * (100cqw / 1200))`,
              }
            : {}),
          ...(dimsState.overflowBottom !== undefined
            ? {
                '--custom-profile-frame-scaled-overflow-bottom': `calc(${dimsState.overflowBottom} * (100cqw / 1200))`,
              }
            : {}),
        } as React.CSSProperties)
      : undefined;

  return (
    <div className={css.profileFrameContainer} aria-hidden="true">
      <div className={css.profileFrameWrapper} style={wrapperStyle}>
        {renderBack && (
          <div className={css.profileFrameLayerBack}>
            {backPieces.map((p, idx) => (
              <FramePieceImg
                key={`back-${idx}-${p.staticSrc ?? p.url}`}
                piece={p}
                client={c}
                onDims={handleDims}
              />
            ))}
          </div>
        )}
        {renderFront && (
          <div className={css.profileFrameLayerFront}>
            {frontPieces.map((p, idx) => (
              <FramePieceImg
                key={`front-${idx}-${p.staticSrc ?? p.url}`}
                piece={p}
                client={c}
                onDims={handleDims}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
