export type MatrixToTarget =
  | { kind: 'user'; userId: string }
  | { kind: 'room'; roomIdOrAlias: string; eventId: string | null; viaServers: string[] };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseMatrixToFragment(fragment: string): MatrixToTarget | null {
  const raw = fragment.replace(/^#?\/?/, '');
  if (!raw) return null;
  const queryIndex = raw.indexOf('?');
  const path = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
  const query = new URLSearchParams(queryIndex === -1 ? '' : raw.slice(queryIndex + 1));
  const [first, second] = path.split('/').map(safeDecode);
  if (!first) return null;

  if (first.startsWith('@') && first.includes(':')) return { kind: 'user', userId: first };
  if ((first.startsWith('!') || first.startsWith('#')) && first.includes(':')) {
    return {
      kind: 'room',
      roomIdOrAlias: first,
      eventId: second?.startsWith('$') ? second : null,
      viaServers: query.getAll('via').filter(Boolean),
    };
  }
  return null;
}

export function parseMatrixToUrl(url: string): MatrixToTarget | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)matrix\.to$/.test(parsed.hostname)) return null;
    return parseMatrixToFragment(parsed.hash);
  } catch {
    return null;
  }
}
