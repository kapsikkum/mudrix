import { useTranslation } from 'react-i18next';
import { PlayIcon, XIcon } from '@phosphor-icons/react';
import { formatDuration, formatFileSize } from '@/util/format';
import type { ManualVideoLoad } from './encryption';
import * as css from '../Timeline.css';

interface VideoPlaceholderProps {
  poster: string | null;
  sizeBytes?: number;
  durationMs?: number;
  load: ManualVideoLoad;
}

/** Stands in for a large video until the user chooses to download it; fills its mediaBox parent. */
export function VideoPlaceholder({ poster, sizeBytes, durationMs, load }: VideoPlaceholderProps) {
  const { t } = useTranslation();

  const meta = [
    sizeBytes !== undefined ? formatFileSize(sizeBytes) : null,
    durationMs !== undefined && durationMs > 0 ? formatDuration(durationMs) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {poster ? (
        <img className={css.mediaFill} src={poster} alt="" draggable={false} />
      ) : (
        <div className={css.mediaBoxPulse} />
      )}
      {load.checking ? null : load.loading ? (
        <div className={css.videoProgressPanel} role="status">
          <div className={css.videoProgressTrack} aria-label={t('timeline.video.downloading')}>
            <div className={css.videoProgressFill} />
          </div>
          {sizeBytes !== undefined && (
            <span className={css.videoMetaText}>{formatFileSize(sizeBytes)}</span>
          )}
          <button
            type="button"
            className={css.videoCancelBtn}
            onClick={load.cancel}
            aria-label={t('timeline.video.cancelDownload')}
          >
            <XIcon size={14} weight="bold" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={css.videoPlayOverlay}
          onClick={load.start}
          aria-label={t('timeline.video.play')}
        >
          <span className={css.videoPlayCircle}>
            <PlayIcon size={24} weight="fill" />
          </span>
          {meta && <span className={css.videoMetaChip}>{meta}</span>}
        </button>
      )}
    </>
  );
}
