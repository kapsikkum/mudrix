import type { MatrixClient } from 'matrix-js-sdk';
import { isLivekitTransportConfig, type LivekitTransportConfig } from 'matrix-js-sdk/lib/matrixrtc';

const RTC_FOCI_WELL_KNOWN_KEY = 'org.matrix.msc4143.rtc_foci';

export function normalizeServiceUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function livekitFrom(list: unknown): LivekitTransportConfig | null {
  if (!Array.isArray(list)) return null;
  const livekit = list.find(isLivekitTransportConfig);
  return livekit
    ? { type: 'livekit', livekit_service_url: normalizeServiceUrl(livekit.livekit_service_url) }
    : null;
}

export async function getLivekitTransport(
  client: MatrixClient
): Promise<LivekitTransportConfig | null> {
  const wellKnown = client.getClientWellKnown() as Record<string, unknown> | undefined;
  const fromWellKnown = livekitFrom(wellKnown?.[RTC_FOCI_WELL_KNOWN_KEY]);
  if (fromWellKnown) return fromWellKnown;
  try {
    return livekitFrom(await client._unstable_getRTCTransports());
  } catch {
    return null;
  }
}
