import { useQuery } from '@tanstack/react-query';
import type { WizardClient as MatrixClient } from '@wizardchat/core';

export interface UserDeviceSummary {
  count: number;
  verifiedCount: number;
}

async function fetchUserDeviceSummary(
  client: MatrixClient,
  userId: string
): Promise<UserDeviceSummary | null> {
  const session = client.session();
  if (!session?.accessToken || !session?.homeserverUrl) return null;

  const base = session.homeserverUrl.replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/_matrix/client/v3/keys/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_keys: { [userId]: [] } }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { device_keys?: Record<string, Record<string, unknown>> };
    const devices = Object.keys(data.device_keys?.[userId] || {});
    if (devices.length === 0) return null;
    return { count: devices.length, verifiedCount: 0 };
  } catch {
    return null;
  }
}

/** How many sessions a user has, and how many of them are verified. */
export function useUserDeviceSummary(
  client: MatrixClient | null | undefined,
  userId: string | null | undefined
): UserDeviceSummary | null {
  const { data } = useQuery<UserDeviceSummary | null>({
    queryKey: ['user-device-summary', client?.userId(), userId],
    queryFn: async () => {
      if (!client || !userId) return null;
      return fetchUserDeviceSummary(client, userId);
    },
    enabled: !!client && !!userId,
    staleTime: 60_000,
  });

  return data ?? null;
}
