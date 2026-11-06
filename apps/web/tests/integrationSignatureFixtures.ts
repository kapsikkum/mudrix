/**
 * Fixtures for signature.ts. `runSignatureExamples()` returns the names of failing cases; empty = all
 * good. If this runtime cannot do Ed25519 it reports a single named failure instead of throwing.
 */
import { OFFICIAL_REPO_KEYS } from '../src/app/features/integrations/officialKeys.ts';
import {
  base64ToBytes,
  checkRepoUpdate,
  checkSerial,
  fingerprintKey,
  isOfficialKey,
  verifyRepoSignature,
} from '../src/app/features/integrations/signature.ts';

const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

const flip = (bytes: Uint8Array, at: number): Uint8Array => {
  const copy = new Uint8Array(bytes);
  copy[at] ^= 1;
  return copy;
};

export async function runSignatureExamples(): Promise<string[]> {
  const problems: string[] = [];
  const check = (name: string, cond: boolean) => {
    if (!cond) problems.push(name);
  };

  try {
    const message = new TextEncoder().encode('{"schema":1,"name":"Sample"}');
    const gen = async () =>
      (await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])) as CryptoKeyPair;
    const pub = async (p: CryptoKeyPair) =>
      toB64(new Uint8Array(await crypto.subtle.exportKey('raw', p.publicKey)));
    const sign = async (p: CryptoKeyPair, m: Uint8Array) =>
      new Uint8Array(await crypto.subtle.sign('Ed25519', p.privateKey, m as BufferSource));

    const pair = await gen();
    const key = await pub(pair);
    const sig = await sign(pair, message);
    const sigB64 = toB64(sig);

    check('sig:good', (await verifyRepoSignature(message, sigB64, key)).ok);
    check('sig:goodWhitespace', (await verifyRepoSignature(message, `\n ${sigB64}  \n`, key)).ok);
    check('sig:flippedMessage', !(await verifyRepoSignature(flip(message, 3), sigB64, key)).ok);
    check(
      'sig:flippedSignature',
      !(await verifyRepoSignature(message, toB64(flip(sig, 10)), key)).ok
    );
    const other = await pub(await gen());
    check('sig:wrongKey', !(await verifyRepoSignature(message, sigB64, other)).ok);
    check('sig:truncated', !(await verifyRepoSignature(message, toB64(sig.slice(0, 63)), key)).ok);
    check('sig:garbage', !(await verifyRepoSignature(message, '!!not base64!!', key)).ok);
    check('sig:empty', !(await verifyRepoSignature(message, '', key)).ok);
    check('key:short', !(await verifyRepoSignature(message, sigB64, toB64(new Uint8Array(31)))).ok);
    check('key:long', !(await verifyRepoSignature(message, sigB64, toB64(new Uint8Array(33)))).ok);
    check('key:garbage', !(await verifyRepoSignature(message, sigB64, 'garbage')).ok);
  } catch {
    problems.push('runtime:ed25519-unavailable');
  }

  // Everything below needs only SHA-256 and pure logic.
  const official = OFFICIAL_REPO_KEYS[0];
  check(
    'fingerprint:official',
    (await fingerprintKey(official)) === '080e ffe6 20f6 a24d fdaf de75 dd9b 8e71'
  );
  check(
    'fingerprint:format',
    /^([0-9a-f]{4} ){7}[0-9a-f]{4}$/.test(await fingerprintKey(official))
  );
  check('fingerprint:badKey', (await fingerprintKey('AAAA')) === '');
  check('base64:strict', base64ToBytes('AAA') === null && base64ToBytes('AA=A') === null);
  check('base64:ok', base64ToBytes('AAAA')?.length === 3);

  const k1 = 'AcV0kn9xQsh7H9G76k7cDoJWRAeAjhhqUTnc2hHw85A=';
  const k2 = 'BBCkDWX+I1E0LatjaZwEUWCdjQG+roO4/udFi4AhyvM=';
  check('update:higher', checkRepoUpdate({ key: k1, serial: 1 }, { key: k1, serial: 2 }).ok);
  check('update:equal', checkRepoUpdate({ key: k1, serial: 2 }, { key: k1, serial: 2 }).ok);
  check('update:lower', !checkRepoUpdate({ key: k1, serial: 3 }, { key: k1, serial: 2 }).ok);
  const changed = checkRepoUpdate({ key: k1, serial: 1 }, { key: k2, serial: 9 });
  check('update:differentKey', !changed.ok && changed.keyChanged === true);
  check('serial:first', checkSerial(undefined, 1).ok);
  check('serial:lower', !checkSerial(5, 4).ok);

  check('official:yes', isOfficialKey(official));
  check('official:no', !isOfficialKey(k2));
  return problems;
}
