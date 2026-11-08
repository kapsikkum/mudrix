#!/usr/bin/env node
/**
 * Mudrix Visual Parity Comparison Harness.
 *
 * Runs screenshots of all screens listed in docs/PARITY_PLAN.md phase 3 across:
 * - 3 widths: 1440 (desktop), 820 (tablet), 390 (phone)
 * - 3 themes: Carbon, Ethereal, Amber (custom)
 *
 * Generates diff images and tools/parity/out/report.md ranked by pixel diff percentage.
 *
 * Usage:
 *   node run.mjs               # Run all screens
 *   node run.mjs <screen-id>   # Run a single screen
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const filterScreenId = process.argv[2];

async function checkServer(url) {
  try {
    const res = await fetch(url);
    if (res.status === 200) return true;
  } catch {
    // not running
  }
  return false;
}

async function applyTheme(page, theme) {
  await page.evaluate(
    ({ theme, customTheme }) => {
      if (theme === 'Amber') {
        localStorage.setItem('wz_custom_themes', JSON.stringify([customTheme]));
        localStorage.setItem('wz_theme', JSON.stringify('custom:amber01'));
      } else {
        localStorage.setItem('wz_theme', JSON.stringify(theme));
      }
    },
    { theme, customTheme: CUSTOM_THEME }
  );
  await page.reload().catch(() => {});
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page
    .locator('[class*="AppLoading_overlay"]')
    .waitFor({ state: 'detached', timeout: 20000 })
    .catch(() => {});
  const gotItBtn = page.locator('button:has-text("Got it")').first();
  if (await gotItBtn.isVisible().catch(() => false)) {
    await gotItBtn.click({ timeout: 2000 }).catch(() => {});
  }
  await page.waitForTimeout(500);
}

async function captureAppScreens(appName, port, screens, seed, env) {
  console.log(`\n========================================`);
  console.log(`  Capturing ${appName.toUpperCase()} app on port ${port}`);
  console.log(`========================================`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const unauthScreens = screens.filter((s) => !s.requiresAuth);
  const authScreens = screens.filter((s) => s.requiresAuth);

  // 1. Capture unauthenticated screens
  if (unauthScreens.length > 0) {
    console.log(
      `\n[${appName}] --- Capturing ${unauthScreens.length} unauthenticated screen(s) ---`
    );
    const unauthCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await unauthCtx.newPage();

    await page.goto(`http://localhost:${port}/`);
    await page.evaluate((hs) => {
      localStorage.setItem('wz_last_homeserver', hs);
    }, env.homeserver);

    for (const theme of THEMES) {
      console.log(`[${appName} | unauth] Theme: ${theme}`);
      await applyTheme(page, theme);

      for (const { width, height } of WIDTHS) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(300);

        for (const screen of unauthScreens) {
          const fileKey = `${screen.id}-${width}-${theme}`;
          const outPath = join(outDir, appName, `${fileKey}.png`);
          try {
            await screen.navigate(page, {
              port,
              seed,
              env,
              hsUrl: env.homeserver,
              width,
              height,
              theme,
            });
            await page.waitForTimeout(400);
            await page.screenshot({ path: outPath, fullPage: false });
            if (screen.cleanup) await screen.cleanup(page);
          } catch (err) {
            console.warn(`[${appName}] Warning capturing ${fileKey}:`, err.message);
          }
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
    const page = await authCtx.newPage();

    const theo = seed.tokens.theo;
    const storeLocation = 'wizardchat-session-' + theo.userId.replace(/[^a-zA-Z0-9]/g, '_');
    const storePassphrase = btoa('12345678901234567890123456789012');

    await page.goto(`http://localhost:${port}/`);
    await page.evaluate(
      ({ appName, token, hs, userId, deviceId, storeLocation, storePassphrase }) => {
        if (appName === 'old') {
          localStorage.setItem(
            'wz_accounts',
            JSON.stringify({
              [userId]: { userId, accessToken: token, deviceId, homeserverUrl: hs },
            })
          );
          localStorage.setItem('wz_whats_new_seen', JSON.stringify('26.10.18'));
        } else {
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
          localStorage.setItem('wz_whats_new_seen', JSON.stringify('26.11.0'));
        }
        localStorage.setItem('wz_active_account', userId);
        localStorage.setItem('wz_user_id', userId);
        localStorage.setItem('wz_last_homeserver', hs);
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
        appName,
        token: theo.accessToken,
        hs: theo.homeserverUrl,
        userId: theo.userId,
        deviceId: theo.deviceId,
        storeLocation,
        storePassphrase,
      }
    );

    await page.goto(`http://localhost:${port}/`);
    await page
      .locator('[class*="AppLoading_overlay"]')
      .waitFor({ state: 'detached', timeout: 30000 })
      .catch(() => {});
    console.log(`[${appName}] Initial sync completed!`);

    // Dismiss any initial modal if present
    const gotItBtn = page.locator('button:has-text("Got it")').first();
    if (await gotItBtn.isVisible().catch(() => false)) {
      await gotItBtn.click({ timeout: 2000 }).catch(() => {});
    }

    // Run authenticated screens across all themes and widths
    for (const theme of THEMES) {
      console.log(`[${appName} | auth] Theme: ${theme}`);
      await applyTheme(page, theme);

      for (const { width, height } of WIDTHS) {
        console.log(`[${appName} | auth] Viewport: ${width}x${height}`);
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(300);

        for (const screen of authScreens) {
          const fileKey = `${screen.id}-${width}-${theme}`;
          const outPath = join(outDir, appName, `${fileKey}.png`);
          try {
            await screen.navigate(page, {
              port,
              seed,
              env,
              hsUrl: env.homeserver,
              width,
              height,
              theme,
            });
            await page.waitForTimeout(400);
            await page.screenshot({ path: outPath, fullPage: false });
          } catch (err) {
            console.warn(`[${appName}] Warning capturing ${fileKey}:`, err.message);
          } finally {
            if (screen.cleanup) {
              await screen.cleanup(page).catch(() => {});
            }
          }
        }
      }
    }
    await authCtx.close();
  }

  await browser.close();
}

async function main() {
  console.log('=== Mudrix Visual Parity Comparison Harness ===');

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

  // 2. Check old and new servers
  const oldOk = await checkServer('http://localhost:8080/');
  const newOk = await checkServer('http://localhost:5180/');

  if (!oldOk)
    throw new Error(
      'Old app is not running at http://localhost:8080! Start it with npm start in mudrix-web.'
    );
  if (!newOk)
    throw new Error('New app is not running at http://localhost:5180! Start it with npm run dev.');

  const screensToRun = filterScreenId ? SCREENS.filter((s) => s.id === filterScreenId) : SCREENS;

  if (screensToRun.length === 0) {
    console.error(
      `No screen matching ID "${filterScreenId}". Available IDs:\n` +
        SCREENS.map((s) => s.id).join(', ')
    );
    process.exit(1);
  }

  console.log(`Targeting ${screensToRun.length} screen(s) across 3 widths and 3 themes.`);

  // 3. Capture old app
  await captureAppScreens('old', 8080, screensToRun, seed, env);

  // 4. Capture new app
  await captureAppScreens('new', 5180, screensToRun, seed, env);

  // 5. Compute diffs with pixelmatch
  console.log('\n=== Computing pixel diffs ===');
  const results = [];

  for (const screen of screensToRun) {
    for (const { width } of WIDTHS) {
      for (const theme of THEMES) {
        const fileKey = `${screen.id}-${width}-${theme}`;
        const oldFile = join(oldDir, `${fileKey}.png`);
        const newFile = join(newDir, `${fileKey}.png`);
        const diffFile = join(diffDir, `${fileKey}.png`);

        const diffResult = compareImages(oldFile, newFile, diffFile);
        results.push({
          id: screen.id,
          title: screen.title,
          width,
          theme,
          fileKey,
          diffPercent: diffResult.diffPercent,
          numDiffPixels: diffResult.numDiffPixels,
          totalPixels: diffResult.totalPixels,
        });
      }
    }
  }

  // Sort descending by diff percentage
  results.sort((a, b) => b.diffPercent - a.diffPercent);

  // 6. Generate report.md
  console.log('\n=== Generating report.md ===');
  const avgDiff =
    results.length > 0
      ? (results.reduce((acc, r) => acc + r.diffPercent, 0) / results.length).toFixed(2)
      : '0';

  let report = `# Mudrix Visual Parity Report\n\n`;
  report += `Generated at: ${new Date().toISOString()}\n`;
  report += `Total comparisons: ${results.length}\n`;
  report += `Average pixel difference: **${avgDiff}%**\n\n`;
  report += `## Ranked Differences (Worst First)\n\n`;
  report += `| Rank | Screen | Width | Theme | Diff % | Old | New | Diff |\n`;
  report += `| ---: | :--- | :--- | :--- | ---: | :--- | :--- | :--- |\n`;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const diffDisplay = `${r.diffPercent.toFixed(2)}%`;
    report += `| ${i + 1} | \`${r.id}\` | ${r.width} | ${r.theme} | **${diffDisplay}** | [old](old/${r.fileKey}.png) | [new](new/${r.fileKey}.png) | [diff](diff/${r.fileKey}.png) |\n`;
  }

  const reportPath = join(outDir, 'report.md');
  writeFileSync(reportPath, report);
  console.log(`Report written to: ${reportPath}`);

  // 7. Output Top 15 worst screens
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

main().catch((err) => {
  console.error('Fatal harness error:', err);
  process.exit(1);
});
