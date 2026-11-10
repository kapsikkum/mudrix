#!/usr/bin/env node
/**
 * Mudrix Visual Parity Comparison Harness.
 *
 * Screenshots every screen in screens.mjs in the old app (http://localhost:8080) and the new app
 * (http://localhost:5180) at three widths (1440 desktop, 820 tablet, 390 phone), always in the
 * default theme (Carbon), then diffs them with pixelmatch and writes out/report.md.
 *
 * Both apps are signed in as the local throwaway account @theo:mudrix.test by injecting an access
 * token. Screens that need another display mode (message layout, chat density, text size) declare
 * `display`; the harness writes it to the account's settings event (both apps re-apply that after
 * every sync) and to localStorage before opening the screen.
 *
 * Usage:
 *   node run.mjs                         # all screens
 *   node run.mjs --screen <id>[,<id>..]  # one screen / a batch (a bare <id> argument works too)
 *   node run.mjs --screen <id> --apps=new   # only re-capture one app (old|new), then re-diff
 *   node run.mjs --report-only           # re-diff existing captures and rewrite report.md
 *
 * A capture is tried twice; after that it is recorded in out/failures.json as "capture failed:
 * <reason>" and shown in the report. The report always covers every screen that has captures in
 * out/, so running in batches still ends with a complete report.
 */
import { chromium } from 'playwright';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREENS } from './screens.mjs';
import { compareImages } from './diff.mjs';
import { runSeed } from './seed.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');
const oldDir = join(outDir, 'old');
const newDir = join(outDir, 'new');
const diffDir = join(outDir, 'diff');
const failuresFile = join(outDir, 'failures.json');

mkdirSync(oldDir, { recursive: true });
mkdirSync(newDir, { recursive: true });
mkdirSync(diffDir, { recursive: true });

const WIDTHS = [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 820, height: 1180, name: 'tablet' },
  { width: 390, height: 844, name: 'phone' },
];

/** What every screen without its own `display` is captured with (the apps' defaults). */
const DEFAULT_DISPLAY = { messageLayout: 'modern', chatDensity: 'default', chatFontSize: 15 };
const DEFAULT_THEME = 'Carbon';

// Both apps mirror theme and preferences to Matrix account data and re-apply it after every sync,
// overriding whatever localStorage says. Both read (and write) these two types.
const SETTINGS_TYPES = ['io.github.kapsikkum.mudrix.settings', 'chat.mudrix.settings'];

// UI state the apps keep in localStorage (selected space, last room per space, ...). It leaks
// from one screen to the next, and differently in each app, so it is cleared before every screen.
const UI_STATE_KEYS = [
  'wz_current_space',
  'wz_last_rooms',
  'wz_sidebar_view',
  'wz_closed_nav_categories',
  'wz_open_lobby_categories',
  'wz_pinned_subspaces',
];

const args = process.argv.slice(2);
const flagValue = (name) => {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
};
const reportOnly = args.includes('--report-only');
const screenArg =
  flagValue('screen') ??
  args.find(
    (a, i) => !a.startsWith('--') && !(args[i - 1] === '--screen' || args[i - 1] === '--apps')
  );
const appsArg = flagValue('apps');
const appsToRun = appsArg ? appsArg.split(',') : ['old', 'new'];

async function checkServer(url) {
  try {
    const res = await fetch(url);
    if (res.status === 200) return true;
  } catch {
    // not running
  }
  return false;
}

async function matrix(env, theo, method, path, body) {
  const res = await fetch(`${env.homeserver}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${theo.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json().catch(() => ({}));
}

/** Writes theme + display mode into the account's settings so the apps' own sync agrees. */
async function setAccountDisplay(env, theo, display) {
  const user = encodeURIComponent(theo.user_id);
  for (const type of SETTINGS_TYPES) {
    const path = `/_matrix/client/v3/user/${user}/account_data/${type}`;
    const current = (await matrix(env, theo, 'GET', path)) ?? {};
    const rest = { ...current };
    delete rest.messageLayoutMobile;
    await matrix(env, theo, 'PUT', path, {
      ...rest,
      theme: DEFAULT_THEME,
      customThemes: [],
      messageLayout: display.messageLayout,
      preferences: {
        ...(current.preferences ?? {}),
        followSystemTheme: false,
        chatDensity: display.chatDensity,
        chatFontSize: display.chatFontSize,
      },
    });
  }
}

async function loadRoomNames(env, theo, seed) {
  const names = {};
  for (const [key, roomId] of Object.entries(seed.rooms)) {
    const path = `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name`;
    const content = await matrix(env, theo, 'GET', path);
    if (content?.name) names[key] = content.name;
  }
  return names;
}

async function dismissWhatsNew(page) {
  const gotItBtn = page.locator('button:has-text("Got it")').first();
  if (await gotItBtn.isVisible().catch(() => false)) {
    await gotItBtn.click({ timeout: 2000 }).catch(() => {});
  }
}

async function waitAppReady(page, authed) {
  await page
    .locator('[class*="AppLoading_overlay"]')
    .waitFor({ state: 'detached', timeout: authed ? 120000 : 20000 })
    .catch(() => {});
  if (authed) {
    // The room list streams in after the overlay goes
    await page
      .locator('text=/jump back in/i')
      .first()
      .waitFor({ state: 'visible', timeout: 30000 })
      .catch(() => {});
  }
  await dismissWhatsNew(page);
  await page.waitForTimeout(500);
}

/** Puts the default theme and `display` into the account settings and localStorage. */
async function applyDisplay(page, display, { env, theo }) {
  // Let any settings push from the previous page settle so it cannot overwrite the write below
  await page.waitForTimeout(800);
  await setAccountDisplay(env, theo, display);
  await page.evaluate(
    ({ display, theme, uiKeys }) => {
      localStorage.setItem('wz_theme', JSON.stringify(theme));
      localStorage.removeItem('wz_custom_themes');
      localStorage.setItem('wz_message_layout', JSON.stringify(display.messageLayout));
      localStorage.removeItem('wz_message_layout_mobile');
      let prefs = {};
      try {
        prefs = JSON.parse(localStorage.getItem('wz_preferences')) ?? {};
      } catch {
        // unreadable: start over
      }
      localStorage.setItem(
        'wz_preferences',
        JSON.stringify({
          ...prefs,
          followSystemTheme: false,
          chatDensity: display.chatDensity,
          chatFontSize: display.chatFontSize,
        })
      );
      uiKeys.forEach((k) => localStorage.removeItem(k));
    },
    { display, theme: DEFAULT_THEME, uiKeys: UI_STATE_KEYS }
  );
}

/** Reads back what the app holds after loading; null when it matches `display`. */
async function displayMismatch(page, display) {
  const got = await page
    .evaluate(() => {
      const parse = (k) => {
        try {
          return JSON.parse(localStorage.getItem(k));
        } catch {
          return localStorage.getItem(k);
        }
      };
      return {
        theme: parse('wz_theme'),
        messageLayout: parse('wz_message_layout'),
        prefs: parse('wz_preferences') ?? {},
      };
    })
    .catch(() => null);
  if (!got) return 'could not read settings back';
  const problems = [];
  if (got.theme !== DEFAULT_THEME) problems.push(`theme=${got.theme}`);
  if (got.messageLayout !== display.messageLayout)
    problems.push(`messageLayout=${got.messageLayout} (wanted ${display.messageLayout})`);
  if ((got.prefs.chatDensity ?? 'default') !== display.chatDensity)
    problems.push(`chatDensity=${got.prefs.chatDensity} (wanted ${display.chatDensity})`);
  if ((got.prefs.chatFontSize ?? 15) !== display.chatFontSize)
    problems.push(`chatFontSize=${got.prefs.chatFontSize} (wanted ${display.chatFontSize})`);
  return problems.length ? problems.join(', ') : null;
}

function readFailures() {
  try {
    return JSON.parse(readFileSync(failuresFile, 'utf8'));
  } catch {
    return {};
  }
}

const failures = readFailures();
const saveFailures = () => writeFileSync(failuresFile, JSON.stringify(failures, null, 2));

async function captureAppScreens(appName, port, screens, seed, env, sessions, names) {
  console.log(`\n========================================`);
  console.log(`  Capturing ${appName.toUpperCase()} app on port ${port}`);
  console.log(`========================================`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const unauthScreens = screens.filter((s) => !s.requiresAuth);
  const authScreens = screens.filter((s) => s.requiresAuth);

  const patchGoto = (page) => {
    // The dev servers keep long-lived requests open, so waiting for "load" can time out
    const goto = page.goto.bind(page);
    page.goto = (url, opts = {}) =>
      goto(url, { waitUntil: 'domcontentloaded', timeout: 60000, ...opts });
  };

  const capture = async (page, screen, width, height, authed, display) => {
    const fileKey = `${screen.id}-${width}`;
    const failKey = `${appName}:${fileKey}`;
    const outPath = join(outDir, appName, `${fileKey}.png`);
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        if (authed) {
          await page
            .evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), UI_STATE_KEYS)
            .catch(() => {});
        }
        await screen.navigate(page, {
          port,
          seed,
          env,
          names,
          hsUrl: env.homeserver,
          width,
          height,
        });
        await page.waitForTimeout(400);
        if (authed) {
          const mismatch = await displayMismatch(page, display);
          if (mismatch) throw new Error(`settings not applied: ${mismatch}`);
        }
        if (screen.noRawId) {
          // The room header shows the raw room id until the app has the room's name
          const raw = await page
            .evaluate(() => /![A-Za-z0-9]{10,}:[\w.-]+/.test(document.body.innerText))
            .catch(() => false);
          if (raw) throw new Error('room name not loaded (raw room id shown)');
        }
        await page.screenshot({ path: outPath, fullPage: false });
        delete failures[failKey];
        return;
      } catch (err) {
        lastError = err;
        console.warn(`[${appName}] attempt ${attempt} failed for ${fileKey}: ${err.message}`);
      } finally {
        if (screen.cleanup) await screen.cleanup(page).catch(() => {});
      }
    }
    failures[failKey] = `capture failed: ${String(lastError?.message ?? lastError).split('\n')[0]}`;
  };

  // 1. Unauthenticated screens
  if (unauthScreens.length > 0) {
    console.log(
      `\n[${appName}] --- Capturing ${unauthScreens.length} unauthenticated screen(s) ---`
    );
    const unauthCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    await unauthCtx.addInitScript((hs) => {
      localStorage.setItem('wz_last_homeserver', hs);
    }, env.homeserver);
    const page = await unauthCtx.newPage();
    patchGoto(page);
    await page.goto(`http://localhost:${port}/welcome`);
    await waitAppReady(page, false);

    for (const { width, height } of WIDTHS) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(300);
      for (const screen of unauthScreens) {
        await capture(page, screen, width, height, false, DEFAULT_DISPLAY);
      }
    }
    await unauthCtx.close();
  }

  // 2. Authenticated screens
  if (authScreens.length > 0) {
    console.log(
      `\n[${appName}] --- Authenticating and capturing ${authScreens.length} screen(s) ---`
    );
    const authCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });

    const theo = sessions.theo;
    const storeLocation = 'wizardchat-session-' + theo.user_id.replace(/[^a-zA-Z0-9]/g, '_');
    const storePassphrase = btoa('12345678901234567890123456789012');
    const wnVersion = '26.10.18';

    await authCtx.addInitScript(
      ({ token, hs, userId, deviceId, storeLocation, storePassphrase, wnVersion }) => {
        localStorage.setItem(
          'wizardchat.accounts',
          JSON.stringify({
            active: userId,
            accounts: {
              [userId]: {
                session: {
                  accessToken: token,
                  deviceId: deviceId,
                  homeserverUrl: hs,
                  userId: userId,
                },
                store: {
                  location: storeLocation,
                  passphrase: storePassphrase,
                },
              },
            },
          })
        );
        localStorage.setItem(
          'wz_accounts',
          JSON.stringify({
            [userId]: { userId, accessToken: token, deviceId, homeserverUrl: hs },
          })
        );
        localStorage.setItem('wz_active_account', userId);
        localStorage.setItem('wz_user_id', userId);
        localStorage.setItem('wz_last_homeserver', hs);
        localStorage.setItem('wz_whats_new_seen', JSON.stringify(wnVersion));
        localStorage.setItem(`wz_whats_new_seen::${userId}`, JSON.stringify(wnVersion));
        localStorage.setItem('wz_verify_skipped_device', JSON.stringify(deviceId));
        localStorage.setItem(`wz_verify_skipped_device::${userId}`, JSON.stringify(deviceId));
        // Only seeded once: applyDisplay changes these and they must survive reloads
        if (!localStorage.getItem('wz_preferences')) {
          localStorage.setItem(
            'wz_preferences',
            JSON.stringify({
              followSystemTheme: false,
              systemDarkTheme: 'Carbon',
              systemLightTheme: 'Ethereal',
            })
          );
        }
      },
      {
        token: theo.access_token,
        hs: env.homeserver,
        userId: theo.user_id,
        deviceId: theo.device_id,
        storeLocation,
        storePassphrase,
        wnVersion,
      }
    );

    const page = await authCtx.newPage();
    patchGoto(page);
    page.on('pageerror', (err) =>
      console.error(`[${appName} pageerror]`, err.stack || err.message)
    );

    // First load: the initial sync of the whole account takes a while
    await setAccountDisplay(env, theo, DEFAULT_DISPLAY);
    await page.goto(`http://localhost:${port}/`);
    await waitAppReady(page, true);
    console.log(`[${appName}] Initial sync completed!`);

    // Group by display mode so the settings change as rarely as possible
    const groups = new Map();
    for (const screen of authScreens) {
      const display = { ...DEFAULT_DISPLAY, ...(screen.display ?? {}) };
      const key = JSON.stringify(display);
      if (!groups.has(key)) groups.set(key, { display, screens: [] });
      groups.get(key).screens.push(screen);
    }
    const ordered = [...groups.values()].sort(
      (a, b) =>
        Number(JSON.stringify(b.display) === JSON.stringify(DEFAULT_DISPLAY)) -
        Number(JSON.stringify(a.display) === JSON.stringify(DEFAULT_DISPLAY))
    );

    for (const { display, screens: group } of ordered) {
      console.log(`[${appName} | auth] Display: ${JSON.stringify(display)}`);
      await applyDisplay(page, display, { env, theo });
      for (const { width, height } of WIDTHS) {
        console.log(`[${appName} | auth] Viewport: ${width}x${height}`);
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(300);
        for (const screen of group) {
          await capture(page, screen, width, height, true, display);
        }
      }
    }
    await setAccountDisplay(env, theo, DEFAULT_DISPLAY).catch(() => {});
    await authCtx.close();
  }

  await browser.close();
}

function buildReport() {
  console.log('\n=== Computing pixel diffs ===');
  const results = [];
  const notCaptured = [];

  for (const screen of SCREENS) {
    let any = false;
    for (const { width } of WIDTHS) {
      const fileKey = `${screen.id}-${width}`;
      const oldFile = join(oldDir, `${fileKey}.png`);
      const newFile = join(newDir, `${fileKey}.png`);
      if (!existsSync(oldFile) && !existsSync(newFile)) continue;
      any = true;
      const diffResult = compareImages(oldFile, newFile, join(diffDir, `${fileKey}.png`));
      results.push({
        id: screen.id,
        title: screen.title,
        notMeaningful: screen.notMeaningful,
        width,
        fileKey,
        diffPercent: diffResult.diffPercent,
        missing: Boolean(diffResult.error),
      });
    }
    if (!any) notCaptured.push(screen.id);
  }

  results.sort((a, b) => b.diffPercent - a.diffPercent);
  const meaningful = results.filter((r) => !r.notMeaningful && !r.missing);
  const avgDiff =
    meaningful.length > 0
      ? (meaningful.reduce((acc, r) => acc + r.diffPercent, 0) / meaningful.length).toFixed(2)
      : '0';

  const pct = (n) => `${n.toFixed(2)}%`;
  const notMeaningfulText = (s) => `not meaningful (${s.notMeaningful})`;
  let report = `# Mudrix Visual Parity Report\n\n`;
  report += `Generated at: ${new Date().toISOString()}\n`;
  report += `Theme: ${DEFAULT_THEME} (default) in both apps. Screens captured: ${SCREENS.length - notCaptured.length} of ${SCREENS.length}\n`;
  report += `Total comparisons: ${results.length}\n`;
  report += `Average pixel difference (excluding not-meaningful screens and missing captures): **${avgDiff}%**\n\n`;
  if (notCaptured.length)
    report += `Not captured: ${notCaptured.map((s) => `\`${s}\``).join(', ')}\n\n`;
  report += `† = not meaningful (no call connects on the test server), shown for completeness only.\n\n`;

  const failureLines = Object.entries(failures).filter(([k]) =>
    SCREENS.some((s) => k.split(':')[1].startsWith(`${s.id}-`))
  );
  if (failureLines.length) {
    report += `## Capture failures\n\n`;
    for (const [key, reason] of failureLines) report += `- \`${key}\`: ${reason}\n`;
    report += `\n`;
  }

  report += `## Per-screen summary (max diff % per width)\n\n`;
  report += `| Screen | 1440 | 820 | 390 | Max |\n`;
  report += `| :--- | ---: | ---: | ---: | ---: |\n`;
  const summaryRows = [];
  for (const screen of SCREENS) {
    const rows = results.filter((r) => r.id === screen.id);
    if (!rows.length) continue;
    const maxes = WIDTHS.map(({ width }) => {
      const rs = rows.filter((r) => r.width === width);
      return rs.length ? Math.max(...rs.map((r) => r.diffPercent)) : null;
    });
    const overall = Math.max(...maxes.filter((m) => m !== null));
    summaryRows.push({ screen, maxes, overall, missing: rows.some((r) => r.missing) });
  }
  summaryRows.sort((a, b) => b.overall - a.overall);
  for (const { screen, maxes, overall } of summaryRows) {
    const label = screen.notMeaningful ? `\`${screen.id}\` †` : `\`${screen.id}\``;
    const max = screen.notMeaningful ? notMeaningfulText(screen) : `**${pct(overall)}**`;
    report += `| ${label} | ${maxes.map((m) => (m === null ? '-' : pct(m))).join(' | ')} | ${max} |\n`;
  }

  report += `\n## Ranked differences (worst first)\n\n`;
  report += `| Rank | Screen | Width | Diff % | Old | New | Diff |\n`;
  report += `| ---: | :--- | ---: | ---: | :--- | :--- | :--- |\n`;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const mark = r.notMeaningful ? ' †' : '';
    const diffDisplay = r.missing
      ? failures[`new:${r.fileKey}`] || failures[`old:${r.fileKey}`] || 'missing'
      : pct(r.diffPercent);
    report += `| ${i + 1} | \`${r.id}\`${mark} | ${r.width} | **${diffDisplay}** | [old](old/${r.fileKey}.png) | [new](new/${r.fileKey}.png) | [diff](diff/${r.fileKey}.png) |\n`;
  }

  writeFileSync(join(outDir, 'report.md'), report);
  writeFileSync(
    join(outDir, 'report.json'),
    JSON.stringify(
      {
        results,
        failures,
        summary: summaryRows.map(({ screen, maxes, overall }) => ({
          id: screen.id,
          maxes,
          overall,
        })),
      },
      null,
      2
    )
  );
  console.log(`Report written to: ${join(outDir, 'report.md')} (${results.length} rows)`);

  console.log('\nTOP 15 WORST');
  for (let i = 0; i < Math.min(15, results.length); i++) {
    const r = results[i];
    console.log(
      `${(i + 1).toString().padStart(2, ' ')}. ${r.id.padEnd(28)} @${r.width.toString().padEnd(4)} -> ${r.diffPercent.toFixed(2)}%`
    );
  }
}

async function main() {
  console.log('=== Mudrix Visual Parity Comparison Harness ===');

  if (reportOnly) {
    buildReport();
    return;
  }

  // 1. Seed data and test server
  const seedFile = join(here, 'seed-data.json');
  const seed = existsSync(seedFile) ? JSON.parse(readFileSync(seedFile, 'utf8')) : await runSeed();

  const envFile = 'E:/code/web/mudrix-web/dev/test-server/.generated/env.json';
  if (!existsSync(envFile)) {
    throw new Error('Test server env.json not found! Run up.mjs in mudrix-web/dev/test-server.');
  }
  const env = JSON.parse(readFileSync(envFile, 'utf8'));

  const sessionsFile = 'E:/code/web/mudrix-web/dev/test-server/.generated/sessions.json';
  if (!existsSync(sessionsFile)) {
    throw new Error('Test server sessions.json not found!');
  }
  const sessions = JSON.parse(readFileSync(sessionsFile, 'utf8'));

  // 2. Check the test server and the apps that are going to be captured
  if (!(await checkServer(`${env.homeserver}/_matrix/client/versions`))) {
    throw new Error(
      `Test homeserver is not reachable at ${env.homeserver}! Start it: podman machine start, then node dev/test-server/up.mjs in mudrix-web.`
    );
  }
  if (appsToRun.includes('old') && !(await checkServer('http://localhost:8080/')))
    throw new Error(
      'Old app is not running at http://localhost:8080! Start it with npm start in mudrix-web.'
    );
  if (appsToRun.includes('new') && !(await checkServer('http://localhost:5180/')))
    throw new Error('New app is not running at http://localhost:5180! Start it with npm run dev.');

  const filterIds = screenArg ? new Set(screenArg.split(',').map((s) => s.trim())) : null;
  const screensToRun = filterIds ? SCREENS.filter((s) => filterIds.has(s.id)) : SCREENS;

  if (screensToRun.length === 0) {
    console.error(
      `No screen matching "${screenArg}". Available IDs:\n` + SCREENS.map((s) => s.id).join(', ')
    );
    process.exit(1);
  }

  // Drop captures of the screens about to be re-run (and on a full run, every leftover image such
  // as the old per-theme captures) so stale images never end up in the report
  const dirsToClean = [
    ...(appsToRun.includes('old') ? [oldDir] : []),
    ...(appsToRun.includes('new') ? [newDir] : []),
    diffDir,
  ];
  for (const dir of dirsToClean) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.png')) continue;
      const stale =
        !filterIds || screensToRun.some((s) => new RegExp(`^${s.id}-\\d+\\.png$`).test(file));
      if (stale) unlinkSync(join(dir, file));
    }
  }
  for (const key of Object.keys(failures)) {
    const [app, fileKey] = key.split(':');
    if (
      appsToRun.includes(app) &&
      screensToRun.some((s) => new RegExp(`^${s.id}-\\d+$`).test(fileKey))
    )
      delete failures[key];
  }

  const names = await loadRoomNames(env, sessions.theo, seed);

  console.log(`Targeting ${screensToRun.length} screen(s) across ${WIDTHS.length} widths.`);

  // 3. Capture old app, then 4. new app
  try {
    if (appsToRun.includes('old'))
      await captureAppScreens('old', 8080, screensToRun, seed, env, sessions, names);
    if (appsToRun.includes('new'))
      await captureAppScreens('new', 5180, screensToRun, seed, env, sessions, names);
  } finally {
    saveFailures();
  }

  // 5. Diff and report
  buildReport();
}

main().catch((err) => {
  console.error('Fatal harness error:', err);
  process.exit(1);
});
