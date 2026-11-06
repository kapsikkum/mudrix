import { useEffect, useState } from 'react';
import type { WizardClient } from '@wizardchat/core';

/**
 * The content of the first of `types` the account has data for, kept current. Lists that moved
 * to a new name read the older names as a fallback, so nothing people stored is lost.
 */
export function useFirstAccountData(
  client: WizardClient | null | undefined,
  types: readonly string[]
): unknown {
  const key = types.join('\n');
  const [contents, setContents] = useState<Array<unknown>>(() => types.map(() => null));

  useEffect(() => {
    if (!client) return undefined;
    const names = key.split('\n');
    const subscriptions = names.map((type, index) =>
      client.watchAccountData(type, (content) =>
        setContents((prev) => {
          const next = prev.slice();
          next[index] = content ?? null;
          return next;
        })
      )
    );
    return () => subscriptions.forEach((s) => s.cancel());
  }, [client, key]);

  return contents.find((content) => content !== null && content !== undefined) ?? null;
}

/**
 * The same lookup once, without subscribing: what the server has for the first name that has
 * any (the last synced copy when it cannot be asked), so a change made a moment ago on this or
 * another device is not overwritten with a stale list.
 */
export async function readFirstAccountData(
  client: WizardClient,
  types: readonly string[]
): Promise<unknown> {
  for (const type of types) {
    const content = await client
      .accountData(type)
      .catch(() => client.cachedAccountData(type))
      .catch(() => null);
    if (content !== null && content !== undefined) return content;
  }
  return null;
}
