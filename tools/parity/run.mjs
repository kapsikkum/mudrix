#!/usr/bin/env node
/**
 * Mudrix Visual Parity Comparison Harness.
 *
 * Runs screenshots of all screens listed in docs/PARITY_PLAN.md phase 3 across:
 * - 3 widths: 1440 (desktop), 820 (tablet), 390 (phone)
 * - 3 themes: Carbon, Ethereal, Amber (custom)
 *
 * Generates diff images and tools/parity/out/report.md ranked by pixel diff percentage. The
 * report always covers every screen that has captures in out/, so running in batches (one or a
 * few screen ids at a time) still ends with a complete report.
 *
 * Usage:
 *   node run.mjs                   # Run all screens
 *   node run.mjs <screen-id>       # Run a single screen
 *   node run.mjs <id>,<id>,...     # Run a batch of screens
 *   node run.mjs <id> --apps=new   # Only re-capture one app (old|new), then re-diff
 *   node run.mjs --report-only     # Re-diff existing captures and rewrite report.md
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
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

mkdirSync(oldDir, { recursive: true });
mkdirSync(newDir, { recursive: true });
mkdirSync(diffDir, { recursive: true });

const WIDTHS = [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 820, height: 1180, name: 'tablet' },
  { width: 390, height: 844, name: 'phone' },
];

const THEMES = ['Carbon', 'Ethereal', 'Amber'];

const CUSTOM_THEME = {
  id: 'amber01',
  name: 'Amber',
  colors: {
    bgPrimary: '#1c1917',
    bgSecondary: '#292524',
    bgTertiary: '#44403c',
    accent: '#f59e0b',
    textPrimary: '#fef3c7',
    textMuted: '#d97706',
    border: '#78350f',
    msgMineBg: '#451a03',
    msgOtherBg: '#292524',
  },
};

// Both apps mirror theme, custom themes and preferences to Matrix account data and re-apply it
// after every sync, overriding whatever localStorage says. Both read (and write) these two types.
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
const reportOnly = args.includes('--report-only');
const filterScreenId = args.find((a) => !a.startsWith('--'));
const appsArg = args.find((a) => a.startsWith('--apps='));
const appsToRun = appsArg ? appsArg.slice('--apps='.length).split(',') : ['old', 'new'];

/** Theme names the apps' theme setting can hold */
const themeValue = (theme) => (theme === 'Amber' ? `custom:${CUSTOM_THEME.id}` : theme);

const themeIssues = [];

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

/** Writes the theme into the account's settings so the app's own sync agrees with localStorage. */
async function setAccountTheme(env, theo, theme) {
  const user = encodeURIComponent(theo.user_id);
  for (const type of SETTINGS_TYPES) {
    const path = `/_matrix/client/v3/user/${user}/account_data/${type}`;
    const current = (await matrix(env, theo, 'GET', path)) ?? {};
    await matrix(env, theo, 'PUT', path, {
      ...current,
      theme: themeValue(theme),
      customThemes: [CUSTOM_THEME],
      preferences: { ...(current.preferences ?? {}), followSystemTheme: false },
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

/** True once the app has applied `theme` (stored value and, where the app sets it, the root attribute). */
async function waitForTheme(page, theme, timeout = 10000) {
  const expected = themeValue(theme);
  try {
    await page.waitForFunction(
      (expected) => {
        let stored = null;
        try {
          stored = JSON.parse(localStorage.getItem('wz_theme'));
        } catch {
          // unreadable: treated as not applied
        }
        const attr = document.documentElement.getAttribute('data-theme-name');
        const custom = expected.startsWith('custom:');
        return stored === expected && (custom ? attr === expected : attr === null || attr === expected);
      },
      expected,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
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

async function applyTheme(page, theme, { port, env, theo, appName }) {
  if (theo) {
    // Let any settings push from the previous page settle so it cannot overwrite the write below
    await page.waitForTimeout(800);
    await setAccountTheme(env, theo, theme);
  }
  await page.evaluate(
    ({ theme, customTheme, value, uiKeys }) => {
      localStorage.setItem('wz_custom_themes', JSON.stringify([customTheme]));
      localStorage.setItem('wz_theme', JSON.stringify(value));
      uiKeys.forEach((k) => localStorage.removeItem(k));
    },
    { theme, customTheme: CUSTOM_THEME, value: themeValue(theme), uiKeys: UI_STATE_KEYS }
  );
  await page.goto(`http://localhost:${port}/${theo ? '' : 'welcome'}`);
  await waitAppReady(page, Boolean(theo));
  if (!(await waitForTheme(page, theme))) {
    console.warn(`[${appName}] theme ${theme} not applied after load`);
    themeIssues.push(`${appName}: ${theme} not applied after initial load`);
  }
}

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

  const capture = async (page, screen, theme, width, height, authed) => {
    const fileKey = `${screen.id}-${width}-${theme}`;
    const outPath = join(outDir, appName, `${fileKey}.png`);
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
        theme,
      });
      await page.waitForTimeout(400);
      if (!(await waitForTheme(page, theme, 4000))) {
        console.warn(`[${appName}] theme ${theme} not applied on ${fileKey}`);
        themeIssues.push(`${appName}: ${fileKey} captured without ${theme} applied`);
      }
      await page.screenshot({ path: outPath, fullPage: false });
    } catch (err) {
      console.warn(`[${appName}] Warning capturing ${fileKey}:`, err.message);
    } finally {
      if (screen.cleanup) await screen.cleanup(page).catch(() => {});
    }
  };

  // 1. Capture unauthenticated screens
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

    for (const theme of THEMES) {
      console.log(`[${appName} | unauth] Theme: ${theme}`);
      await applyTheme(page, theme, { port, env, theo: null, appName });

      for (const { width, height } of WIDTHS) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(300);
        for (const screen of unauthScreens) {
          await capture(page, screen, theme, width, height, false);
        }
      }
    }
    await unauthCtx.close();
  }

  // 2. Capture authenticated screens
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
        localStorage.setItem(
          'wz_preferences',
          JSON.stringify({
            followSystemTheme: false,
            systemDarkTheme: 'Carbon',
            systemLightTheme: 'Ethereal',
          })
        );
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
    await setAccountTheme(env, theo, THEMES[0]);
    await page.goto(`http://localhost:${port}/`);
    await waitAppReady(page, true);
    console.log(`[${appName}] Initial sync completed!`);

    // Run authenticated screens across all themes and widths
    for (const theme of THEMES) {
      console.log(`[${appName} | auth] Theme: ${theme}`);
      await applyTheme(page, theme, { port, env, theo, appName });

      for (const { width, height } of WIDTHS) {
        console.log(`[${appName} | auth] Viewport: ${width}x${height}`);
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(300);
        for (const screen of authScreens) {
          await capture(page, screen, theme, width, height, true);
        }
      }
    }
    await setAccountTheme(env, theo, THEMES[0]).catch(() => {});
    await authCtx.close();
  }

  await browser.close();
}

const sha = (file) => createHash('sha1').update(readFileSync(file)).digest('hex');

function buildReport() {
  console.log('\n=== Computing pixel diffs ===');
  const results = [];
  const notCaptured = [];
  const identicalThemes = [];

  for (const screen of SCREENS) {
    let any = false;
    for (const { width } of WIDTHS) {
      for (const theme of THEMES) {
        const fileKey = `${screen.id}-${width}-${theme}`;
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
          theme,
          fileKey,
          diffPercent: diffResult.diffPercent,
          missing: Boolean(diffResult.error),
        });
      }
      // The theme switch is only trustworthy if the three themes render differently
      for (const appName of ['old', 'new']) {
        const files = THEMES.map((t) => join(outDir, appName, `${screen.id}-${width}-${t}.png`));
        if (files.every(existsSync) && new Set(files.map(sha)).size < THEMES.length) {
          identicalThemes.push(`${appName} ${screen.id} @${width}`);
        }
      }
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
  let report = `# Mudrix Visual Parity Report\n\n`;
  report += `Generated at: ${new Date().toISOString()}\n`;
  report += `Screens captured: ${SCREENS.length - notCaptured.length} of ${SCREENS.length}\n`;
  report += `Total comparisons: ${results.length}\n`;
  report += `Average pixel difference (excluding not-meaningful screens): **${avgDiff}%**\n\n`;
  if (notCaptured.length) report += `Not captured: ${notCaptured.map((s) => `\`${s}\``).join(', ')}\n\n`;
  report += `Themes rendering identically (suspect theme switch): ${
    identicalThemes.length ? identicalThemes.join('; ') : 'none'
  }\n\n`;
  if (themeIssues.length) {
    report += `Theme application warnings from this run:\n\n${themeIssues
      .map((i) => `- ${i}`)
      .join('\n')}\n\n`;
  }
  report += `† = not meaningful (no call connects on the test server), shown for completeness only.\n\n`;

  report += `## Per-screen summary (max diff % per width)\n\n`;
  report += `| Screen | 1440 | 820 | 390 | Max | Themes differ |\n`;
  report += `| :--- | ---: | ---: | ---: | ---: | :--- |\n`;
  const summaryRows = [];
  for (const screen of SCREENS) {
    const rows = results.filter((r) => r.id === screen.id);
    if (!rows.length) continue;
    const maxFor = (w) => {
      const rs = rows.filter((r) => r.width === w);
      return rs.length ? Math.max(...rs.map((r) => r.diffPercent)) : null;
    };
    const maxes = WIDTHS.map(({ width }) => maxFor(width));
    const overall = Math.max(...maxes.filter((m) => m !== null));
    const identical = identicalThemes.some((i) => i.includes(` ${screen.id} @`));
    summaryRows.push({ screen, maxes, overall, identical });
  }
  summaryRows.sort((a, b) => b.overall - a.overall);
  for (const { screen, maxes, overall, identical } of summaryRows) {
    const mark = screen.notMeaningful ? ' †' : '';
    report += `| \`${screen.id}\`${mark} | ${maxes
      .map((m) => (m === null ? '-' : pct(m)))
      .join(' | ')} | **${pct(overall)}** | ${identical ? 'NO' : 'yes'} |\n`;
  }

  report += `\n## Ranked Differences (Worst First)\n\n`;
  report += `| Rank | Screen | Width | Theme | Diff % | Old | New | Diff |\n`;
  report += `| ---: | :--- | :--- | :--- | ---: | :--- | :--- | :--- |\n`;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const mark = r.notMeaningful ? ' †' : '';
    const diffDisplay = r.missing ? 'missing' : pct(r.diffPercent);
    report += `| ${i + 1} | \`${r.id}\`${mark} | ${r.width} | ${r.theme} | **${diffDisplay}** | [old](old/${r.fileKey}.png) | [new](new/${r.fileKey}.png) | [diff](diff/${r.fileKey}.png) |\n`;
  }

  const reportPath = join(outDir, 'report.md');
  writeFileSync(reportPath, report);
  console.log(`Report written to: ${reportPath} (${results.length} rows)`);

  console.log('\n========================================');
  console.log('         TOP 15 WORST SCREENS           ');
  console.log('========================================');
  for (let i = 0; i < Math.min(15, results.length); i++) {
    const r = results[i];
    console.log(
      `${(i + 1).toString().padStart(2, ' ')}. ${r.id.padEnd(26)} (width: ${r.width.toString().padEnd(4)}, theme: ${r.theme.padEnd(8)}) -> ${r.diffPercent.toFixed(2)}% diff`
    );
  }
  console.log('========================================\n');
}

async function main() {
  console.log('=== Mudrix Visual Parity Comparison Harness ===');

  if (reportOnly) {
    buildReport();
    return;
  }

  // 1. Ensure test homeserver and seed data
  const seedFile = join(here, 'seed-data.json');
  let seed;
  if (existsSync(seedFile)) {
    seed = JSON.parse(readFileSync(seedFile, 'utf8'));
  } else {
    seed = await runSeed();
  }

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

  // 2. Check test server and old and new servers
  if (!(await checkServer(`${env.homeserver}/_matrix/client/versions`))) {
    throw new Error(
      `Test homeserver is not reachable at ${env.homeserver}! Start it: podman machine start, then node dev/test-server/up.mjs in mudrix-web.`
    );
  }
  const oldOk = await checkServer('http://localhost:8080/');
  const newOk = await checkServer('http://localhost:5180/');

  if (!oldOk)
    throw new Error(
      'Old app is not running at http://localhost:8080! Start it with npm start in mudrix-web.'
    );
  if (!newOk)
    throw new Error('New app is not running at http://localhost:5180! Start it with npm run dev.');

  const filterIds = filterScreenId ? new Set(filterScreenId.split(',').map((s) => s.trim())) : null;
  const screensToRun = filterIds ? SCREENS.filter((s) => filterIds.has(s.id)) : SCREENS;

  if (screensToRun.length === 0) {
    console.error(
      `No screen matching ID "${filterScreenId}". Available IDs:\n` +
        SCREENS.map((s) => s.id).join(', ')
    );
    process.exit(1);
  }

  // Drop captures of the screens about to be re-run so stale images never end up in the report
  const dirsToClean = [...(appsToRun.includes('old') ? [oldDir] : []), ...(appsToRun.includes('new') ? [newDir] : []), diffDir];
  for (const dir of dirsToClean) {
    for (const file of readdirSync(dir)) {
      if (screensToRun.some((s) => new RegExp(`^${s.id}-\\d+-[A-Za-z]+\\.png$`).test(file))) {
        unlinkSync(join(dir, file));
      }
    }
  }

  const names = await loadRoomNames(env, sessions.theo, seed);

  console.log(`Targeting ${screensToRun.length} screen(s) across 3 widths and 3 themes.`);

  // 3. Capture old app, then 4. new app
  if (appsToRun.includes('old'))
    await captureAppScreens('old', 8080, screensToRun, seed, env, sessions, names);
  if (appsToRun.includes('new'))
    await captureAppScreens('new', 5180, screensToRun, seed, env, sessions, names);

  // 5. Diff and report
  buildReport();
}

main().catch((err) => {
  console.error('Fatal harness error:', err);
  process.exit(1);
});
