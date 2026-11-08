import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import {
  BIO_KEYS,
  PRONOUN_KEYS,
  PROFILE_TZ_KEY,
  EMPTY_PROFILE_FIELDS,
  bioToValue,
  parseExtendedProfile,
  pronounsToValue,
  sanitizeBio,
  type ExtendedProfileFields,
} from '@/util/profileFields';
import {
  PROFILE_ACCENT_KEYS,
  PROFILE_AVATAR_DECORATION_KEYS,
  PROFILE_NAMEPLATE_KEYS,
  PROFILE_FRAME_KEYS,
  PROFILE_IS_MUDRIX_USER_KEYS,
  normalizeHex,
  parseAvatarDecoration,
  parseNameplate,
  parseProfileFrame,
  isStatusExpired,
  type ProfileStatus,
  type AvatarDecorationId,
  type NameplateId,
  type ProfileFrameId,
} from '@/util/profileCosmetics';
import {
  ACTIVITY_EMOJI,
  PROFILE_ACTIVITY_KEYS,
  activityToValue,
  isActivityExpired,
  type ProfileActivity,
} from '@/util/profileActivity';
import { useSyncReady } from '@/app/hooks/useSync';

export const EXTENDED_PROFILE_KEY = 'extended-profile';

// Lists mount many rows at once; cap how many profile requests run at the same time.
const MAX_CONCURRENT_PROFILE_FETCHES = 4;
let activeProfileFetches = 0;
const profileFetchQueue: Array<() => void> = [];

async function withProfileFetchSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeProfileFetches >= MAX_CONCURRENT_PROFILE_FETCHES) {
    // The finishing request hands its slot straight to us, so the count stays accurate.
    await new Promise<void>((resolve) => {
      profileFetchQueue.push(resolve);
    });
  } else {
    activeProfileFetches += 1;
  }
  try {
    return await fn();
  } finally {
    const next = profileFetchQueue.shift();
    if (next) next();
    else activeProfileFetches -= 1;
  }
}

/** The whole profile of a user as one object (one request). */
async function fetchRawProfile(
  client: MatrixClient,
  userId: string
): Promise<Record<string, unknown>> {
  const profile = await withProfileFetchSlot(() => client.profileFields(userId));
  return profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
}

/** The query function behind `useExtendedProfile`, for callers that batch several users. */
export async function fetchExtendedProfileFields(
  client: MatrixClient | null,
  userId: string | null
): Promise<ExtendedProfileFields> {
  if (!client || !userId) return EMPTY_PROFILE_FIELDS;
  return parseExtendedProfile(await fetchRawProfile(client, userId));
}

/**
 * A user's extended profile fields (bio, pronouns, timezone, activity, cosmetics). Fields that
 * are not set, or cannot be read, are empty.
 */
export function useExtendedProfile(
  client: MatrixClient | null,
  userId: string | null,
  options?: { refetchInterval?: number }
) {
  return useQuery<ExtendedProfileFields>({
    queryKey: [EXTENDED_PROFILE_KEY, userId],
    queryFn: () => fetchExtendedProfileFields(client, userId),
    enabled: !!client && !!userId,
    staleTime: 60_000,
    // Profile fields have no push; callers that keep a list open poll. TanStack Query pauses
    // interval refetches while the tab is hidden.
    refetchInterval: options?.refetchInterval ?? false,
  });
}

/** Whether the homeserver supports extended profile fields (bio, pronouns, timezone, banner). */
export function useExtendedProfileSupport(client: MatrixClient | null) {
  const { data, isLoading } = useQuery<boolean>({
    queryKey: ['extended-profile-support', client?.userId() ?? null],
    queryFn: () => (client ? client.supportsExtendedProfiles() : false),
    enabled: !!client,
    staleTime: 10 * 60_000,
  });
  // A failed check must not lock the editor: the save shows its own error
  return { supported: data ?? true, loading: isLoading };
}

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** "Playing X" / "Listening to X by Y" in the viewer's language. */
export function activityText(t: TFunction, activity: ProfileActivity): string {
  if (activity.type === 'playing') return t('profile.activity.playing', { name: activity.name });
  return activity.details
    ? t('profile.activity.listeningBy', { title: activity.name, artist: activity.details })
    : t('profile.activity.listening', { title: activity.name });
}

/** Re-renders the caller at `expiresAt`: a profile fetch that returns identical data would not. */
function useRerenderAt(expiresAt: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(expiresAt)) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) return;
    const id = window.setTimeout(() => setTick((n) => n + 1), Math.min(delay, MAX_TIMEOUT_MS));
    return () => window.clearTimeout(id);
  }, [expiresAt, tick]);
  return tick;
}

/**
 * What the person is playing and listening to right now, shown next to their status rather than
 * instead of it. Each drops out when its expiry passes (the desktop app keeps renewing it).
 */
export function useLiveActivities(
  activities: ProfileActivity[] | null | undefined
): ProfileActivity[] {
  const now = Date.now();
  const nextExpiry = Math.min(
    ...(activities ?? []).filter((a) => !isActivityExpired(a, now)).map((a) => a.expiresAt),
    Infinity
  );
  const tick = useRerenderAt(nextExpiry);
  return useMemo(
    () => (activities ?? []).filter((a) => !isActivityExpired(a)),
    // `tick` makes an expired activity drop out even though the input is the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, tick]
  );
}

/** The first emoji of what someone is doing, for places with room for little. */

export function useActiveStatus(status: ProfileStatus | null | undefined): ProfileStatus | null {
  const tick = useRerenderAt(status?.expiresAt ?? Infinity);
  return useMemo(() => (status && !isStatusExpired(status) ? status : null), [status, tick]);
}
export function activityEmoji(activity: ProfileActivity): string {
  return ACTIVITY_EMOJI[activity.type];
}

/**
 * Write or delete one logical field under all of its key names (stable + unstable) so other
 * clients that only know one of them interoperate. Succeeds when at least one write lands.
 * Deleting a key that was never set may fail; that is not an error.
 */
async function writeField(
  client: MatrixClient,
  keys: readonly string[],
  value: unknown | null
): Promise<void> {
  const results = await Promise.allSettled(
    keys.map((key) =>
      value === null
        ? client.deleteProfileField(key)
        : client.setProfileField(key, value as Parameters<MatrixClient['setProfileField']>[1])
    )
  );
  if (value === null) return;
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length === 0 || failures.length < results.length) return;
  throw failures[0].reason;
}

export interface ExtendedProfileUpdate {
  /** Pass '' to clear. Undefined leaves the field alone. */
  bio?: string;
  pronouns?: string[];
  /** IANA zone. Pass null to clear. */
  timezone?: string | null;
  /** What the desktop app sees the user playing and listening to. */
  activities?: ProfileActivity[];
  /** Mudrix-only fields below (`io.github.kapsikkum.mudrix.*`). Pass null to clear. */
  accent?: string | null;
  avatarDecoration?: AvatarDecorationId | null;
  nameplate?: NameplateId | null;
  profileFrame?: ProfileFrameId | null;
}

export function useExtendedProfileMutations(client: MatrixClient | null) {
  const qc = useQueryClient();
  const userId = client?.userId() ?? null;
  const invalidate = () => qc.invalidateQueries({ queryKey: [EXTENDED_PROFILE_KEY, userId] });

  const { mutateAsync: saveFields, isPending: busy } = useMutation({
    mutationFn: async (update: ExtendedProfileUpdate) => {
      if (!client) throw new Error('No client');
      const jobs: Promise<void>[] = [];
      if (update.bio !== undefined) {
        const bio = sanitizeBio(update.bio);
        jobs.push(writeField(client, BIO_KEYS, bio ? bioToValue(bio) : null));
      }
      if (update.pronouns !== undefined) {
        jobs.push(
          writeField(
            client,
            PRONOUN_KEYS,
            update.pronouns.length ? pronounsToValue(update.pronouns) : null
          )
        );
      }
      if (update.timezone !== undefined) {
        jobs.push(writeField(client, [PROFILE_TZ_KEY], update.timezone || null));
      }
      if (update.activities !== undefined) {
        jobs.push(writeField(client, PROFILE_ACTIVITY_KEYS, activityToValue(update.activities)));
      }
      if (update.accent !== undefined) {
        jobs.push(writeField(client, PROFILE_ACCENT_KEYS, normalizeHex(update.accent)));
      }
      if (update.avatarDecoration !== undefined) {
        jobs.push(
          writeField(
            client,
            PROFILE_AVATAR_DECORATION_KEYS,
            parseAvatarDecoration(update.avatarDecoration)
          )
        );
      }
      if (update.nameplate !== undefined) {
        jobs.push(writeField(client, PROFILE_NAMEPLATE_KEYS, parseNameplate(update.nameplate)));
      }
      if (update.profileFrame !== undefined) {
        jobs.push(writeField(client, PROFILE_FRAME_KEYS, parseProfileFrame(update.profileFrame)));
      }
      const settled = await Promise.allSettled(jobs);
      const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) throw failed.reason;
    },
    onSettled: invalidate,
  });

  return { saveFields, busy };
}

/**
 * Sets `is_user = true` on the signed-in account's own extended profile, once per account, so
 * other Mudrix clients can show a real "Mudrix user" badge for them. Never user-editable and never
 * cleared: it is a standing fact ("this account has used Mudrix"), not a preference.
 */
export function useEnsureMudrixUserFlag(client: MatrixClient | null): void {
  const syncReady = useSyncReady();
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!client || !syncReady) return;
    const userId = client.userId();
    if (!userId || attemptedRef.current === userId) return;

    // v2: the flag moved to the new key name, so accounts that set the old one set it again.
    const storageKey = `mudrix.userFlagSet2.${userId}`;
    try {
      if (localStorage.getItem(storageKey) === '1') return;
    } catch {
      // storage unavailable: the check below still avoids a second write
    }
    attemptedRef.current = userId;

    let cancelled = false;
    void (async () => {
      let current: unknown = null;
      try {
        current = await client.profileField(userId, PROFILE_IS_MUDRIX_USER_KEYS[0]);
      } catch {
        current = null;
      }
      try {
        if (current !== true) {
          if (cancelled) return;
          await writeField(client, PROFILE_IS_MUDRIX_USER_KEYS, true);
        }
        localStorage.setItem(storageKey, '1');
      } catch {
        // Not critical: retried on next launch.
        attemptedRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, syncReady]);
}
