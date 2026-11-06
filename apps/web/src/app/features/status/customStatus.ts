import { atom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useState } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { ownCustomStatusAtom, statusMsgMapAtom, userIdAtom } from '@/app/store/atoms';
import type { CustomStatus } from '@/app/store/atoms';
import { useSyncReady } from '@/app/hooks/useSync';
import { mudrixKey, wizardchatKey } from '@/util/namespace';

export const PROFILE_STATUS_KEY = mudrixKey('status');
/** Where the WizardChat base keeps it: read, and cleared with the Mudrix field, never written */
const WIZARDCHAT_STATUS_KEY = wizardchatKey('status');
export const MAX_STATUS_LENGTH = 128;

export const customStatusDialogOpenAtom = atom(false);

export function isExpired(status: CustomStatus, now = Date.now()): boolean {
  return typeof status.expiresAt === 'number' && status.expiresAt <= now;
}

export function parseCustomStatus(raw: unknown): CustomStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const { text, expires_at: expiresAt } = raw as { text?: unknown; expires_at?: unknown };
  if (typeof text !== 'string' || !text.trim()) return null;
  const status: CustomStatus = {
    text: text.slice(0, MAX_STATUS_LENGTH),
    expiresAt: typeof expiresAt === 'number' ? expiresAt : null,
  };
  return isExpired(status) ? null : status;
}

const profileSupport = new WeakMap<MatrixClient, Promise<boolean>>();
const statusWritable = new WeakMap<MatrixClient, Promise<boolean>>();

function supportsProfileFields(client: MatrixClient): Promise<boolean> {
  let support = profileSupport.get(client);
  if (!support) {
    support = client.supportsExtendedProfiles().catch(() => false);
    profileSupport.set(client, support);
  }
  return support;
}

function canWriteStatus(client: MatrixClient): Promise<boolean> {
  let writable = statusWritable.get(client);
  if (!writable) {
    writable = client.canSetProfileField(PROFILE_STATUS_KEY).catch(() => false);
    statusWritable.set(client, writable);
  }
  return writable;
}

async function publishCustomStatus(client: MatrixClient, status: CustomStatus | null) {
  if (!(await canWriteStatus(client))) return;
  try {
    if (status) {
      await client.setProfileField(PROFILE_STATUS_KEY, {
        text: status.text,
        ...(status.expiresAt ? { expires_at: status.expiresAt } : {}),
      });
      // A status set under the old name would otherwise keep showing after it is replaced
      await client.deleteProfileField(WIZARDCHAT_STATUS_KEY).catch(() => {});
    } else {
      await client.deleteProfileField(PROFILE_STATUS_KEY);
      await client.deleteProfileField(WIZARDCHAT_STATUS_KEY).catch(() => {});
    }
  } catch {
    // Not set / rejected: presence status_msg still carries the text
  }
}

export async function fetchCustomStatus(
  client: MatrixClient,
  userId: string
): Promise<CustomStatus | null | undefined> {
  if (!(await supportsProfileFields(client))) return undefined;
  try {
    const current = parseCustomStatus(await client.profileField(userId, PROFILE_STATUS_KEY));
    if (current) return current;
    return parseCustomStatus(await client.profileField(userId, WIZARDCHAT_STATUS_KEY));
  } catch {
    return undefined;
  }
}

export function useSetCustomStatus(client: MatrixClient | null) {
  const setOwn = useSetAtom(ownCustomStatusAtom);
  return useCallback(
    (status: CustomStatus | null) => {
      const next = status && status.text.trim() ? { ...status, text: status.text.trim() } : null;
      setOwn(next);
      if (client) void publishCustomStatus(client, next);
    },
    [client, setOwn]
  );
}

export function useCustomStatusSync(client: MatrixClient | null): void {
  const own = useAtomValue(ownCustomStatusAtom);
  const setOwn = useSetAtom(ownCustomStatusAtom);
  const setStatus = useSetCustomStatus(client);
  const syncReady = useSyncReady();

  useEffect(() => {
    const userId = client?.userId();
    if (!client || !userId || !syncReady) return;
    let cancelled = false;
    void (async () => {
      if (!(await canWriteStatus(client))) return;
      const remote = await fetchCustomStatus(client, userId);
      if (cancelled || remote === undefined) return;
      setOwn((prev) =>
        prev?.text === remote?.text && (prev?.expiresAt ?? null) === (remote?.expiresAt ?? null)
          ? prev
          : remote
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [client, syncReady, setOwn]);

  const expiresAt = own?.expiresAt ?? null;
  useEffect(() => {
    if (expiresAt === null) return;
    const delay = Math.min(Math.max(expiresAt - Date.now(), 0), 2 ** 31 - 1);
    const timer = setTimeout(() => setStatus(null), delay);
    return () => clearTimeout(timer);
  }, [expiresAt, setStatus]);
}

export function useUserStatusText(
  client: MatrixClient | null,
  userId: string | null | undefined,
  fetchProfile = false
): string | null {
  const ownId = useAtomValue(userIdAtom);
  const own = useAtomValue(ownCustomStatusAtom);
  const statusMap = useAtomValue(statusMsgMapAtom);
  const [profileStatus, setProfileStatus] = useState<CustomStatus | null | undefined>(undefined);
  const isOwn = !!userId && userId === ownId;

  useEffect(() => {
    setProfileStatus(undefined);
    if (!fetchProfile || !client || !userId || isOwn) return;
    let cancelled = false;
    void fetchCustomStatus(client, userId).then((status) => {
      if (!cancelled) setProfileStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, [client, userId, isOwn, fetchProfile]);

  if (!userId) return null;
  if (isOwn) return own && !isExpired(own) ? own.text : null;
  if (profileStatus) return profileStatus.text;
  return statusMap[userId] || null;
}
