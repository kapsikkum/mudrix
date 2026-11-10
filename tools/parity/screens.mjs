/**
 * Screen capture definitions for Mudrix Visual Parity Harness.
 * Covers all screens in docs/PARITY_PLAN.md phase 3.
 */

const CLICK_OPTS = { timeout: 3000, force: true };

async function waitPageReady(page) {
  await page.waitForTimeout(400);
  await page
    .locator('[class*="AppLoading_overlay"]')
    .waitFor({ state: 'detached', timeout: 20000 })
    .catch(() => {});
  // On Home, the room list streams in after the overlay goes; wait for it before capturing
  if (new URL(page.url()).pathname === '/') {
    await page
      .locator('text=/jump back in/i')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function closeDialog(page) {
  try {
    const gotIt = page.locator('button:has-text("Got it")').first();
    if (await gotIt.isVisible().catch(() => false)) {
      await gotIt.click(CLICK_OPTS).catch(() => {});
      await page.waitForTimeout(200);
    }
    const dialog = page
      .locator('[role="dialog"], [class*="Modal_overlay"], [class*="modalOverlay"]')
      .first();
    if (await dialog.isVisible().catch(() => false)) {
      const closeBtn = dialog
        .locator('button[aria-label*="Close" i], button[aria-label*="close" i]')
        .first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click(CLICK_OPTS).catch(() => {});
        await page.waitForTimeout(200);
      } else {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    }
  } catch {
    // ignore
  }
}

async function openSettingsTab(page, port, tabName, width) {
  await page.goto(`http://localhost:${port}/`);
  await waitPageReady(page);
  await closeDialog(page);

  if (width && width < 600) {
    const menuBtn = page.locator('button[aria-label="Menu"]').first();
    if (await menuBtn.isVisible().catch(() => false)) {
      await menuBtn.click(CLICK_OPTS).catch(() => {});
      await page.waitForTimeout(400);
      const settingsBtn = page
        .locator('button[aria-label*="User Settings" i], button[aria-label*="Settings" i]')
        .last();
      if (await settingsBtn.isVisible().catch(() => false)) {
        await settingsBtn.click(CLICK_OPTS).catch(() => {});
        await page.waitForTimeout(500);
      }
    } else {
      const youBtn = page.locator('button:has-text("You")').first();
      if (await youBtn.isVisible().catch(() => false)) {
        await youBtn.click(CLICK_OPTS).catch(() => {});
        await page.waitForTimeout(400);
      }
    }
  } else {
    const settingsBtn = page
      .locator('button[aria-label*="User Settings" i], button[aria-label*="Settings" i]')
      .last();
    if (await settingsBtn.isVisible().catch(() => false)) {
      await settingsBtn.click(CLICK_OPTS).catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  if (tabName) {
    const dialog = page.locator('[role="dialog"]').first();
    const tabScope = (await dialog.isVisible().catch(() => false)) ? dialog : page;
    const tab = tabScope
      .locator(
        `nav button:has-text("${tabName}"), [class*="mobileList"] button:has-text("${tabName}"), [role="tab"]:has-text("${tabName}"), button:has-text("${tabName}")`
      )
      .first();
    await tab.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await tab.isVisible().catch(() => false)) {
      await tab.click(CLICK_OPTS).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
}

async function openRoomSettingsTab(page, port, roomId, tabName) {
  await page.goto(`http://localhost:${port}/r/${encodeURIComponent(roomId)}`);
  await waitPageReady(page);
  await closeDialog(page);
  const lockBtn = page.locator('button[aria-label*="encrypted" i]').first();
  await lockBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (await lockBtn.isVisible().catch(() => false)) {
    await lockBtn.click(CLICK_OPTS).catch(() => {});
    await page
      .locator('[role="dialog"]')
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(500);
  }
  if (tabName) {
    const tab = page
      .locator(`button:has-text("${tabName}"), [role="tab"]:has-text("${tabName}")`)
      .first();
    if (await tab.isVisible().catch(() => false)) {
      await tab.click(CLICK_OPTS).catch(() => {});
      await page.waitForTimeout(400);
    }
  }
}

async function openSpaceSettingsTab(page, port, spaceId, tabName) {
  await page.goto(`http://localhost:${port}/space/${encodeURIComponent(spaceId)}`);
  await waitPageReady(page);
  await closeDialog(page);
  const spaceHeader = page.locator('button:has-text("Mud Club")').first();
  if (await spaceHeader.isVisible().catch(() => false)) {
    await spaceHeader.click(CLICK_OPTS).catch(() => {});
    await page.waitForTimeout(300);
  }
  const spaceSettingsBtn = page
    .locator('button:has-text("Settings"), [role="menuitem"]:has-text("Settings")')
    .first();
  if (await spaceSettingsBtn.isVisible().catch(() => false)) {
    await spaceSettingsBtn.click(CLICK_OPTS).catch(() => {});
    await page
      .locator('[role="dialog"]')
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(500);
  }
  if (tabName) {
    const dialog = page.locator('[role="dialog"]').first();
    const tabScope = (await dialog.isVisible().catch(() => false)) ? dialog : page;
    const tab = tabScope
      .locator(
        `nav button:has-text("${tabName}"), [class*="mobileList"] button:has-text("${tabName}"), [role="tab"]:has-text("${tabName}"), button:has-text("${tabName}")`
      )
      .first();
    await tab.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await tab.isVisible().catch(() => false)) {
      await tab.click(CLICK_OPTS).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
}

export const SCREENS = [
  // --- Unauthenticated auth screens ---
  {
    id: 'auth-welcome',
    title: 'Auth: Welcome landing',
    requiresAuth: false,
    navigate: async (page, { port }) => {
      await page.goto(`http://localhost:${port}/welcome`);
      await page.waitForTimeout(600);
    },
  },
  {
    id: 'auth-server',
    title: 'Auth: Server step',
    requiresAuth: false,
    navigate: async (page, { port }) => {
      await page.goto(`http://localhost:${port}/welcome`);
      await page.waitForTimeout(500);
      const changeBtn = page.locator('button:has-text("Change")').first();
      if (await changeBtn.isVisible().catch(() => false)) {
        await changeBtn.click(CLICK_OPTS).catch(() => {});
        await page.waitForTimeout(500);
      }
    },
  },
  {
    id: 'auth-login',
    title: 'Auth: Login form',
    requiresAuth: false,
    navigate: async (page, { port }) => {
      await page.goto(`http://localhost:${port}/welcome`);
      await page.waitForTimeout(600);
      const userInp = page.locator('input[type="text"]').first();
      if (await userInp.isVisible().catch(() => false)) {
        await userInp.fill('theo');
        await page.locator('input[type="password"]').fill('mudrix-test-password');
      }
      await page.waitForTimeout(400);
    },
  },

  // --- Main application shell & Home ---
  {
    id: 'home',
    title: 'Home: DM list & dashboard',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await page.goto(`http://localhost:${port}/`);
      await waitPageReady(page);
    },
    cleanup: closeDialog,
  },
  {
    id: 'room-list-classic',
    title: 'Room List: Classic layout',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await page.goto(`http://localhost:${port}/`);
      await waitPageReady(page);
    },
    cleanup: closeDialog,
  },
  {
    id: 'room-list-modern',
    title: 'Room List: Modern space layout (Mud Club)',
    requiresAuth: true,
    navigate: async (page, { seed, port }) => {
      await page.goto(`http://localhost:${port}/space/${encodeURIComponent(seed.rooms.space)}`);
      await waitPageReady(page);
    },
    cleanup: closeDialog,
  },

  // --- Timeline & Chat ---
  {
    id: 'timeline',
    title: 'Timeline: Room general messages',
    requiresAuth: true,
    navigate: async (page, { seed, port }) => {
      await page.goto(`http://localhost:${port}/r/${encodeURIComponent(seed.rooms.general)}`);
      await waitPageReady(page);
      await closeDialog(page);
      await page
        .locator('[class*="msgSender"]')
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
        .catch(() => {});
      await page.waitForTimeout(600);
    },
    cleanup: closeDialog,
  },
  {
    id: 'composer',
    title: 'Composer: Input & formatting bar',
    requiresAuth: true,
    navigate: async (page, { seed, port }) => {
      await page.goto(`http://localhost:${port}/r/${encodeURIComponent(seed.rooms.general)}`);
      await waitPageReady(page);
      await closeDialog(page);
      await page
        .locator('[class*="msgSender"]')
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
        .catch(() => {});
      const composer = page.locator('textarea, [contenteditable="true"]').last();
      if (await composer.isVisible().catch(() => false)) {
        await composer.focus().catch(() => {});
        await page.waitForTimeout(300);
      }
    },
    cleanup: closeDialog,
  },
  {
    id: 'profile-popup',
    title: 'Profile: User popup card',
    requiresAuth: true,
    navigate: async (page, { seed, port, width }) => {
      await page.goto(`http://localhost:${port}/r/${encodeURIComponent(seed.rooms.general)}`);
      await waitPageReady(page);
      await closeDialog(page);
      await page
        .locator('[class*="msgSender"]')
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
        .catch(() => {});
      if (width && width > 500) {
        const juno = page.locator('aside').getByText('Juno', { exact: true }).first();
        await juno.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        if (await juno.isVisible().catch(() => false)) {
          await juno.click({ force: true, timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(600);
        }
      } else {
        await closeDialog(page);
        const junoMsg = page.locator('[class*="msgSender"]:has-text("Juno")').last();
        await junoMsg.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        if (await junoMsg.isVisible().catch(() => false)) {
          await junoMsg.scrollIntoViewIfNeeded().catch(() => {});
          await junoMsg.click({ force: true, timeout: 5000 }).catch(() => {});
          await page
            .getByText('In room since')
            .waitFor({ state: 'visible', timeout: 3000 })
            .catch(() => {});
          await page.waitForTimeout(300);
        }
      }
    },
    cleanup: closeDialog,
  },

  // --- Settings pages ---
  {
    id: 'settings-account',
    title: 'Settings: Account',
    requiresAuth: true,
    navigate: async (page, { port, width }) => {
      await openSettingsTab(page, port, 'Account', width);
    },
    cleanup: closeDialog,
  },
  {
    id: 'profile-cosmetics',
    title: 'Profile: Cosmetics chooser modal',
    requiresAuth: true,
    navigate: async (page, { port, width }) => {
      await openSettingsTab(page, port, 'Account', width);
      const editBtn = page
        .locator(
          'button:has-text("Profile Style"), button:has-text("Change Decoration"), button:has-text("Edit Profile")'
        )
        .first();
      if (await editBtn.isVisible().catch(() => false)) {
        await editBtn.click(CLICK_OPTS).catch(() => {});
        await page.waitForTimeout(600);
      }
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-appearance',
    title: 'Settings: Appearance',
    requiresAuth: true,
    navigate: async (page, { port, width }) => {
      await openSettingsTab(page, port, 'Appearance', width);
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-notifications',
    title: 'Settings: Notifications',
    requiresAuth: true,
    navigate: async (page, { port, width }) => {
      await openSettingsTab(page, port, 'Notifications', width);
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-privacy',
    title: 'Settings: Privacy',
    requiresAuth: true,
    navigate: async (page, { port, width }) => {
      await openSettingsTab(page, port, 'Privacy', width);
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-media',
    title: 'Settings: Media',
    requiresAuth: true,
    navigate: async (page, { port, width }) => {
      await openSettingsTab(page, port, 'Media', width);
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-voice',
    title: 'Settings: Voice & Audio',
    requiresAuth: true,
    navigate: async (page, { port, width }) => {
      await openSettingsTab(page, port, 'Voice', width);
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-integrations',
    title: 'Settings: Integrations',
    requiresAuth: true,
    navigate: async (page, { port, width }) => {
      await openSettingsTab(page, port, 'Integrations', width);
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-keybinds',
    title: 'Settings: Keybinds',
    requiresAuth: true,
    navigate: async (page, { port, width }) => {
      await openSettingsTab(page, port, 'Keybinds', width);
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-activity',
    title: 'Settings: Activity',
    requiresAuth: true,
    navigate: async (page, { port, width }) => {
      await openSettingsTab(page, port, 'Activity', width);
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-developer',
    title: 'Settings: Developer',
    requiresAuth: true,
    navigate: async (page, { port, width }) => {
      await openSettingsTab(page, port, 'Developer', width);
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-about',
    title: 'Settings: About',
    requiresAuth: true,
    navigate: async (page, { port, width }) => {
      await openSettingsTab(page, port, 'About', width);
    },
    cleanup: closeDialog,
  },

  // --- Modals & Overlays ---
  {
    id: 'inbox',
    title: 'Inbox: Notifications & Mentions',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await page.goto(`http://localhost:${port}/`);
      await waitPageReady(page);
      await closeDialog(page);
      const inboxBtn = page.locator('button[aria-label*="Inbox"], button[title*="Inbox"]').first();
      if (await inboxBtn.isVisible().catch(() => false)) {
        await inboxBtn.click(CLICK_OPTS).catch(() => {});
        await page.waitForTimeout(600);
      }
    },
    cleanup: closeDialog,
  },
  {
    id: 'explore',
    title: 'Explore: Public rooms modal',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await page.goto(`http://localhost:${port}/`);
      await waitPageReady(page);
      await closeDialog(page);
      const exploreBtn = page
        .locator(
          'button[aria-label*="Explore"], button[title*="Explore"], button:has-text("Explore Communities")'
        )
        .first();
      if (await exploreBtn.isVisible().catch(() => false)) {
        await exploreBtn.click(CLICK_OPTS).catch(() => {});
        await page.waitForTimeout(600);
      }
    },
    cleanup: closeDialog,
  },
  {
    id: 'search',
    title: 'Search: Global search modal',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await page.goto(`http://localhost:${port}/`);
      await waitPageReady(page);
      await closeDialog(page);
      await page.keyboard.down('Control');
      await page.keyboard.press('k');
      await page.keyboard.up('Control');
      await page.waitForTimeout(600);
    },
    cleanup: closeDialog,
  },

  // --- Room Settings ---
  {
    id: 'room-settings-general',
    title: 'Room Settings: General',
    requiresAuth: true,
    navigate: async (page, { seed, port }) => {
      await openRoomSettingsTab(page, port, seed.rooms.general);
    },
    cleanup: closeDialog,
  },
  {
    id: 'room-settings-roles',
    title: 'Room Settings: Roles',
    requiresAuth: true,
    navigate: async (page, { seed, port }) => {
      await openRoomSettingsTab(page, port, seed.rooms.general, 'Roles');
    },
    cleanup: closeDialog,
  },
  {
    id: 'room-settings-audit-log',
    title: 'Room Settings: Audit Log',
    requiresAuth: true,
    navigate: async (page, { seed, port }) => {
      await openRoomSettingsTab(page, port, seed.rooms.general, 'Audit Log');
    },
    cleanup: closeDialog,
  },

  // --- Space Settings ---
  {
    id: 'space-settings-channels',
    title: 'Space Settings: Channels & Categories',
    requiresAuth: true,
    navigate: async (page, { seed, port }) => {
      await openSpaceSettingsTab(page, port, seed.rooms.space, 'Channels');
    },
    cleanup: closeDialog,
  },
  {
    id: 'space-settings-roles',
    title: 'Space Settings: Roles',
    requiresAuth: true,
    navigate: async (page, { seed, port }) => {
      await openSpaceSettingsTab(page, port, seed.rooms.space, 'Roles');
    },
    cleanup: closeDialog,
  },
  {
    id: 'space-settings-audit-log',
    title: 'Space Settings: Audit Log',
    requiresAuth: true,
    navigate: async (page, { seed, port }) => {
      await openSpaceSettingsTab(page, port, seed.rooms.space, 'Audit Log');
    },
    cleanup: closeDialog,
  },

  // --- Calls & Voice ---
  {
    id: 'call-stage',
    title: 'Call: Voice room Hangout stage',
    requiresAuth: true,
    navigate: async (page, { seed, port }) => {
      await page.goto(`http://localhost:${port}/r/${encodeURIComponent(seed.rooms.voice)}`);
      await waitPageReady(page);
    },
    cleanup: closeDialog,
  },
  {
    id: 'call-soundboard',
    title: 'Call: Soundboard modal/popover',
    requiresAuth: true,
    navigate: async (page, { seed, port }) => {
      await page.goto(`http://localhost:${port}/r/${encodeURIComponent(seed.rooms.voice)}`);
      await waitPageReady(page);
      const soundboardBtn = page
        .locator('button[aria-label*="Soundboard"], button:has-text("Soundboard")')
        .first();
      if (await soundboardBtn.isVisible().catch(() => false)) {
        await soundboardBtn.click(CLICK_OPTS).catch(() => {});
        await page.waitForTimeout(600);
      }
    },
    cleanup: closeDialog,
  },
];
