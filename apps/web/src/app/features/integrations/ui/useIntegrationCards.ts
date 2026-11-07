import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import '../gate';
import { grantsAtom, installedIntegrationsAtom, integrationSettingsAtom } from '../store';
import { findLinkLookup, matchLinkCard, type LinkCardMatch } from '../matching';
import type { LinkLookup } from '../manifest';

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const MAX_CARDS = 3;

export interface IntegrationCardData extends LinkCardMatch {
  url: string;
  iconDataUrl?: string;
  /** Set when the integration may look the link up on its approved host (`linkDetails`). */
  lookup?: { host: string; lookup: LinkLookup; allow: string[] };
}

/**
 * Local-only: matches links in a message body against installed link-card rules. No network
 * (a card with `lookup` may later ask its approved host, see useLinkDetails).
 */
export function useIntegrationCards(body?: string, formattedBody?: string): IntegrationCardData[] {
  const installed = useAtomValue(installedIntegrationsAtom);
  const grants = useAtomValue(grantsAtom);
  const stored = useAtomValue(integrationSettingsAtom);
  return useMemo(() => {
    if (installed.length === 0) return [];
    const seen = new Set<string>();
    const out: IntegrationCardData[] = [];
    for (const src of [body, formattedBody]) {
      for (const raw of src?.match(URL_RE) ?? []) {
        if (out.length >= MAX_CARDS) return out;
        const url = raw.replace(/[.,!?;:)"'\]]+$/, '');
        if (!seen.has(url)) {
          seen.add(url);
          const m = matchLinkCard(url, installed, grants, stored);
          if (m) {
            const lookup = findLinkLookup(m, installed, grants);
            out.push({
              ...m,
              url,
              iconDataUrl: installed.find((i) => i.id === m.integrationId)?.iconDataUrl,
              ...(lookup ? { lookup } : {}),
            });
          }
        }
      }
    }
    return out;
  }, [body, formattedBody, installed, grants, stored]);
}
