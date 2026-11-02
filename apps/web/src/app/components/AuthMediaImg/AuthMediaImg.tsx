import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { SmileyStickerIcon, StickerIcon } from '@phosphor-icons/react';
import { useMediaBlobUrl } from '@/app/components/Avatar/useMediaBlobUrl';
import * as css from './AuthMediaImg.css';

export type MediaPlaceholderKind = 'emoji' | 'sticker' | 'none';

export interface AuthMediaImgProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'width' | 'height'
> {
  client: MatrixClient | null | undefined;
  mxcUrl: string | undefined | null;
  width?: number;
  height?: number;
  placeholder?: MediaPlaceholderKind;
}

export function AuthMediaImg({
  client,
  mxcUrl,
  width,
  height,
  alt,
  placeholder = 'emoji',
  className,
  style,
  ...rest
}: AuthMediaImgProps) {
  const { src } = useMediaBlobUrl(client, mxcUrl, { width, height });

  if (!src && mxcUrl && placeholder !== 'none') {
    const Glyph = placeholder === 'sticker' ? StickerIcon : SmileyStickerIcon;
    return (
      <span
        className={[className, css.placeholderBox].filter(Boolean).join(' ')}
        style={{ ...style, display: 'inline-flex' }}
        role="img"
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        <Glyph />
      </span>
    );
  }

  return <img {...rest} className={className} style={style} src={src} alt={alt} />;
}

export default AuthMediaImg;
