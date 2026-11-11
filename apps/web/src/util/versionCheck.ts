// The version baked into the JS bundle at build time.
export const CURRENT_VERSION: string = import.meta.env.APP_VERSION ?? '0.0.0';

export async function fetchDeployedVersion(): Promise<string | null> {
  try {
    const res = await fetch('/version.txt', { cache: 'no-store' });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (!text || text.startsWith('<') || text.includes(' ')) return null;
    return text;
  } catch {
    return null;
  }
}

export type UpdateCheck = 'upToDate' | 'available' | 'error';

/** Asks the server which version is deployed now and compares it with the one running. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  const deployed = await fetchDeployedVersion();
  if (deployed === null) return 'error';
  return isNewerVersion(CURRENT_VERSION, deployed) ? 'available' : 'upToDate';
}

export function isNewerVersion(current: string, deployed: string): boolean {
  return deployed !== current;
}
