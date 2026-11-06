/** The official integrations repository, offered by default. */
export const OFFICIAL_REPO_URL = 'https://github.com/kapsikkum/mudrix-integrations';

/**
 * Ed25519 public keys (standard base64 of the raw 32 bytes) that count as "official".
 * It is a list so a key can be rotated later. Adding or removing a key requires an app
 * release; the private key is kept offline by the maintainer.
 */
export const OFFICIAL_REPO_KEYS: readonly string[] = [
  'AcV0kn9xQsh7H9G76k7cDoJWRAeAjhhqUTnc2hHw85A=',
];
