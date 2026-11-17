#!/usr/bin/env node
/**
 * Local Matrix + MatrixRTC stack for testing Mudrix: tuwunel (homeserver), LiveKit (media),
 * lk-jwt-service (MatrixRTC tokens) and Caddy (HTTPS for the test server name). Runs in
 * whichever container runtime is installed, docker or podman. Nothing here is for production:
 * open registration with a known token, a fixed LiveKit secret, one throwaway database.
 *
 *   node tools/test-server/up.mjs          start (or restart) the stack
 *   node tools/test-server/up.mjs down     stop it, keep the data
 *   node tools/test-server/up.mjs reset    stop it and delete the homeserver's data
 *
 * Also `npm run test-server`, `npm run test-server:down`, `npm run test-server:reset`.
 *
 * The services listen on one address only: 127.0.0.1 with docker on Linux, or the private
 * address of the runtime's VM with podman on Windows/macOS (its port forwarding does not work
 * under WSL, so the containers share the VM's network). Either way the address is reachable from
 * this machine only; it is not a LAN address. `MUDRIX_TEST_HOST` overrides it, and
 * `MUDRIX_TEST_MEDIA_HOST` says which address clients should use to reach LiveKit (see
 * forward.mjs for phones over USB). The values the other scripts need are written to
 * `.generated/env.json`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '.generated');
const PREFIX = 'mudrix-test';
// Set MUDRIX_TEST_VOLUME to keep more than one throwaway database around (one per checkout, say).
const VOLUME = process.env.MUDRIX_TEST_VOLUME ?? `${PREFIX}-tuwunel`;
// Fixed on purpose: a test stack, not a deployment. Nothing outside this machine may use it.
const SECRET = 'mudrix-test-secret-not-for-production-use';
const HOMESERVER_PORT = 6167;
const LIVEKIT_PORT = 7880;
const JWT_PORT = 8090;

function installed(command) {
  try {
    execFileSync(command, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const runtime = process.env.MUDRIX_TEST_RUNTIME ?? (installed('podman') ? 'podman' : 'docker');
const container = (...args) => execFileSync(runtime, args, { encoding: 'utf8' }).trim();
const tryContainer = (...args) => {
  try {
    return container(...args);
  } catch {
    return null;
  }
};

/** The address the services bind to, and the one this machine reaches them on. */
function serviceHost() {
  if (process.env.MUDRIX_TEST_HOST) return process.env.MUDRIX_TEST_HOST;
  if (runtime === 'podman' && (process.platform === 'win32' || process.platform === 'darwin')) {
    const ip = tryContainer('machine', 'ssh', 'ip -4 -o addr show eth0')?.match(
      /inet (\d+\.\d+\.\d+\.\d+)/
    );
    if (!ip) {
      throw new Error(
        'Could not find the Podman VM address (is it running? `podman machine start`). ' +
          'Set MUDRIX_TEST_HOST to the address clients should use.'
      );
    }
    return ip[1];
  }
  return '127.0.0.1';
}

function stop() {
  for (const name of ['lk-jwt', 'federation-tls', 'livekit', 'tuwunel']) {
    tryContainer('rm', '-f', `${PREFIX}-${name}`);
  }
}

async function waitFor(label, url) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} did not come up at ${url}`);
}

const mode = process.argv[2] ?? 'up';
stop();
if (mode === 'down') {
  console.log('Stopped (the homeserver data is kept; `npm run test-server:reset` deletes it).');
  process.exit(0);
}
if (mode === 'reset') {
  tryContainer('volume', 'rm', VOLUME);
  for (const file of ['env.json', 'seed.json', 'sessions.json', 'bots.json']) {
    rmSync(join(out, file), { force: true });
  }
  console.log('Stopped and deleted the homeserver data. Run `npm run test-server` next.');
  process.exit(0);
}
if (mode !== 'up') {
  console.error(`usage: node tools/test-server/up.mjs [up|down|reset]  (got "${mode}")`);
  process.exit(1);
}

const host = serviceHost();
// Where clients are told to reach LiveKit. A phone or tablet cannot reach the runtime VM's
// address, so MUDRIX_TEST_MEDIA_HOST=127.0.0.1 plus forward.mjs and `adb reverse` lets one
// through USB.
const mediaHost = process.env.MUDRIX_TEST_MEDIA_HOST ?? host;
mkdirSync(out, { recursive: true });
for (const file of ['tuwunel.toml', 'livekit.yaml', 'Caddyfile']) {
  const text = readFileSync(join(here, file), 'utf8')
    .replaceAll('__HOST__', host)
    .replaceAll('__MEDIA_HOST__', mediaHost);
  writeFileSync(join(out, file), text);
}

const boot = (name, ...args) =>
  container('run', '-d', '--name', `${PREFIX}-${name}`, '--network', 'host', ...args);

boot(
  'tuwunel',
  '-e',
  'TUWUNEL_CONFIG=/etc/tuwunel.toml',
  '-v',
  `${join(out, 'tuwunel.toml')}:/etc/tuwunel.toml:ro`,
  '-v',
  `${VOLUME}:/var/lib/tuwunel`,
  'ghcr.io/matrix-construct/tuwunel:latest'
);
boot(
  'livekit',
  '-v',
  `${join(out, 'livekit.yaml')}:/etc/livekit.yaml:ro`,
  'docker.io/livekit/livekit-server:latest',
  '--config',
  '/etc/livekit.yaml'
);
// HTTPS for the test server name, with Caddy's own CA (see Caddyfile): the client well-known
// that advertises LiveKit to call clients, and the federation endpoint lk-jwt-service may use.
boot(
  'federation-tls',
  '-v',
  `${join(out, 'Caddyfile')}:/etc/caddy/Caddyfile:ro`,
  'docker.io/library/caddy:2'
);
boot(
  'lk-jwt',
  // The token service checks logins over federation at the server name, which has no DNS here;
  // point it at the Caddy container on this machine, which fronts the homeserver with TLS.
  '--add-host',
  `mudrix.test:${host}`,
  '-e',
  `LIVEKIT_JWT_BIND=${host}:${JWT_PORT}`,
  '-e',
  `LIVEKIT_URL=ws://${mediaHost}:${LIVEKIT_PORT}`,
  '-e',
  'LIVEKIT_KEY=devkey',
  '-e',
  `LIVEKIT_SECRET=${SECRET}`,
  '-e',
  'LIVEKIT_FULL_ACCESS_HOMESERVERS=mudrix.test',
  // The token service checks Matrix logins against the homeserver; mudrix.test has no DNS here.
  '-e',
  `LIVEKIT_CS_API_URL_OVERRIDES=mudrix.test=http://${host}:${HOMESERVER_PORT}`,
  '-e',
  'LIVEKIT_INSECURE_SKIP_VERIFY_TLS=YES_I_KNOW_WHAT_I_AM_DOING',
  'ghcr.io/element-hq/lk-jwt-service:latest'
);

const env = {
  host,
  homeserver: `http://${host}:${HOMESERVER_PORT}`,
  serverName: 'mudrix.test',
  registrationToken: 'mudrix-test',
  livekit: `ws://${mediaHost}:${LIVEKIT_PORT}`,
  jwt: `http://${host}:${JWT_PORT}`,
  runtime,
};
writeFileSync(join(out, 'env.json'), `${JSON.stringify(env, null, 2)}\n`);

await waitFor('tuwunel', `${env.homeserver}/_matrix/client/versions`);
await waitFor('LiveKit', `http://${env.host}:${LIVEKIT_PORT}/`);
await waitFor('lk-jwt-service', `${env.jwt}/healthz`);
console.log(`Up (${runtime}). Homeserver ${env.homeserver}, server name ${env.serverName}.`);
console.log(
  `Next: \`npm run test-server:seed\`, then sign in as ash with the server ${env.host}:6167\n` +
    '(web: npm run dev, then http://localhost:5180/welcome/' +
    `${env.host}:6167).`
);
