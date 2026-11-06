import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { WarningIcon } from '@phosphor-icons/react';
import { autoplayGifsAtom } from '@/app/store/atoms';
import { animatedImageBadge, imageSkeleton, imageErrorFallback } from '../Timeline.css';
import { firstFrameToBlobUrl, mayBeAnimated } from '../utils/imageAnimation';

const stillCache = new Map<string, string>();
const MAX_STILL_CACHE = 500;

function cacheStill(key: string, url: string): void {
  const existing = stillCache.get(key);
  if (existing && existing !== url) {
    URL.revokeObjectURL(existing);
  }
  if (stillCache.size >= MAX_STILL_CACHE) {
    const lruKey = stillCache.keys().next().value;
    if (lruKey !== undefined) {
      const evicted = stillCache.get(lruKey);
      if (evicted) URL.revokeObjectURL(evicted);
      stillCache.delete(lruKey);
    }
  }
  stillCache.set(key, url);
}

interface AnimatedImageProps {
  src: string;
  alt?: string;
  mimeType?: string;
  isAnimated?: boolean;
  className?: string;
  wrapperClassName?: string;
  preferAutoplay?: boolean;
  alwaysStatic?: boolean;
  style?: CSSProperties;
  loading?: 'lazy' | 'eager';
  onClick?: () => void;
  onLoad?: (img: HTMLImageElement) => void;
  onError?: () => void;
  requestFullRes?: () => Promise<string | null>;
}

export function AnimatedImage({
  src,
  alt,
  mimeType,
  isAnimated,
  className,
  wrapperClassName,
  preferAutoplay = false,
  alwaysStatic = false,
  style,
  loading = 'lazy',
  onClick,
  onLoad,
  onError,
  requestFullRes,
}: AnimatedImageProps) {
  const autoplayGifs = useAtomValue(autoplayGifsAtom);
  const [stillUrl, setStillUrl] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const [animatedSrc, setAnimatedSrc] = useState<string | null>(null);
  const fetchedFullResRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setHasError(false);
  }, [src]);

  // Already-decoded images (cache hits) show at once instead of fading in.
  const handleImgRef = useCallback((el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
  }, []);

  const isAnimationCandidate = isAnimated === true || mayBeAnimated(mimeType);

  const staticMode = !preferAutoplay && !autoplayGifs;
  const wantsStill = (alwaysStatic || staticMode) && isAnimationCandidate;

  useEffect(() => {
    if (!wantsStill) {
      setStillUrl(null);
      return;
    }
    let cancelled = false;
    const cached = stillCache.get(src);
    if (cached) {
      setStillUrl(cached);
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      void firstFrameToBlobUrl(img, mimeType).then((url) => {
        if (cancelled || url === null) return;
        cacheStill(src, url);
        setStillUrl(url);
      });
      img.src = '';
    };
    img.src = src;
    return () => {
      cancelled = true;
      img.src = '';
    };
  }, [src, mimeType, wantsStill]);

  // For encrypted animated images, decrypt the full-res on first hover
  useEffect(() => {
    if (alwaysStatic || !hovering || !requestFullRes || fetchedFullResRef.current) return;
    fetchedFullResRef.current = true;
    let cancelled = false;
    void requestFullRes().then((url) => {
      if (!cancelled && url) setAnimatedSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [alwaysStatic, hovering, requestFullRes]);

  const effectiveSrc = animatedSrc ?? src;
  const showStill = wantsStill && !!stillUrl && (alwaysStatic || !hovering);
  const showBadge = !alwaysStatic && staticMode && isAnimationCandidate && !hovering;
  const skipAnimatedFallback = alwaysStatic && isAnimationCandidate && !stillUrl;

  return (
    <span
      className={wrapperClassName}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {!loaded && !hasError && <div className={imageSkeleton} aria-hidden="true" />}
      {!hasError && !skipAnimatedFallback && (
        <img
          ref={handleImgRef}
          src={showStill ? stillUrl : effectiveSrc}
          alt={alt}
          draggable={false}
          className={className}
          style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity 160ms ease-out' }}
          loading={loading}
          onClick={onClick}
          onLoad={(e) => {
            setLoaded(true);
            onLoad?.(e.currentTarget);
          }}
          onError={() => {
            setHasError(true);
            onError?.();
          }}
        />
      )}
      {hasError && (
        <div className={imageErrorFallback} role="img" aria-label={alt || 'Image failed to load'}>
          <WarningIcon size={24} />
        </div>
      )}
      {showBadge && loaded && !hasError && <span className={animatedImageBadge}>GIF</span>}
    </span>
  );
}
