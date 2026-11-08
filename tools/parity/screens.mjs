/**
 * Screen capture definitions for Mudrix Visual Parity Harness.
 * Covers all screens in docs/PARITY_PLAN.md phase 3.
 */

const CLICK_OPTS = { timeout: 2000 };

async function waitPageReady(page) {
  await page.waitForTimeout(400);
  await page
    .locator('[class*="AppLoading_overlay"]')
    .waitFor({ state: 'detached', timeout: 20000 })
    .catch(() => {});
}

async function closeDialog(page) {
  try {
    const gotIt = page.locator('button:has-text("Got it")').first();
    if (await gotIt.isVisible().catch(() => false)) {
      await gotIt.click(CLICK_OPTS).catch(() => {});
      await page.waitForTimeout(200);
    }
    const closeBtn = page
      .locator('button[aria-label*="Close"], button[aria-label*="close"]')
      .first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click(CLICK_OPTS).catch(() => {});
      await page.waitForTimeout(200);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  } catch {
    // ignore
  }
}

async function openSettingsTab(page, port, tabName) {
  if (!page.url().endsWith(`:${port}/`)) {
    await page.goto(`http://localhost:${port}/`);
    await waitPageReady(page);
  }
  await closeDialog(page);
  let btn = page.locator('button[aria-label*="Settings"], button[title*="Settings"]').last();
  if (!(await btn.isVisible().catch(() => false))) {
    const menuBtn = page.locator('button[aria-label*="Menu"], button[aria-label*="menu"]').first();
    if (await menuBtn.isVisible().catch(() => false)) {
      await menuBtn.click(CLICK_OPTS).catch(() => {});
      await page.waitForTimeout(300);
    }
    btn = page.locator('button[aria-label*="Settings"], button[title*="Settings"]').last();
  }
  if (await btn.isVisible().catch(() => false)) {
    await btn.click(CLICK_OPTS).catch(() => {});
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

async function openRoomSettingsTab(page, port, roomId, tabName) {
  await page.goto(`http://localhost:${port}/r/${encodeURIComponent(roomId)}`);
  await waitPageReady(page);
  await closeDialog(page);
  const roomGear = page
    .locator('header button[aria-label*="Settings"], header button[aria-label*="Room"]')
    .first();
  if (await roomGear.isVisible().catch(() => false)) {
    await roomGear.click(CLICK_OPTS).catch(() => {});
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
    .locator('button:has-text("Space Settings"), [role="menuitem"]:has-text("Space Settings")')
    .first();
  if (await spaceSettingsBtn.isVisible().catch(() => false)) {
    await spaceSettingsBtn.click(CLICK_OPTS).catch(() => {});
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
    navigate: async (page, { seed, port }) => {
      await page.goto(`http://localhost:${port}/r/${encodeURIComponent(seed.rooms.general)}`);
      await waitPageReady(page);
      await closeDialog(page);
      const avatar = page
        .locator(
          '[aria-label*="Theo"], [aria-label*="Ash"], [aria-label*="Juno"], main [role="button"], main button'
        )
        .first();
      if (await avatar.isVisible().catch(() => false)) {
        await avatar.click(CLICK_OPTS).catch(() => {});
        await page.waitForTimeout(600);
      }
    },
    cleanup: closeDialog,
  },

  // --- Settings pages ---
  {
    id: 'settings-account',
    title: 'Settings: Account',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await openSettingsTab(page, port, 'Account');
    },
    cleanup: closeDialog,
  },
  {
    id: 'profile-cosmetics',
    title: 'Profile: Cosmetics chooser modal',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await openSettingsTab(page, port, 'Account');
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
    navigate: async (page, { port }) => {
      await openSettingsTab(page, port, 'Appearance');
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-notifications',
    title: 'Settings: Notifications',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await openSettingsTab(page, port, 'Notifications');
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-privacy',
    title: 'Settings: Privacy',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await openSettingsTab(page, port, 'Privacy');
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-media',
    title: 'Settings: Media',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await openSettingsTab(page, port, 'Media');
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-voice',
    title: 'Settings: Voice & Audio',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await openSettingsTab(page, port, 'Voice');
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-integrations',
    title: 'Settings: Integrations',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await openSettingsTab(page, port, 'Integrations');
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-keybinds',
    title: 'Settings: Keybinds',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await openSettingsTab(page, port, 'Keybinds');
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-activity',
    title: 'Settings: Activity',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await openSettingsTab(page, port, 'Activity');
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-developer',
    title: 'Settings: Developer',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await openSettingsTab(page, port, 'Developer');
    },
    cleanup: closeDialog,
  },
  {
    id: 'settings-about',
    title: 'Settings: About',
    requiresAuth: true,
    navigate: async (page, { port }) => {
      await openSettingsTab(page, port, 'About');
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
