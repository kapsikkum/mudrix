import { fetchIntegration, isForbiddenHost } from '../../../util/integrationFetch';
import { validateManifest, MAX_MANIFEST_BYTES, type RepoManifest } from './manifest';
import { OFFICIAL_REPO_URL } from './officialKeys';
import { fingerprintKey, isOfficialKey, isValidKey, verifyRepoSignature } from './signature';

/** Cap on the detached signature file (a 64-byte signature is 88 base64 characters). */
const MAX_SIGNATURE_BYTES = 1024;

/**
 * "Official" needs the official key AND the official address: an old release signed with the
 * official key could otherwise be hosted anywhere and still wear the badge, frozen in time.
 */
function isOfficialSource(url: string, key: string): boolean {
  if (!isOfficialKey(key)) return false;
  const official = parseRepoUrl(OFFICIAL_REPO_URL);
  return official.ok && official.url === url;
}

export type UrlResult = { ok: true; url: string } | { ok: false; error: string };
export type RepoFetchResult =
  | {
      ok: true;
      value: RepoManifest;
      key: string;
      fingerprint: string;
      serial: number;
      official: boolean;
      bytes?: Uint8Array;
    }
  | { ok: false; error: string };

/**
 * Normalises what the user typed into the URL to fetch. A github.com repo URL becomes the raw
 * repo.json at its root. Rejects http, credentials, ports and local/private hosts.
 */
export function parseRepoUrl(input: string): UrlResult {
  const text = (input ?? '').trim();
  if (!text) return { ok: false, error: 'Enter a repository URL' };
  if (text.length > 500) return { ok: false, error: 'URL is too long' };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, error: 'Not a valid URL' };
  }
  if (u.username || u.password)
    return { ok: false, error: 'URLs with credentials are not allowed' };
  const host = u.hostname.toLowerCase();
  if (u.protocol !== 'https:') return { ok: false, error: 'Only https URLs are allowed' };
  if (u.port) return { ok: false, error: 'URLs with a port are not allowed' };
  if (isForbiddenHost(host)) return { ok: false, error: 'That host is not allowed' };
  u.hash = '';

  if (host === 'github.com' || host === 'www.github.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const [owner, repoRaw] = parts;
    const repo = repoRaw?.replace(/\.git$/, '');
    const safe = /^[A-Za-z0-9._-]+$/;
    if (!owner || !repo || !safe.test(owner) || !safe.test(repo))
      return { ok: false, error: 'Use https://github.com/<owner>/<repo>' };
    let ref = 'HEAD';
    if (parts.length > 2) {
      if (parts[2] !== 'tree' || parts.length < 4)
        return { ok: false, error: 'Use https://github.com/<owner>/<repo>[/tree/<ref>]' };
      // Branch names may contain "/", so everything after /tree/ is the ref.
      ref = parts.slice(3).join('/');
      if (!/^[A-Za-z0-9._\-/]+$/.test(ref) || ref.split('/').includes('..'))
        return { ok: false, error: 'Invalid branch or tag name' };
    }
    return {
      ok: true,
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/repo.json`,
    };
  }
  return { ok: true, url: u.toString() };
}

/**
 * The one host a repository address talks to (repo.json and its signature). It is what the person
 * is shown before adding a repository, and the only host its downloads may reach. '' if unusable.
 */
export function repoHost(url: string): string {
  const parsed = parseRepoUrl(url);
  return parsed.ok ? new URL(parsed.url).hostname.toLowerCase() : '';
}

/** The detached signature lives next to repo.json: same URL plus ".sig". */
function signatureUrl(repoUrl: string): string {
  const u = new URL(repoUrl);
  u.pathname += '.sig';
  return u.toString();
}

/**
 * Downloads repo.json and repo.json.sig, checks the signature over the exact bytes with the key
 * the file carries, and only then runs the strict validator. Never throws.
 */
export async function fetchRepo(url: string): Promise<RepoFetchResult> {
  const checked = parseRepoUrl(url);
  if (!checked.ok) return checked;
  const allow = [repoHost(checked.url)];
  const [res, sigRes] = await Promise.all([
    fetchIntegration({
      url: checked.url,
      allow,
      expect: 'jsonFile',
      maxBytes: MAX_MANIFEST_BYTES,
    }),
    fetchIntegration({
      url: signatureUrl(checked.url),
      allow,
      expect: 'signature',
      maxBytes: MAX_SIGNATURE_BYTES,
    }),
  ]);
  if (!res.ok) return { ok: false, error: res.error };
  if (!sigRes.ok) {
    if (/ answered 404$/.test(sigRes.error))
      return { ok: false, error: 'This repository is not signed, so it cannot be added.' };
    return { ok: false, error: `Could not load the signature file: ${sigRes.error}` };
  }
  const json = res.json;
  const keyField = (json as { key?: unknown } | null)?.key;
  if (typeof keyField !== 'string' || !isValidKey(keyField))
    return { ok: false, error: 'The repository carries a malformed or missing signing key.' };
  const verified = await verifyRepoSignature(res.bytes, sigRes.text ?? '', keyField);
  if (!verified.ok) return verified;
  const parsed = validateManifest(json);
  if (!parsed.ok) return parsed;
  const fingerprint = await fingerprintKey(parsed.value.key);
  if (!fingerprint) return { ok: false, error: 'This device cannot compute the key fingerprint.' };
  return {
    ok: true,
    value: parsed.value,
    key: parsed.value.key,
    fingerprint,
    serial: parsed.value.serial,
    official: isOfficialSource(url, parsed.value.key),
    bytes: res.bytes,
  };
}
