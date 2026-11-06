import type { RoomTimeline, WizardClient } from '@wizardchat/core';
import { probeIsAnimated } from '../utils/imageAnimation';
import { getImageDimensions } from './imageDimensions';
import { sendRawEvent, type ReplyTarget } from './sendMessageContent';
import { downloadGif, type GifItem } from './gifProviders';

/** Event content field recording which provider GIF a sent message came from. */
export const GIF_SOURCE_FIELD = 'xyz.mudrix.gif';

export interface SendGifOptions {
  client: WizardClient;
  timeline: RoomTimeline;
  isEncrypted: boolean;
  threadId?: string | null;
  replyTo?: ReplyTarget | null;
}

/**
 * Sends `item` to the room as a GIF: the file is downloaded from the provider, uploaded to the
 * homeserver (encrypted in encrypted rooms) and posted as a sticker-style image, as the base does.
 */
export async function sendGif(
  item: GifItem,
  { client, timeline, isEncrypted, threadId, replyTo }: SendGifOptions
): Promise<void> {
  const { blob, fileName } = await downloadGif(item);
  const file = new File([blob], fileName, { type: blob.type || 'image/gif' });

  const mimetype = file.type || 'image/gif';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const source = isEncrypted
    ? { file: await client.uploadEncryptedMedia(bytes) }
    : { url: await client.uploadMedia(bytes, mimetype) };
  const isAnimated = await probeIsAnimated(mimetype, file);

  const dims = await getImageDimensions(file);
  const info: Record<string, unknown> = { mimetype, size: file.size };
  if (typeof isAnimated === 'boolean') info.is_animated = isAnimated;
  if (dims) {
    info.w = dims.w;
    info.h = dims.h;
  }

  await sendRawEvent(
    'm.sticker',
    {
      body: item.title || 'GIF',
      info,
      ...source,
      [GIF_SOURCE_FIELD]: { provider: item.provider, id: item.id },
    },
    { timeline, threadId, replyTo: replyTo ?? null, myId: client.userId() ?? '' }
  );
}
