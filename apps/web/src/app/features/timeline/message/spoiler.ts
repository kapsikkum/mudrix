import type { MediaInfo } from '@wizardchat/core';

export const MATRIX_SPOILER_PROPERTY_NAME = 'page.codeberg.everypizza.msc4193.spoiler';
export const MATRIX_SPOILER_REASON_PROPERTY_NAME =
  'page.codeberg.everypizza.msc4193.spoiler.reason';
export const MATRIX_SPOILER_STABLE_PROPERTY_NAME = 'm.spoiler';
export const MATRIX_SPOILER_REASON_STABLE_PROPERTY_NAME = 'm.spoiler.reason';

export interface MediaSpoiler {
  isSpoiler: boolean;
  reason?: string;
}

export function getMediaSpoiler(content: Record<string, unknown>): MediaSpoiler {
  const flag =
    content[MATRIX_SPOILER_STABLE_PROPERTY_NAME] ?? content[MATRIX_SPOILER_PROPERTY_NAME];
  const reason =
    (content[MATRIX_SPOILER_REASON_STABLE_PROPERTY_NAME] as string | undefined) ??
    (content[MATRIX_SPOILER_REASON_PROPERTY_NAME] as string | undefined);
  return {
    isSpoiler: flag === true || flag === 'true',
    reason: typeof reason === 'string' && reason.length > 0 ? reason : undefined,
  };
}

export function getMediaInfoSpoiler(media: MediaInfo | null | undefined): MediaSpoiler {
  return {
    isSpoiler: media?.spoiler === true,
    reason: media?.spoilerReason ? media.spoilerReason : undefined,
  };
}
