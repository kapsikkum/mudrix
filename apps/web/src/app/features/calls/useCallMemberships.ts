import { useEffect, useMemo, useState } from 'react';
import type { CallMember, WizardClient } from '@wizardchat/core';

export type CallMemberships = Map<string, CallMember[]>;

function sameMemberships(a: CallMember[] | undefined, b: CallMember[]): boolean {
  if (a === b) return true;
  if (!a || a.length !== b.length) return false;
  return a.every(
    (member, i) =>
      member.identity === b[i].identity &&
      member.intent === b[i].intent &&
      member.serviceUrl === b[i].serviceUrl
  );
}

export function useCallMemberships(
  client: WizardClient | null,
  roomIds: string[]
): CallMemberships {
  const roomIdsKey = useMemo(() => roomIds.join('|'), [roomIds]);
  const [memberships, setMemberships] = useState<CallMemberships>(new Map());

  useEffect(() => {
    if (!client) return;
    const watched = new Set(roomIdsKey ? roomIdsKey.split('|') : []);

    const subscriptions = [...watched].map((roomId) =>
      client.watchCallMembers(roomId, (members) => {
        setMemberships((prev) => {
          if (sameMemberships(prev.get(roomId), members)) return prev;
          const next = new Map(prev);
          next.set(roomId, members);
          return next;
        });
      })
    );

    setMemberships((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (!watched.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    return () => {
      for (const subscription of subscriptions) subscription.cancel();
    };
  }, [client, roomIdsKey]);

  return memberships;
}

export function uniqueMembers(members: CallMember[]): CallMember[] {
  const byUser = new Map<string, CallMember>();
  for (const member of members) {
    if (!byUser.has(member.userId)) byUser.set(member.userId, member);
  }
  return Array.from(byUser.values());
}
