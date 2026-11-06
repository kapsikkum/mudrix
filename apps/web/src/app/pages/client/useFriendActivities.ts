import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { WizardClient } from '@wizardchat/core';
import { EXTENDED_PROFILE_KEY, fetchExtendedProfileFields } from '@/app/hooks/useExtendedProfile';
import { useDms } from '@/app/hooks/useDms';
import { isActivityExpired, type ProfileActivity } from '@/util/profileActivity';

/** People checked for something to show; the profile fetches are queued four at a time. */
const MAX_FRIENDS = 20;
const REFRESH_MS = 2 * 60_000;

export interface FriendActivity {
  userId: string;
  roomId: string;
  name: string;
  avatarMxc: string | null;
  activities: ProfileActivity[];
}

/**
 * The people we have a direct chat with who are playing a game or listening to something right
 * now (the `activity` field of their profile). It shares the cached profile of each person with
 * the rest of the app, and drops an activity the moment its expiry passes.
 */
export function useFriendActivities(client: WizardClient): FriendActivity[] {
  const dms = useDms();
  const friends = useMemo(() => {
    const seen = new Set<string>();
    return dms
      .filter((dm) => !!dm.partnerId && !seen.has(dm.partnerId) && !!seen.add(dm.partnerId))
      .slice(0, MAX_FRIENDS);
  }, [dms]);

  const results = useQueries({
    queries: friends.map((dm) => ({
      queryKey: [EXTENDED_PROFILE_KEY, dm.partnerId],
      queryFn: () => fetchExtendedProfileFields(client, dm.partnerId),
      staleTime: 60_000,
      refetchInterval: REFRESH_MS,
    })),
  });

  // An activity expires without any new data arriving, so look again at the next expiry.
  const [now, setNow] = useState(() => Date.now());
  const nextExpiry = results.reduce((soonest, r) => {
    for (const a of r.data?.activities ?? []) {
      if (!isActivityExpired(a, now)) soonest = Math.min(soonest, a.expiresAt);
    }
    return soonest;
  }, Infinity);
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return undefined;
    const id = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(nextExpiry - now + 50, 2 ** 31 - 1)
    );
    return () => window.clearTimeout(id);
  }, [nextExpiry, now]);

  // `results` is a new array each render; its data only changes with the profiles themselves.
  const key = results.map((r) => r.dataUpdatedAt).join(',');
  return useMemo(() => {
    const list: FriendActivity[] = [];
    friends.forEach((dm, i) => {
      const activities = (results[i]?.data?.activities ?? []).filter(
        (a) => !isActivityExpired(a, now)
      );
      if (activities.length === 0) return;
      list.push({
        userId: dm.partnerId,
        roomId: dm.roomId,
        name: dm.partnerName,
        avatarMxc: dm.partnerAvatarMxc,
        activities,
      });
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends, key, now]);
}
