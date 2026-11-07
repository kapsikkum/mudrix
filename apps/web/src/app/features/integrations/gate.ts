import { setPassiveFetchBlocker } from '@/util/integrationFetch';
import { isStreamerModeActive } from '@/util/streamerMode';

/**
 * Importing this keeps lookups that nobody asked for (a card on screen) from leaving the device
 * while streamer mode is on. Actions the person takes themselves are not affected.
 */
setPassiveFetchBlocker(isStreamerModeActive);
