#!/usr/bin/env node
import { connectCdp } from './cdp-client.mjs';
/**
 * Fake call participants for the test server: headless Edge/Chrome instances, each signed in as
 * a seeded account with a fake camera and microphone, that open a room and join its call.
 * Keeps running until Ctrl+C. Ports and state go to .generated/bots.json for other scripts.
 *
 *   npm run test-server:bots general juno mira wren
 *   npm run test-server:bots dmJuno juno --no-camera
 *   npm run test-server:bots general ash juno mira:nocam   (per-user: no camera)
 *   npm run test-server:bots stop                          (kill the last run's bots)
 *
 * Room is a key from .generated/seed.json (general, dmJuno, ...). Needs the web app's dev server
 * on http://localhost:5180 (`npm run dev`); MUDRIX_APP_URL overrides it. The session is injected
 * into localStorage, so the bot does not have to type a password.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gen = join(here, '.generated');
let env;
let seed;
try {
  env = JSON.parse(readFileSync(join(gen, 'env.json'), 'utf8'));
  seed = JSON.parse(readFileSync(join(gen, 'seed.json'), 'utf8'));
} catch {
  console.error(
    'No .generated/env.json or seed.json. Run `npm run test-server` and `npm run test-server:seed`.'
  );
  process.exit(1);
}
const APP = process.env.MUDRIX_APP_URL ?? 'http://localhost:5180';
// The app version whose release notes were seen, so the What's new dialog does not cover the call.
const appVersion = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')).version;

const args = process.argv.slice(2);

/** Kills the browsers of a previous run; on Windows they outlive a killed parent. */
function stopPrevious() {
  const file = join(gen, 'bots.json');
  if (!existsSync(file)) return;
  for (const { pid } of JSON.parse(readFileSync(file, 'utf8'))) {
    if (!pid) continue;
    try {
      if (process.platform === 'win32') {
        // The browser's renderer/GPU children hold the profile and the CDP port too.
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(pid);
      }
    } catch {
      // already gone
    }
  }
  rmSync(file, { force: true });
}
stopPrevious();
if (args[0] === 'stop') process.exit(0);

const camera = !args.includes('--no-camera');
const [roomKey, ...names] = args.filter((a) => !a.startsWith('--'));
const roomId = seed.rooms[roomKey];
if (!roomId || names.length === 0) {
  console.error(
    `usage: participants.mjs <${Object.keys(seed.rooms).join('|')}> <user...> [--no-camera]`
  );
  process.exit(1);
}

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
];
const browser = process.env.MUDRIX_BROWSER ?? BROWSERS.find((p) => existsSync(p));
if (!browser) throw new Error('No Chromium-based browser found; set MUDRIX_BROWSER');

// Avatar colours from seed.mjs, reused for each bot's fake camera.
const COLOURS = {
  ash: [
    [94, 53, 177],
    [233, 30, 99],
  ],
  juno: [
    [0, 150, 136],
    [3, 169, 244],
  ],
  theo: [
    [96, 72, 48],
    [160, 120, 80],
  ],
  mira: [
    [255, 152, 0],
    [244, 67, 54],
  ],
  wren: [
    [76, 175, 80],
    [205, 220, 57],
  ],
  sable: [
    [33, 33, 33],
    [121, 85, 72],
  ],
};

/** A 2 s looping 640x360 clip: the user's gradient with a drifting soft light, as I420 .y4m. */
function writeCameraClip(user, file) {
  const W = 640;
  const H = 360;
  const FRAMES = 30;
  const [[r1, g1, b1], [r2, g2, b2]] = COLOURS[user] ?? COLOURS.ash;
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`)];
  const ySize = W * H;
  const cSize = (W / 2) * (H / 2);
  for (let f = 0; f < FRAMES; f += 1) {
    const a = (f / FRAMES) * Math.PI * 2;
    const lx = W * (0.5 + 0.28 * Math.cos(a));
    const ly = H * (0.5 + 0.22 * Math.sin(a));
    const frame = Buffer.alloc(ySize + 2 * cSize);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const t = (x / W + y / H) / 2;
        const glow = Math.max(0, 1 - Math.hypot(x - lx, y - ly) / (H * 0.7)) * 90;
        const r = Math.min(255, r1 + (r2 - r1) * t + glow);
        const g = Math.min(255, g1 + (g2 - g1) * t + glow);
        const b = Math.min(255, b1 + (b2 - b1) * t + glow);
        frame[y * W + x] = 0.299 * r + 0.587 * g + 0.114 * b;
        if (y % 2 === 0 && x % 2 === 0) {
          const ci = (y / 2) * (W / 2) + x / 2;
          frame[ySize + ci] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          frame[ySize + cSize + ci] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        }
      }
    }
    parts.push(Buffer.from('FRAME\n'), frame);
  }
  writeFileSync(file, Buffer.concat(parts));
}

/**
 * Reuses a bot's last session when it is still valid: the same device rejoining replaces its call
 * membership, where a fresh login would leave the old one in the call as a ghost tile until it
 * expires.
 */
const sessionsFile = join(gen, 'sessions.json');
const sessions = existsSync(sessionsFile) ? JSON.parse(readFileSync(sessionsFile, 'utf8')) : {};

async function login(user) {
  const saved = sessions[user];
  if (saved) {
    const check = await fetch(`${env.homeserver}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${saved.access_token}` },
    });
    if (check.ok) return { ...saved, reused: true };
  }
  const session = await freshLogin(user);
  sessions[user] = session;
  writeFileSync(sessionsFile, `${JSON.stringify(sessions, null, 2)}\n`);
  return session;
}

async function freshLogin(user) {
  const res = await fetch(`${env.homeserver}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user },
      password: seed.password,
      initial_device_display_name: `test bot (${user})`,
    }),
  });
  if (!res.ok) throw new Error(`login ${user}: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Minimal CDP client over a tab of our own. Managed browsers can open extra tabs at startup (Edge
 * opens a Bitwarden welcome page when that extension is policy-installed), so do not pick an
 * existing one.
 */
async function cdp(port) {
  let page = null;
  for (let i = 0; i < 40 && !page; i += 1) {
    try {
      page = await (
        await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
      ).json();
    } catch {
      await new Promise((r) => setTimeout(r, 250)); // browser still starting
    }
  }
  if (!page) throw new Error(`no browser on port ${port}`);
  return connectCdp(page.webSocketDebuggerUrl);
}

/**
 * Clears this device's call membership from every room. A browser killed mid-call never leaves,
 * and tuwunel ignores a re-join with identical content, which would leave the membership
 * looking expired: the bot would sit in its call unseen by everyone else.
 */
async function leaveStaleCalls(session) {
  const auth = { Authorization: `Bearer ${session.access_token}` };
  const base = `${env.homeserver}/_matrix/client/v3/rooms`;
  for (const roomId of Object.values(seed.rooms)) {
    const res = await fetch(`${base}/${encodeURIComponent(roomId)}/state`, { headers: auth });
    if (!res.ok) continue;
    for (const event of await res.json()) {
      if (event.type !== 'org.matrix.msc3401.call.member') continue;
      if (!event.state_key.includes(`${session.user_id}_${session.device_id}_`)) continue;
      if (!Object.keys(event.content).length) continue;
      await fetch(
        `${base}/${encodeURIComponent(roomId)}/state/org.matrix.msc3401.call.member/${encodeURIComponent(event.state_key)}`,
        {
          method: 'PUT',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: '{}',
        }
      );
    }
  }
}

const bots = [];
const shutdown = () => {
  for (const b of bots) b.proc.kill();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const roomPath = roomKey.startsWith('dm')
  ? `/dm/${encodeURIComponent(roomId)}`
  : `/r/${encodeURIComponent(roomId)}`;

for (const [i, spec] of names.entries()) {
  // `mira:nocam` joins without a camera.
  const [user, flag] = spec.split(':');
  const withCamera = camera && flag !== 'nocam';
  const port = 9300 + i;
  // Outside the repo: browser profiles churn, and the dev server must not watch them.
  const profile = join(tmpdir(), 'mudrix-test-bots', user);
  const session = await login(user);
  await leaveStaleCalls(session);
  // A reused device keeps its profile (its crypto store matches the device's keys); a new one
  // starts clean. A browser that was just killed can hold its profile for a moment.
  if (!session.reused)
    rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  mkdirSync(profile, { recursive: true });
  const clip = join(gen, `camera-${user}.y4m`);
  if (!existsSync(clip)) writeCameraClip(user, clip);

  const proc = spawn(
    browser,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--window-size=1280,800',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${clip}`,
      '--autoplay-policy=no-user-gesture-required',
      // The fake mic beeps; without this every bot plays the others' beeps on the speakers.
      '--mute-audio',
      // The client well-known (Caddy, local CA) is at https://mudrix.test/.well-known.
      `--host-resolver-rules=MAP mudrix.test ${env.host}`,
      '--ignore-certificate-errors',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  const { call, evaluate } = await cdp(port);
  await call('Page.enable');
  await call('Page.navigate', { url: `${APP}/` });
  await new Promise((r) => setTimeout(r, 1500));
  // The web app restores a session from localStorage; the store location and passphrase only
  // need to be stable per bot. The old app's keys are set too, so a bot can drive either app
  // while comparing.
  const creds = {
    userId: session.user_id,
    accessToken: session.access_token,
    deviceId: session.device_id,
    homeserverUrl: env.homeserver,
  };
  const stored = {
    active: creds.userId,
    accounts: {
      [creds.userId]: {
        session: {
          accessToken: creds.accessToken,
          deviceId: creds.deviceId,
          homeserverUrl: creds.homeserverUrl,
          userId: creds.userId,
        },
        store: {
          location: `mudrix-test-${creds.userId.replace(/[^a-zA-Z0-9]/g, '_')}`,
          passphrase: Buffer.from(`mudrix-test-store-${creds.userId}-0123456789`, 'utf8').toString(
            'base64'
          ),
        },
      },
    },
  };
  const localKeys = {
    wizardchat_accounts: JSON.stringify(stored),
    wz_accounts: JSON.stringify({ [creds.userId]: creds }),
    wz_active_account: creds.userId,
    wz_last_homeserver: creds.homeserverUrl,
    wz_whats_new_seen: JSON.stringify(appVersion),
    [`wz_whats_new_seen::${creds.userId}`]: JSON.stringify(appVersion),
    wz_verify_skipped_device: JSON.stringify(creds.deviceId),
    [`wz_verify_skipped_device::${creds.userId}`]: JSON.stringify(creds.deviceId),
  };
  await evaluate(`(() => {
    const values = ${JSON.stringify(localKeys)};
    for (const [key, value] of Object.entries(values)) {
      const name = key === 'wizardchat_accounts' ? 'wizardchat.accounts' : key;
      localStorage.setItem(name, value);
    }
    return true;
  })()`);
  await call('Page.navigate', { url: `${APP}${roomPath}` });

  // Wait for the room header's call button, then start or join the call.
  const joined = await evaluate(`(async () => {
    for (let i = 0; i < 120; i++) {
      const btn = [...document.querySelectorAll('button[aria-label]')].find((b) =>
        /^(Start call|Join call|Join here)$/.test(b.getAttribute('aria-label')) && !b.disabled);
      if (btn) { btn.click(); return btn.getAttribute('aria-label'); }
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  })()`);
  console.log(`${user}: ${joined ?? 'no call button found'} (CDP port ${port})`);
  bots.push({ user, port, proc, deviceId: session.device_id });

  if (!withCamera) continue;
  // Turn the camera on once the call's controls appear.
  await evaluate(`(async () => {
    for (let i = 0; i < 120; i++) {
      const btn = [...document.querySelectorAll('button[aria-label]')].find((b) =>
        /camera/i.test(b.getAttribute('aria-label')) && b.closest('[role=group]'));
      // Labels are actions: "Turn on camera" while it is off.
      if (btn) { if (/turn on/i.test(btn.getAttribute('aria-label'))) btn.click(); return true; }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  })()`);
}

writeFileSync(
  join(gen, 'bots.json'),
  `${JSON.stringify(
    bots.map(({ user, port, deviceId, proc }) => ({ user, port, deviceId, pid: proc.pid })),
    null,
    2
  )}\n`
);
console.log('Participants running; Ctrl+C to stop.');
