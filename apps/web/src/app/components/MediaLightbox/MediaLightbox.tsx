import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import {
  XIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  TrashIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/app/components/Avatar';
import { MediaSpoiler } from '@/app/features/timeline/message/MediaSpoiler';
import { DownloadLink } from '@/app/components/DownloadLink/DownloadLink';
import { useBackToClose } from '@/app/hooks/useBackToClose';
import { useLocalMediaMenu } from '@/app/features/contextMenu/LocalMediaMenu';
import * as css from './MediaLightbox.css';
import { useLightboxTouch } from './useLightboxTouch';

interface LightboxMedia {
  src: string | null;
  filename?: string;
  isSpoiler?: boolean;
  spoilerReason?: string;
  label?: string;
  revealed?: boolean;
}

interface MediaLightboxProps {
  src?: string;
  name?: string;
  filename?: string;
  client?: MatrixClient | null;
  avatarMxc?: string | null;
  type?: 'image' | 'video';
  initialTime?: number;
  onClose: () => void;
  onReplace?: () => void;
  onRemove?: () => void;
  items?: LightboxMedia[];
  itemIndex?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onRevealItem?: (index: number) => void;
  /** Gallery only: save every item at once. */
  onSaveAll?: () => void;
  saveAllBusy?: boolean;
}

const DEFAULT_ZOOM = 2.5;
const DRAG_THRESHOLD_PX = 4;

export function MediaLightbox({
  src,
  name,
  filename,
  client,
  avatarMxc,
  type = 'image',
  initialTime = 0,
  onClose,
  onReplace,
  onRemove,
  items,
  itemIndex = 0,
  onPrev,
  onNext,
  onRevealItem,
  onSaveAll,
  saveAllBusy = false,
}: MediaLightboxProps) {
  // Click the image to zoom in on the spot you clicked; drag to move around, scroll to change the
  // zoom, and click without dragging to zoom back out.
  const [zoomed, setZoomed] = useState(false);
  const [zoomFactor, setZoomFactor] = useState(DEFAULT_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const suppressClick = useRef(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(
    null
  );
  const [fitW, setFitW] = useState(0);
  const [fitH, setFitH] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasStartedPlayback = useRef(false);

  const isCarousel = items && items.length > 0;
  const curIndex = isCarousel
    ? Math.max(0, Math.min(itemIndex, (items as LightboxMedia[]).length - 1))
    : 0;
  const current = isCarousel ? (items as LightboxMedia[])[curIndex] : null;
  const curSrc = isCarousel ? (current?.src ?? '') : src;
  const curFilename = isCarousel ? (current?.filename ?? '') : (filename ?? '');

  useEffect(() => {
    setZoomed(false);
    setZoomFactor(DEFAULT_ZOOM);
    setFitW(0);
    setFitH(0);
  }, [curIndex, src]);

  useBackToClose(true, onClose);

  // On touch screens: pinch and double-tap to zoom, drag to pan, swipe down to dismiss (the picture
  // follows the finger and the black fades), swipe sideways between pictures, tap to hide the bars.
  const dragRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const showsImage =
    !!curSrc && type !== 'video' && !(isCarousel && current?.isSpoiler && !current.revealed);
  useLightboxTouch({
    enabled: true,
    layerRef: dragRef,
    wrapRef,
    imgRef,
    backdropRef,
    chromeRef,
    canZoom: showsImage,
    canSwipe: !!isCarousel && (items?.length ?? 0) > 1,
    resetKey: `${curIndex}:${src ?? ''}`,
    onTap: () => setChromeHidden((hidden) => !hidden),
    onClose,
    onPrev: () => onPrev?.(),
    onNext: () => onNext?.(),
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (isCarousel && e.key === 'ArrowLeft') onPrev?.();
      if (isCarousel && e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext, isCarousel]);

  const openLocalMediaMenu = useLocalMediaMenu();
  // Stops the message menu behind the viewer from opening; a right-click on the picture gets the app's own menu.
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openLocalMediaMenu(e.nativeEvent);
    },
    [openLocalMediaMenu]
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget && e.target !== dragRef.current) return;
      if (zoomed) setZoomed(false);
      else onClose();
    },
    [onClose, zoomed]
  );

  // Keeps the zoomed picture covering the window: an axis that still fits stays centred.
  const clampOffset = (x: number, y: number, w: number, h: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, x)),
      y: h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, y)),
    };
  };

  const handleImagePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (e.button !== 0) return;
    suppressClick.current = false;
    if (zoomed) {
      drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handleImagePointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!d.moved) setDragging(true);
    d.moved = true;
    suppressClick.current = true;
    setOffset(clampOffset(d.ox + dx, d.oy + dy, fitW * zoomFactor, fitH * zoomFactor));
  };

  const handleImagePointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    e.stopPropagation();
    if (zoomed) {
      // A drag ends in a click too; only a plain click zooms back out.
      if (!suppressClick.current) setZoomed(false);
      suppressClick.current = false;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Zoom in so the spot that was clicked stays under the pointer.
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const w = rect.width * DEFAULT_ZOOM;
    const h = rect.height * DEFAULT_ZOOM;
    setFitW(rect.width);
    setFitH(rect.height);
    setZoomFactor(DEFAULT_ZOOM);
    setOffset(clampOffset(e.clientX - fx * w, e.clientY - fy * h, w, h));
    setZoomed(true);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!zoomed) return;
    const next = Math.min(Math.max(zoomFactor * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1.25), 10);
    const ratio = next / zoomFactor;
    const w = fitW * zoomFactor;
    const h = fitH * zoomFactor;
    // Zoom around the pointer.
    const fx = (e.clientX - offset.x) / w;
    const fy = (e.clientY - offset.y) / h;
    setZoomFactor(next);
    setOffset(
      clampOffset(e.clientX - fx * w * ratio, e.clientY - fy * h * ratio, w * ratio, h * ratio)
    );
  };

  const handleImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setFitW(rect.width);
    setFitH(rect.height);
  }, []);

  const isZoomed = zoomed && fitW > 0 && fitH > 0;

  let imgClassName = css.image;
  const imgStyle: React.CSSProperties = {};

  if (isZoomed) {
    imgClassName = dragging ? `${css.imageZoomed} ${css.imageDragging}` : css.imageZoomed;
    imgStyle.width = fitW * zoomFactor;
    imgStyle.height = fitH * zoomFactor;
    imgStyle.transform = `translate(${offset.x}px, ${offset.y}px)`;
  }

  const { t } = useTranslation();

  const toolbarContent = (
    <div className={css.toolbar}>
      {name ? (
        <>
          <Avatar name={name} mxcUrl={avatarMxc} client={client} size="xs" placeholder="logo" />
          <div className={css.toolbarMeta}>
            <span className={css.senderName}>{name}</span>
            {curFilename && <span className={css.imageName}>{curFilename}</span>}
          </div>
        </>
      ) : (
        curFilename && (
          <div className={css.toolbarMeta}>
            <span className={css.imageName}>{curFilename}</span>
          </div>
        )
      )}

      {isCarousel && (
        <>
          <span className={css.counter}>
            {curIndex + 1}/{items?.length}
          </span>
          <button
            type="button"
            className={css.navBtn}
            onClick={onPrev}
            aria-label={t('mediaLightbox.previous')}
          >
            <CaretLeftIcon size={18} weight="bold" />
          </button>
          <button
            type="button"
            className={css.navBtn}
            onClick={onNext}
            aria-label={t('mediaLightbox.next')}
          >
            <CaretRightIcon size={18} weight="bold" />
          </button>
        </>
      )}

      {onReplace && (
        <button type="button" className={css.actionBtn} onClick={onReplace}>
          <UploadSimpleIcon size={14} /> {t('mediaLightbox.replace')}
        </button>
      )}
      {onRemove && (
        <button type="button" className={css.actionBtn} onClick={onRemove}>
          <TrashIcon size={14} /> {t('mediaLightbox.remove')}
        </button>
      )}
      {curSrc && (
        <DownloadLink
          href={curSrc}
          filename={curFilename || 'image.png'}
          className={css.downloadBtn}
        >
          <DownloadSimpleIcon size={14} />
          {t('mediaLightbox.download')}
        </DownloadLink>
      )}
      {isCarousel && onSaveAll && (
        <button
          type="button"
          className={css.downloadBtn}
          onClick={onSaveAll}
          disabled={saveAllBusy}
        >
          <DownloadSimpleIcon size={14} />
          {saveAllBusy
            ? t('mediaLightbox.savingAll')
            : t('mediaLightbox.saveAll', { count: items?.length ?? 0 })}
        </button>
      )}
    </div>
  );

  return createPortal(
    <div
      className={css.overlay}
      role="presentation"
      data-back-escape
      onClick={handleOverlayClick}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
    >
      <div ref={backdropRef} className={css.backdrop} aria-hidden="true" />
      <div ref={dragRef} className={css.dragLayer}>
        <div className={css.mediaWrap} ref={wrapRef} data-zoomed={isZoomed ? 'true' : undefined}>
          {isCarousel && current?.isSpoiler && !current.revealed ? (
            <div className={css.spoilerSlide}>
              <MediaSpoiler
                reason={current.spoilerReason}
                label={current.label}
                onReveal={() => onRevealItem?.(curIndex)}
              />
            </div>
          ) : curSrc && type === 'video' ? (
            <video
              ref={videoRef}
              src={curSrc}
              className={css.video}
              controls
              autoPlay
              playsInline
              onPlay={() => {
                hasStartedPlayback.current = true;
              }}
              onLoadedMetadata={() => {
                const el = videoRef.current;
                if (el && initialTime > 0 && !hasStartedPlayback.current) {
                  el.currentTime = initialTime;
                }
              }}
              onContextMenu={handleContextMenu}
            />
          ) : curSrc ? (
            <img
              ref={imgRef}
              src={curSrc}
              alt=""
              className={imgClassName}
              style={imgStyle}
              onLoad={handleImgLoad}
              onClick={handleImageClick}
              onPointerDown={handleImagePointerDown}
              onPointerMove={handleImagePointerMove}
              onPointerUp={handleImagePointerUp}
              onPointerCancel={handleImagePointerUp}
              draggable={false}
            />
          ) : (
            <div className={css.loading} />
          )}
        </div>
        <div
          ref={chromeRef}
          className={css.chrome}
          data-lightbox-chrome
          data-hidden={chromeHidden ? 'true' : undefined}
        >
          <button
            type="button"
            className={css.closeBtn}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <XIcon size={20} />
          </button>
          {toolbarContent}
        </div>
      </div>
    </div>,
    document.body
  );
}
