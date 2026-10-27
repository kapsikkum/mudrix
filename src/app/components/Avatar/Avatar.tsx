import { useCallback, memo } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';
import { showPresenceDotsAtom } from '@/app/store/atoms/settings';
import type { PresenceState } from '@/app/store/atoms';
import { useAvatarBlobUrl } from './useAvatarBlobUrl';
import { getInitialAndHue } from './avatarHue';
import { WizardMark } from './WizardMark';
import { Tooltip } from '@/app/components/Tooltip';
import * as css from './Avatar.css';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'fill';

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: css.avatarXs,
  sm: css.avatarSm,
  md: css.avatar,
  lg: css.avatarLg,
  xl: css.avatarXl,
  fill: css.avatarFill,
};

const PRESENCE_DOT_CLASS: Record<AvatarSize, string> = {
  xs: css.presenceDotXs,
  sm: css.presenceDotSm,
  md: css.presenceDotMd,
  lg: css.presenceDotLg,
  xl: css.presenceDotXl,
  fill: css.presenceDotFill,
};

const PRESENCE_COLOR_CLASS: Record<PresenceState, string> = {
  online: css.presenceOnline,
  unavailable: css.presenceUnavailable,
  offline: css.presenceOffline,
};

interface Props {
  name: string;
  mxcUrl?: string | null;
  client?: MatrixClient | null;
  size?: AvatarSize;
  className?: string;
  presence?: PresenceState;
  presenceDotLabel?: string;
  onPresenceDotClick?: (e: React.MouseEvent) => void;
  onAvatarClick?: (e: React.MouseEvent) => void;
  placeholder?: 'initial' | 'logo';
}

export const Avatar = memo(function Avatar({
  name,
  mxcUrl,
  client,
  size = 'md',
  className,
  presence,
  presenceDotLabel,
  onPresenceDotClick,
  onAvatarClick,
  placeholder = 'initial',
}: Props) {
  const { initial, hue } = getInitialAndHue(name);
  const { data: imgSrc, refetch } = useAvatarBlobUrl(mxcUrl, client);

  const handleImgError = useCallback(() => {
    refetch();
  }, [refetch]);

  const sizeClass = SIZE_CLASS[size];
  const combinedClass = className ? `${sizeClass} ${className}` : sizeClass;
  const wrapClass = size === 'fill' ? css.avatarWrapFill : css.avatarWrap;

  const wrapProps = onAvatarClick
    ? {
        className: `${wrapClass} ${css.avatarWrapClickable}`,
        onClick: onAvatarClick,
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          onAvatarClick(e as unknown as React.MouseEvent);
        },
      }
    : { className: wrapClass };

  const showDots = useAtomValue(showPresenceDotsAtom);
  const dot =
    presence && showDots ? (
      onPresenceDotClick ? (
        <Tooltip content={presenceDotLabel ?? presence}>
          <button
            type="button"
            className={`${PRESENCE_DOT_CLASS[size]} ${PRESENCE_COLOR_CLASS[presence]} ${css.presenceDotButton}`}
            aria-label={presenceDotLabel ?? presence}
            onClick={(e) => {
              e.stopPropagation();
              onPresenceDotClick(e);
            }}
          />
        </Tooltip>
      ) : (
        <span
          className={`${PRESENCE_DOT_CLASS[size]} ${PRESENCE_COLOR_CLASS[presence]}`}
          aria-label={presence}
        />
      )
    ) : null;

  if (imgSrc) {
    return (
      <div {...wrapProps}>
        <div className={combinedClass}>
          <img src={imgSrc} alt={name} className={css.avatarImg} onError={handleImgError} />
        </div>
        {dot}
      </div>
    );
  }

  return (
    <div {...wrapProps}>
      <div
        className={combinedClass}
        style={{ backgroundColor: `hsl(${hue}, 60%, 42%)` }}
        aria-label={name}
      >
        {placeholder === 'logo' ? <WizardMark className={css.placeholderMark} /> : initial}
      </div>
      {dot}
    </div>
  );
});
