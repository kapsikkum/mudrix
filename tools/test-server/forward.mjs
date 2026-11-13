#!/usr/bin/env node
/**
 * Forwards the test server's ports from 127.0.0.1 (IPv4, this machine) to the container runtime's
 * VM, so `adb reverse` can hand them to a USB-connected phone or tablet. Start the stack with
 * `MUDRIX_TEST_MEDIA_HOST=127.0.0.1` so the LiveKit tokens point at the forwarded address too.
 *
 *   npm run test-server:forward
 *   adb reverse tcp:6167 tcp:6167    # plus 8090, 7880, 7881
 *
 * In the app on the phone, sign in to http://localhost:6167 (adb reverse maps the phone's own
 * localhost to this process). Ctrl+C stops the forwarder; the adb reverses stay until the phone
 * is unplugged or `adb reverse --remove-all` runs.
 */
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let env;
try {
  env = JSON.parse(readFileSync(join(here, '.generated', 'env.json'), 'utf8'));
} catch {
  console.error('No .generated/env.json. Start the stack first: npm run test-server');
  process.exit(1);
}
// Homeserver, lk-jwt, LiveKit signalling and LiveKit's TCP media. LiveKit's UDP media cannot be
// forwarded over adb; calls fall back to TCP (7881), which is slower but works.
const PORTS = [6167, 8090, 7880, 7881];

console.log('On the phone: adb reverse tcp:6167 tcp:6167 && adb reverse tcp:8090 tcp:8090 && \\');
console.log('  adb reverse tcp:7880 tcp:7880 && adb reverse tcp:7881 tcp:7881');
if (env.host !== '127.0.0.1') console.log(`Forwarding to the runtime VM at ${env.host}.`);

for (const port of PORTS) {
  net
    .createServer((client) => {
      const upstream = net.connect(port, env.host);
      client.pipe(upstream).pipe(client);
      const end = () => {
        client.destroy();
        upstream.destroy();
      };
      client.on('error', end);
      upstream.on('error', end);
      client.on('close', end);
      upstream.on('close', end);
    })
    .on('error', (e) => console.error(`127.0.0.1:${port}: ${e.code} (already forwarded?)`))
    .listen(port, '127.0.0.1', () => console.log(`127.0.0.1:${port} -> ${env.host}:${port}`));
}
