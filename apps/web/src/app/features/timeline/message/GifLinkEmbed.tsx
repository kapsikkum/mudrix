import { useEffect, useState, type ReactNode } from 'react';
import { AnimatedImage } from './AnimatedImage';
import {
  hasGifConsent,
  parseGifLink,
  resolveGifLink,
  type GifItem,
} from '../composer/gifProviders';
import * as css from '../Timeline.css';

interface GifLinkEmbedProps {
  /** The message text; only a body that is nothing but one GIPHY / KLIPY link becomes a GIF. */
  body: string;
  /** Shown instead while resolving, when it isn't a GIF link, or when the GIF can't be loaded. */
  children: ReactNode;
}

/**
 * Shows a bare GIPHY / KLIPY link as the GIF itself. The GIF is fetched from the provider's CDN,
 * so this only happens once the user has agreed to contact the GIF providers (the same consent
 * the picker asks for); until then the link stays a link.
 */
export function GifLinkEmbed({ body, children }: GifLinkEmbedProps) {
  const link = parseGifLink(body);
  const linkKey = link ? JSON.stringify(link) : null;
  const [item, setItem] = useState<GifItem | null>(null);
  const [failed, setFailed] = useState(false);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    setItem(null);
    setFailed(false);
    setMeasured(null);
    if (!link || !hasGifConsent(link.provider)) return undefined;
    const ctrl = new AbortController();
    resolveGifLink(link, ctrl.signal)
      .then((resolved) => {
        if (ctrl.signal.aborted) return;
        if (resolved) setItem(resolved);
        else setFailed(true);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `link` is derived from linkKey
  }, [linkKey]);

  if (!item || failed) return <>{children}</>;

  // Same box as a sent GIF image: sized from the GIF's own aspect ratio, scaled to the
  // 320x420 media maximum, with the same autoplay behaviour.
  const w = measured?.w ?? item.width;
  const h = measured?.h ?? item.height;
  const scale = w && h ? Math.min(320 / w, 420 / h, 1) : 1;
  const boxStyle =
    w && h
      ? { width: Math.round(w * scale), height: Math.round(h * scale) }
      : { width: 320, height: 200 };
  return (
    <div className={css.mediaBox} style={boxStyle}>
      <AnimatedImage
        src={item.thumbUrl}
        alt={item.title || 'GIF'}
        mimeType="image/gif"
        isAnimated
        className={css.mediaFill}
        wrapperClassName={css.mediaBoxFillWrap}
        onLoad={(img) => {
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            setMeasured({ w: img.naturalWidth, h: img.naturalHeight });
          }
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
