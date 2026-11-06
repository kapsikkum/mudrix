import { useCallback, useEffect, useState } from 'react';
import type { WizardClient } from '@wizardchat/core';
import { useMediaBlobUrl } from '@/app/components/Avatar/useMediaBlobUrl';
import { presetCss, type SpaceBanner } from './spaceBanner';
import * as css from './SpaceBanner.css';

interface SpaceBannerViewProps {
  client: WizardClient | null | undefined;
  banner: SpaceBanner | null;
  className?: string;
}

/**
 * A space's banner: its image, or its gradient, or a neutral fill when it has none. An image
 * shows a shimmering skeleton until it has loaded (or failed), then fades in over it.
 */
export function SpaceBannerView({ client, banner, className }: SpaceBannerViewProps) {
  const gradient = presetCss(banner?.color);
  const mxcUrl = banner?.url;
  const { src } = useMediaBlobUrl(client, mxcUrl);

  const [settled, setSettled] = useState(false);
  // A different image starts over with its own skeleton.
  useEffect(() => setSettled(false), [src]);
  // An image that was cached has finished before React could listen for it.
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setSettled(true);
  }, []);

  return (
    <div
      className={[css.view, className].filter(Boolean).join(' ')}
      style={!mxcUrl && gradient ? { background: gradient } : undefined}
    >
      {mxcUrl ? (
        <>
          <div className={settled ? css.skeletonDone : css.skeleton} aria-hidden />
          {src ? (
            <img
              ref={imgRef}
              src={src}
              alt=""
              className={settled ? css.viewImageLoaded : css.viewImage}
              onLoad={() => setSettled(true)}
              onError={() => setSettled(true)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
