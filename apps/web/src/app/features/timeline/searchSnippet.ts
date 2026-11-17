const SNIPPET_RADIUS = 140;

/** Trim a long body to a window around its first match, with ellipses where it was cut. */
export function makeSnippet(body: string, query: string): string {
  if (body.length <= SNIPPET_RADIUS * 2) return body;
  const at = body.toLowerCase().indexOf(query.trim().toLowerCase());
  if (at === -1) return `${body.slice(0, SNIPPET_RADIUS * 2)}…`;
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(body.length, at + SNIPPET_RADIUS);
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`;
}
