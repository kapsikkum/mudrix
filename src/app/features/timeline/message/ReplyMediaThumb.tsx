import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import {
  EyeSlashIcon,
  FileTextIcon,
  ImageIcon,
  MusicNoteIcon,
  VideoCameraIcon,
} from '@phosphor-icons/react';
import { hiddenMediaAtom, mediaVisibilityAtom } from '@/app/store/atoms';
import { isPrivateRoom } from '@/util/matrix';
import { getEncryptedFile } from '../encryptedMedia';
import { isMxcUrl } from '@/app/features/settings/emojis/imagePackTypes';
import { useDecryptedMedia } from './encryption';
import { getMediaBlobUrl, getMediaAnimates } from './media';
import { AnimatedImage } from './AnimatedImage';
import { getMediaSpoiler } from './spoiler';
import { getMediaCaption } from './textContent';
import * as css from '../Timeline.css';

const MEDIA_MSGTYPES = new Set(['m.image', 'm.video', 'm.file', 'm.audio']);

export function isReplyMediaEvent(event: MatrixEvent): boolean {
  if (event.getType() === 'm.sticker') return true;
  const msgtype = event.getContent()?.msgtype as string | undefined;
  return msgtype !== undefined && MEDIA_MSGTYPES.has(msgtype);
}

interface Props {
  event: MatrixEvent;
  client: MatrixClient;
  body: string;
  thumbClassName?: string;
  thumbWrapClassName?: string;
  rowClassName?: string;
  animate?: boolean;
}

export function ReplyMediaThumb({
  event,
  client,
  body,
  thumbClassName = css.replyMediaThumb,
  thumbWrapClassName = css.replyMediaThumbWrap,
  rowClassName = css.replyMediaRow,
  animate = false,
}: Props) {
  const { t } = useTranslation();
  const content = event.getContent() as Record<string, unknown>;
  const msgtype = content?.msgtype as string | undefined;
  const isImage = msgtype === 'm.image';
  const isVideo = msgtype === 'm.video';
  const isAudio = msgtype === 'm.audio';
  const isSticker = event.getType() === 'm.sticker';

  const mediaVisibility = useAtomValue(mediaVisibilityAtom);
  const hiddenMedia = useAtomValue(hiddenMediaAtom);
  const room = client.getRoom(event.getRoomId() ?? '');
  const spoiler = getMediaSpoiler(content);
  const coveredByPreference =
    mediaVisibility === 'never' ||
    (mediaVisibility === 'private' && (!room || !isPrivateRoom(room, client)));
  const isHidden = hiddenMedia[event.getId() ?? ''] === true;
  const covered = spoiler.isSpoiler || coveredByPreference || isHidden;

  const { mediaSrc, thumbnailSrc, setMediaSrc } = useDecryptedMedia(
    event,
    content,
    client,
    !covered,
    false
  );

  if (covered) {
    return (
      <span className={css.replyMediaCover} aria-hidden="true">
        <EyeSlashIcon size={13} weight="bold" />
        {spoiler.isSpoiler ? t('timeline.spoilerMedia') : t('timeline.showMedia')}
      </span>
    );
  }

  const encFile = getEncryptedFile(content);
  const mxcUrl = content.url as string | undefined;
  const directSrc = mxcUrl && !isMxcUrl(mxcUrl) ? mxcUrl : null;
  const src =
    mediaSrc ??
    directSrc ??
    (!encFile && mxcUrl ? getMediaBlobUrl(mxcUrl, client, setMediaSrc) : null);

  const text = isImage || isVideo ? (getMediaCaption(content) ?? '') : isSticker ? '' : body.trim();
  const label = text || (content.body as string | undefined) || '';

  let visual: ReactNode;
  if ((isImage || isSticker) && src) {
    visual = (
      <AnimatedImage
        src={src}
        alt={label}
        mimeType={
          (content.info as Record<string, unknown> | undefined)?.mimetype as string | undefined
        }
        isAnimated={getMediaAnimates(event)}
        className={thumbClassName}
        wrapperClassName={thumbWrapClassName}
        alwaysStatic={!animate}
      />
    );
  } else if (isVideo && thumbnailSrc) {
    visual = <img className={thumbClassName} src={thumbnailSrc} alt={label} />;
  } else {
    const Icon = isVideo
      ? VideoCameraIcon
      : isAudio
        ? MusicNoteIcon
        : isImage || isSticker
          ? ImageIcon
          : FileTextIcon;
    visual = (
      <span className={css.replyMediaIcon} aria-hidden="true">
        <Icon size={18} />
      </span>
    );
  }

  return (
    <span className={rowClassName}>
      {visual}
      {text && <span className={css.replyMediaText}>{text}</span>}
    </span>
  );
}
