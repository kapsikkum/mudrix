import { useTranslation } from 'react-i18next';
import * as css from '../Timeline.css';

export interface MediaCover {
  label: string;
  reason?: string;
}

interface MediaSpoilerProps extends Partial<MediaCover> {
  interactive?: boolean;
  onReveal?: () => void;
}

export function MediaSpoiler({ label, reason, interactive = true, onReveal }: MediaSpoilerProps) {
  const { t } = useTranslation();
  const inner = (
    <>
      {reason && <span className={css.mediaSpoilerReason}>{reason}</span>}
      <span className={css.mediaSpoilerChip}>{label || t('timeline.spoilerMedia')}</span>
    </>
  );

  if (!interactive) {
    return (
      <span className={css.mediaSpoilerOverlay} aria-hidden="true">
        {inner}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={css.mediaSpoilerOverlay}
      onClick={onReveal}
      aria-label={t('timeline.revealMedia')}
    >
      {inner}
    </button>
  );
}
