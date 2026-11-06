import { mudrixKey } from '@/util/namespace';
import type { EventEntry } from './entry';

/**
 * Content key Mudrix puts on each image of a multi-image send so the timeline can show them as one
 * gallery. Other clients ignore it and show the images one by one.
 */
export const GALLERY_CONTENT_KEY = mudrixKey('gallery');
/** What earlier versions wrote (a domain Mudrix does not own); galleries already sent still use it. */
const LEGACY_GALLERY_CONTENT_KEY = 'org.mudrix.gallery';

export interface GalleryTag {
  /** Shared by every image sent together. */
  id: string;
  index: number;
  count: number;
}

/** The tag of a tagged image, read from the namespaced keys the core hands over. */
export function getGalleryTag(event: EventEntry): GalleryTag | null {
  const custom = event.customContent;
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return null;
  const raw = custom[GALLERY_CONTENT_KEY] ?? custom[LEGACY_GALLERY_CONTENT_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { id, index, count } = raw;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  if (typeof index !== 'number' || typeof count !== 'number') return null;
  return { id, index, count };
}

/** Our own message that is still on its way: its content is not at hand, so it has no tag yet. */
export function isPendingEcho(event: EventEntry): boolean {
  return event.sendState === 'sending';
}
