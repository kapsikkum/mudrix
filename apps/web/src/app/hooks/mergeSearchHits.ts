import type { SearchHit } from '@wizardchat/core';

/** The hits of both pages, first come first served: the server can repeat one across pages. */
export function mergeHits(existing: SearchHit[], more: SearchHit[]): SearchHit[] {
  const seen = new Set(existing.map((hit) => hit.eventId));
  const added = more.filter((hit) => {
    if (seen.has(hit.eventId)) return false;
    seen.add(hit.eventId);
    return true;
  });
  return [...existing, ...added];
}
