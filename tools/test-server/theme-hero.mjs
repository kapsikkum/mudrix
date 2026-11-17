#!/usr/bin/env node
import { connectCdp } from './cdp-client.mjs';
/**
 * README hero: the same chat once per theme, cut into diagonal slices side by side.
 *
 *   node tools/test-server/theme-hero.mjs [out.png] [--user ash] [--room general] [--themes A,B,...]
 *
 * Drives a browser started by participants.mjs (its login is reused), so run that first, e.g.
 * `npm run test-server:bots general ash:nocam`. Reloads the page once per theme, which leaves
 * any call.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gen = join(here, '.generated');
const seed = JSON.parse(readFileSync(join(gen, 'seed.json'), 'utf8'));
const bots = JSON.parse(readFileSync(join(gen, 'bots.json'), 'utf8'));
const env = JSON.parse(readFileSync(join(gen, 'env.json'), 'utf8'));
const sessions = JSON.parse(readFileSync(join(gen, 'sessions.json'), 'utf8'));
const APP = process.env.MUDRIX_APP_URL ?? 'http://localhost:5180';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const user = option('user', 'ash');
const roomKey = option('room', 'general');
const themes = option(
  'themes',
  'Carbon,Midnight,Forest,Parrot,Hallow,Crimson,Dracula,Ethereal,Daybreak,Sakura'
).split(',');
const out = args[0] ?? join(gen, 'theme-hero.png');
const WIDTH = 1600;
const HEIGHT = 900;
// Horizontal run of each cut from top to bottom.
const SKEW = 220;

// The theme is synced through account data, which wins over localStorage on load.
const SETTINGS_TYPE = 'io.github.kapsikkum.mudrix.settings';
const session = sessions[user];
const settingsUrl = `${env.homeserver}/_matrix/client/v3/user/${encodeURIComponent(session.user_id)}/account_data/${SETTINGS_TYPE}`;
const auth = { Authorization: `Bearer ${session.access_token}` };
const savedSettings = await fetch(settingsUrl, { headers: auth }).then((r) =>
  r.ok ? r.json() : {}
);
const putSettings = (content) =>
  fetch(settingsUrl, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(content),
  });

const port = bots.find((b) => b.user === user)?.port;
if (!port) throw new Error(`${user} is not running; start participants.mjs first`);
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page =
  targets.find((t) => t.type === 'page' && t.url.startsWith(APP)) ??
  targets.find((t) => t.type === 'page' && t.url === 'about:blank');
const { call, evaluate } = await connectCdp(page.webSocketDebuggerUrl);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await call('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: false,
});
const roomId = seed.rooms[roomKey];
const roomPath = roomKey.startsWith('dm') ? `/dm/${roomId}` : `/r/${roomId}`;

const shots = [];
for (const theme of themes) {
  await putSettings({ ...savedSettings, theme });
  await call('Page.navigate', { url: `${APP}${roomPath}` });
  // Wait for the timeline, then let avatars, images and fonts settle.
  await evaluate(`(async () => {
    for (let i = 0; i < 60; i++) {
      if (document.querySelector('[data-testid="videoTile"], [data-event-id]')) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  })()`);
  await wait(2500);
  const { data } = await call('Page.captureScreenshot', { format: 'png' });
  shots.push(data);
  console.log(`${theme}`);
}

// Compose in the page: slice i shows theme i, between two parallel diagonal cuts.
await call('Page.navigate', { url: 'about:blank' });
await wait(500);
const composed = await evaluate(`(async () => {
  const shots = ${JSON.stringify(shots)};
  const W = ${WIDTH}, H = ${HEIGHT}, SKEW = ${SKEW};
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  // Cuts spread across the width including the skew, so the first and last slices aren't slivers.
  const step = (W + SKEW) / shots.length;
  for (let i = 0; i < shots.length; i++) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + shots[i];
    await img.decode();
    const a = i * step, b = (i + 1) * step;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a, 0); ctx.lineTo(b, 0); ctx.lineTo(b - SKEW, H); ctx.lineTo(a - SKEW, H);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  // A thin light seam on each cut.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 1; i < shots.length; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step - SKEW, H); ctx.stroke();
  }
  return canvas.toDataURL('image/png').split(',')[1];
})()`);
writeFileSync(out, Buffer.from(composed, 'base64'));
console.log(out);
await putSettings(savedSettings);
await call('Page.navigate', { url: `${APP}${roomPath}` });
await wait(1000);
process.exit(0);
