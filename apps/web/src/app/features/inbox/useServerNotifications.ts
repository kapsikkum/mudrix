import { useQuery } from '@tanstack/react-query';
import type { ServerNotification } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';

const NOTIFICATION_LIMIT = 100;

export interface ServerNotifications {
  /** Mentions and keywords; null when the server could not say */
  highlights: ServerNotification[] | null;
  /** Every notification; null when the server could not say */
  all: ServerNotification[] | null;
}

async function settle<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch {
    return null;
  }
}

/**
 * The server's notifications, which list mentions and thread replies in rooms whose messages are
 * not loaded. Shared by the inbox tabs and the badge under the query key `serverNotifications`.
 */
export function useServerNotifications(enabled = true) {
  return useQuery({
    queryKey: ['serverNotifications'],
    queryFn: async (): Promise<ServerNotifications> => {
      const client = getMatrixClientOrNull()!;
      const [highlights, all] = await Promise.all([
        settle(() => client.serverNotifications(true, NOTIFICATION_LIMIT)),
        settle(() => client.serverNotifications(false, NOTIFICATION_LIMIT)),
      ]);
      return { highlights, all };
    },
    enabled: enabled && !!getMatrixClientOrNull(),
    staleTime: 30_000,
    retry: false,
  });
}
