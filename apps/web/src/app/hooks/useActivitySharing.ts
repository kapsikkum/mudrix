import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import {
  customActivityAppsAtom,
  hiddenActivitiesAtom,
  presenceOverrideAtom,
  shareActivityAtom,
  shareActivityGamesAtom,
  shareActivityMusicAtom,
} from '@/app/store/atoms';
import {
  getDesktopActivity,
  isTauriDesktop,
  onDesktopActivity,
  setDesktopActivityDetection,
  type DesktopActivity,
} from '@/util/desktop';
import {
  ACTIVITY_RENEW_MS,
  ACTIVITY_TTL_MS,
  isActivityExpired,
  type ProfileActivity,
} from '@/util/profileActivity';
import {
  fetchExtendedProfileFields,
  useExtendedProfileMutations,
  useExtendedProfileSupport,
} from '@/app/hooks/useExtendedProfile';
import { useSyncReady } from '@/app/hooks/useSync';

/** A game or track has to stay for this long before it is published (alt-tabbing, skipping). */
const SETTLE_MS = 4000;
/** Profile writes are at least this far apart, however fast the activity changes. */
const MIN_WRITE_GAP_MS = 15_000;

/** What the desktop app currently sees on this computer, for showing in Settings. */
export function useDetectedActivity(): DesktopActivity[] {
  const [activity, setActivity] = useState<DesktopActivity[]>([]);
  useEffect(() => {
    if (!isTauriDesktop()) return undefined;
    let alive = true;
    void getDesktopActivity().then((a) => alive && setActivity(a));
    const off = onDesktopActivity((a) => alive && setActivity(a));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return activity;
}

export function isActivityHidden(name: string, hidden: readonly string[]): boolean {
  const key = name.trim().toLowerCase();
  return hidden.some((h) => h === key);
}

/**
 * Publishes what this computer is playing or listening to on the signed-in user's profile
 * (desktop app only, and only once the user has switched it on in Settings, Privacy).
 *
 * Turning it off stops the scan in the desktop app and clears what was published. While an
 * activity lasts it is rewritten every few minutes with a fresh expiry, so a closed app or a
 * crash drops it from other people's view by itself. Invisible presence shares nothing. On startup
 * what the profile still says is checked against what is playing now, and cleared if it is not.
 */
export function useActivitySharing(client: MatrixClient | null): void {
  const share = useAtomValue(shareActivityAtom);
  const games = useAtomValue(shareActivityGamesAtom);
  const music = useAtomValue(shareActivityMusicAtom);
  const hidden = useAtomValue(hiddenActivitiesAtom);
  const custom = useAtomValue(customActivityAppsAtom);
  const presenceOverride = useAtomValue(presenceOverrideAtom);
  const syncReady = useSyncReady();
  const { supported } = useExtendedProfileSupport(client);
  const { saveFields } = useExtendedProfileMutations(client);

  const invisible = presenceOverride === 'offline';
  const active =
    isTauriDesktop() &&
    !!client &&
    syncReady &&
    supported &&
    share &&
    (games || music) &&
    !invisible;

  const saveRef = useRef(saveFields);
  saveRef.current = saveFields;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const hiddenKey = hidden.join('|');
  const customRef = useRef(custom);
  customRef.current = custom;
  const customKey = custom.map((a) => `${a.exe}=${a.name}`).join('|');

  useEffect(() => {
    if (!active) return undefined;
    let disposed = false;
    // What the scan sees, and what the profile currently says.
    let seen: DesktopActivity[] = [];
    let published: ProfileActivity[] = [];
    let lastWrite = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const wanted = (): DesktopActivity[] =>
      seen.filter((a) => !isActivityHidden(a.name, hiddenRef.current));

    const write = async (next: ProfileActivity[]) => {
      lastWrite = Date.now();
      try {
        await saveRef.current({ activities: next });
        published = next;
      } catch {
        // Offline or the server said no; the next renewal tries again.
      }
    };

    const reconcile = () => {
      if (disposed) return;
      const want = wanted();
      const now = Date.now();
      if (want.length === 0 && published.length === 0) return;
      if (now - lastWrite < MIN_WRITE_GAP_MS) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(reconcile, MIN_WRITE_GAP_MS - (now - lastWrite));
        return;
      }
      void write(
        want.map((a) => ({
          type: a.kind === 'game' ? 'playing' : 'listening',
          name: a.name,
          details: a.details,
          startedAt: a.startedAt,
          expiresAt: now + ACTIVITY_TTL_MS,
        }))
      );
    };

    const onChange = (next: DesktopActivity[]) => {
      // Something new has to settle first; losing one (the game closed) is written at once.
      const gained = next.some((a) => !seen.some((s) => s.kind === a.kind && s.name === a.name));
      seen = next;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(reconcile, gained ? SETTLE_MS : 0);
    };

    const detecting = setDesktopActivityDetection(
      games,
      music,
      customRef.current.filter((a) => typeof a?.exe === 'string' && typeof a?.name === 'string')
    ).then(async () => {
      if (disposed) return;
      const a = await getDesktopActivity();
      if (!disposed && seen.length === 0) onChange(a);
    });

    // What the profile still says from before: a closed app, a crash or an older version can leave an
    // activity up that is no longer true, and nothing else would take it down until it expires.
    // Checked against what the scan sees once both are known, and cleared if they disagree.
    const stale = fetchExtendedProfileFields(client, client?.userId() ?? null)
      .then((fields) => fields.activities.filter((a) => !isActivityExpired(a)))
      .catch(() => [] as ProfileActivity[]);
    void Promise.all([detecting, stale]).then(([, left]) => {
      if (disposed || left.length === 0) return;
      if (published.length === 0) published = left;
      // Anything being played is written by the change handler, replacing it; otherwise take it down.
      if (wanted().length === 0) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(reconcile, 0);
      }
    });
    const off = onDesktopActivity(onChange);
    const renew = setInterval(() => {
      if (published.length > 0 && wanted().length > 0) {
        lastWrite = 0;
        reconcile();
      }
    }, ACTIVITY_RENEW_MS);

    return () => {
      disposed = true;
      off();
      clearTimeout(settleTimer);
      clearInterval(renew);
      void setDesktopActivityDetection(false, false);
      // Switched off (or signed out, or went invisible): take it off the profile too.
      if (published.length > 0) void saveRef.current({ activities: [] }).catch(() => {});
    };
    // A game added to the hidden list is taken off the profile at once: the effect restarts.
  }, [active, client, games, music, hiddenKey, customKey]);
}
