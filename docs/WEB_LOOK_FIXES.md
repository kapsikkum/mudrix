# Web look: fix list from the parity harness

Source: one full run of `tools/parity` (old app `mudrix-web` on :8080 against the new app `apps/web` on :5180, Carbon theme, widths 1440 / 820 / 390, 37 screens, 111 comparisons, no capture failures). Average diff 3.06% (excluding the two call screens). I compared old / new / diff images for every screen over 2% at some width and for all `timeline-<mode>` screens; the smaller settings pages were judged from one width only, so treat their notes as likely rather than certain. Owning files are the most likely place, not verified fixes.

Diff % is pixelmatch (threshold 0.1) over the whole viewport, so a shifted row can paint a large area. Diff images live in `tools/parity/out/diff/` (not committed; regenerate with the harness).

## 1. Commands

Start one server at a time (RAM is tight).

```powershell
# old app (reference, read only), port 8080
cd E:\code\web\mudrix-web ; npm start

# new app, port 5180 (wasm core must already be built)
cd E:\code\web\mudrix ; npm run dev
```

The local Tuwunel test server must be up (podman containers `mudrix-test-*`, config in `E:\code\web\mudrix-web\dev\test-server`). The harness signs in as the throwaway `@theo:mudrix.test` by injecting a token.

```powershell
cd E:\code\web\mudrix\tools\parity

node run.mjs                               # all screens, both apps, then diff + report
node run.mjs --screen timeline-bubble      # one screen (comma list for a few)
node run.mjs --screen home --apps=new      # re-capture only one app, then re-diff
node run.mjs --report-only                 # re-diff existing captures
node side.mjs timeline-bubble 1440,390     # out/side/<id>-<w>.png = old | new (| diff at 390)
node themes.mjs                            # static theme comparison -> out/themes.md
```

Typical flow: start the old app, `node run.mjs --apps=old`, stop it, start the new app, `node run.mjs --apps=new` (this also writes the report). Output is in `tools/parity/out/{old,new,diff,side}/`, `out/report.md`, `out/report.json`, `out/failures.json`. Stop the dev servers when done.

## 2. Display modes (Settings > Appearance)

Both apps offer the same three message layouts and the same density / text-size settings.

| Setting                  | Values                                                       | Old app storage                                                                         | New app storage               |
| :----------------------- | :----------------------------------------------------------- | :-------------------------------------------------------------------------------------- | :---------------------------- |
| Message layout           | `modern` (default), `classic` (shown as "Bubble"), `compact` | localStorage `wz_message_layout` (plain string); account settings event `messageLayout` | same key and same event field |
| Message layout on phones | same                                                         | `wz_message_layout_mobile` (JSON); falls back to the main layout                        | same                          |
| Chat density             | `compact` / `default` / `spacious`                           | `wz_preferences.chatDensity`                                                            | same                          |
| Chat text size           | 12 14 15 16 18 20 24                                         | `wz_preferences.chatFontSize`                                                           | same                          |
| UI density               | same three                                                   | `wz_preferences.uiDensity`                                                              | same                          |

Both apps also mirror these into account data and re-apply it after every sync (types `io.github.kapsikkum.mudrix.settings` and `chat.mudrix.settings`; the new app also reads `org.wizardchat.settings`). So localStorage alone is overwritten. The harness therefore writes the account data first, then localStorage, then reads both back after load and fails the attempt on a mismatch.

How the old app applies the layout: `src/App.tsx` toggles root attributes `data-compact-layout` (compact) and `data-bubble-layout` (classic) and `Timeline.css.ts` styles them globally. The new app has no such root attributes (see fix L1/L2); it only passes `variant` into `Message.tsx`.

Harness screens: `timeline-modern`, `timeline-bubble`, `timeline-compact`, `timeline-density-compact`, `timeline-density-spacious`, `timeline-font-large` (text size 20). Each was confirmed to differ from `timeline-modern` in both apps, so the setting takes effect in both. Time format, date format and other toggles were not covered. `room-list-classic` and `room-list-modern` are kept; they are the home page and the Mud Club space page.

## 3. Per-screen summary (max diff % per width, worst first)

| Screen                                             | 1440 |  820 |   390 |
| :------------------------------------------------- | ---: | ---: | ----: |
| profile-popup                                      | 3.70 | 5.17 | 35.20 |
| auth-server                                        | 3.01 | 4.09 | 15.36 |
| timeline-bubble                                    | 4.09 | 8.96 | 14.52 |
| auth-login                                         | 2.32 | 3.23 | 11.10 |
| timeline-compact                                   | 2.86 | 3.26 |  9.58 |
| auth-welcome                                       | 2.21 | 3.01 |  8.00 |
| call-soundboard (not meaningful: no call connects) | 0.29 | 0.39 |  7.58 |
| space-settings-channels                            | 4.14 | 5.29 |  6.76 |
| space-settings-audit-log                           | 2.64 | 3.38 |  6.45 |
| settings-account                                   | 2.74 | 3.68 |  6.06 |
| settings-appearance                                | 4.45 | 5.67 |  0.51 |
| home                                               | 2.87 | 1.05 |  4.85 |
| room-list-classic (same page as home)              | 2.87 | 1.05 |  4.85 |
| explore (390 is a fallback shot, see caveats)      | 0.34 | 0.39 |  4.80 |
| space-settings-roles                               | 1.63 | 2.10 |  4.25 |
| settings-integrations                              | 2.95 | 4.00 |  0.02 |
| room-settings-general                              | 3.21 | 3.75 |  1.17 |
| room-settings-audit-log                            | 3.21 | 3.75 |  1.17 |
| settings-activity (390 is a fallback shot)         | 2.74 | 3.68 |  3.20 |
| settings-privacy                                   | 2.76 | 3.63 |  0.02 |
| settings-voice                                     | 2.58 | 3.41 |  0.02 |
| settings-about                                     | 2.44 | 3.33 |  1.54 |
| settings-keybinds                                  | 1.78 | 2.40 |  3.27 |
| settings-media                                     | 2.52 | 3.23 |  0.02 |
| settings-notifications                             | 2.20 | 2.88 |  0.02 |
| room-settings-roles                                | 2.50 | 2.87 |  1.17 |
| call-stage (not meaningful: no call connects)      | 2.78 | 0.39 |  0.00 |
| search                                             | 0.80 | 0.68 |  1.96 |
| settings-developer                                 | 1.34 | 1.81 |  0.02 |
| room-list-modern                                   | 0.81 | 0.90 |  1.71 |
| timeline-density-spacious                          | 0.37 | 0.64 |  1.10 |
| profile-cosmetics                                  | 0.94 | 0.60 |  0.02 |
| timeline-modern                                    | 0.41 | 0.70 |  0.27 |
| composer                                           | 0.50 | 0.68 |  0.27 |
| timeline-font-large                                | 0.51 | 0.70 |  0.61 |
| inbox                                              | 0.64 | 0.42 |  0.01 |
| timeline-density-compact                           | 0.42 | 0.50 |  0.41 |

All paths below are under `apps/web/src/` unless stated.

## 4. Fix list

### LOOK fixes (CSS / markup the new app should change), ordered by impact

- [x] **L1. Bubble layout is missing (`timeline-bubble` 4.1 / 9.0 / 14.5%). DONE: now 0.7 / 1.8 / 0.4%.** (The bubbles existed but used the theme's near-invisible `message.other` colour; ported the old tinted bubble styles, root `data-bubble-layout` attribute in `App.tsx`, Sent/Seen status row and grouped bubble time.) Old: text, media and file cards sit in rounded bubbles (`msgContentClassic*`), time always visible beside the name, 24px avatar column, name at 0.8rem / time 0.66rem, own messages right-aligned with no avatar or name, 2px gap in the body. New: looks almost identical to Modern (no bubbles, no time, full-size avatar and name, own messages on the left). Cause: no `data-bubble-layout` root attribute and no global rules for it. Port the `:root[data-bubble-layout]` block from old `Timeline.css.ts` (about lines 2342-2389 and 2562-2581) and the `msgRowOwn` styling; set the attribute where the new app has root effects (app shell or the hook beside `useChatDisplaySync`). Files: `app/features/timeline/Timeline.css.ts` (`msgRowOwn` exists at line 326, unstyled), `app/features/timeline/message/Message.tsx` (`variant === 'classic'`), `app/hooks/useMessageLayout.ts`, `app/features/settings/appearance/Appearance.tsx` (the preview should match too).
- [x] **L2. Compact layout differs (`timeline-compact` 2.9 / 3.3 / 9.6%). DONE: now 0.3 / 0.6 / 0.6%** (compact now uses the regular row markup plus the old `:root[data-compact-layout]` rules; reply quotes are one line with an ellipsis and a plain bold name, like the old app). Both have a right-aligned time gutter and no avatars. Old: sender name and time on the first line, reply quote and block content (media, code, files, blockquotes) on their own full-width lines below, text wraps under the name with a `76px` left padding. New: the sender is inline before the text, so replies and media start beside the name. Port the old `:root[data-compact-layout]` rules (old `Timeline.css.ts` about lines 2306-2389, including the `:has(...)` rule that gives block content its own line and the `emojiOnly` rule). Files: `app/features/timeline/Timeline.css.ts` (`msgRowCompact`, `compactBody`, lines about 2298-2320), `message/Message.tsx` (`isCompact`, line about 849).
- [x] **L3 + L4. DONE: `profile-popup` 3.7 / 5.2 / 35.2% -> 0.4 / 0.6 / 0.1%.** The popup now uses the old card markup and css (name as plain text, status pill, avatar actions, detail rows, mutual rooms, notes, Message button, "View Full Profile") and the old full-profile modal (phone bottom sheet with Details / Activity / Mutual Rooms tabs, swipe down to dismiss). The upstream name-plate chip and verify icon in the card were dropped (the verify action lives in the Verification row). **Mobile profile popup (**`profile-popup` 390: 35.2%).** Old opens a full-height bottom sheet with a drag handle, banner, large avatar, "Message" button and a Details / Activity / Mutual Rooms tab bar. New shows a small centered card. This needs the mobile full-profile modal that `docs/WEB_LOOK_NOTES.md` section 1 lists as not built. Files: `app/features/profile/UserProfilePopup.tsx`, `UserProfilePopup.css.ts`.
- [x] **L4 (see L3). Desktop profile card (`profile-popup` 1440: 3.7%).** Old card is wider, has the banner behind a larger avatar, a name row with online dot, details list, a notes box, a primary "Message" button and a "View Full Profile" link. New card is narrower, shows the name as a small decoration chip, the Message button sits above the notes, and there is no "View Full Profile". Same files as L3.
- [x] **L5. DONE: `auth-server` 3.0 / 4.1 / 15.4 -> 0.6 / 0.8 / 1.6%, `auth-login` 2.3 / 3.2 / 11.1 -> 0.5 / 0.7 / 1.0%, `auth-welcome` 2.2 / 3.0 / 8.0 -> 0.4 / 0.6 / 0.8%** (login, register and reset forms rebuilt on the old markup, `AuthField`, `welcome.*` copy; the 121 old `welcome.*` keys were copied into all 11 locales; the harness now waits for the form because the new app checks the server first). The leftover difference is the server software name and the version number. Auth pages on a phone (`auth-server` 15%, `auth-login` 11%, `auth-welcome` 8% at 390; 2-4% elsewhere).** Old: no card, logo near the top, heading then "Server address" block, full-width form with an empty Username / Password field and a "Log In" button, "Need an account? Register", and the app version beside the language selector at the bottom. New: the whole form is in a bordered rounded card with an extra "Login" heading, placeholder text inside the fields, the button reads "Login", and the version label is missing. The vertical rhythm is also about 40px lower. Files: `app/pages/auth/WelcomePage.tsx`, `WelcomePage.css.ts`, `LoginForm.tsx`, `ServerPicker.tsx`, `AuthField.tsx`. Check the labels against old strings (some were already restored; see `docs/WEB_LOOK_NOTES.md` section 5).
- [x] **L6. DONE: desktop settings screens now 0.6-1.4% (appearance 4.5/5.7 -> 1.2/1.4, space-settings-channels 4.1/5.3 -> 1.7/2.0, privacy/integrations/voice/media ~0.8/1.0). Cause: the merge dropped the `scroller` wrapper (the sticky panel title relies on its padding); restored in user and space settings, and the nav order now matches the old app (Voice & Video next to Voice & Audio, divider before Appearance). Desktop settings modal: clipped title and shifted layout (`settings-appearance` 4.5 / 5.7%, `space-settings-channels` 4.1 / 5.3%, `room-settings-general` 3.2 / 3.8%, `settings-integrations` 3.0 / 4.0%, and every other `settings-*` at 1440 / 820, 2-3.7%).** In the new modal the panel title ("Appearance", "General") is cut off at the top where the scroll area starts under the header, the modal is shorter, and content sits at different vertical offsets (the old content starts about 24px lower). The new nav column also has a "Search settings" field the old one lacks (that part is content, see D5). Files: `app/features/settings/Settings.css.ts`, `app/components/Settings/Settings.css.ts`, `app/features/settings/Settings.tsx`. Fix this first for the biggest across-the-board gain; it likely moves 20+ screens under 2%.
- [x] **L7. DONE: `space-settings-channels` 6.8 / 5.3 / 4.1 -> 2.5 / 2.2 / 1.9%, `space-settings-roles` 4.3 -> 0.0% at 390, `room-settings-general` 3.2 / 3.8 -> 1.2 / 1.6%.** Space settings keeps the icon rail + panel on phones (the upstream list/page pattern and the nav search are gone there; the nav search is hidden when the nav is a rail); room settings dialog is 900x640 again, which also fixed the General field alignment at 820. What remains is content: the space General page has Space name / Topic where the old has Soundboard, the old space rail has a Cosmetics tab (old `EmojiStickerPanel scope="cosmetic"`) the new has Audit log instead. Space and room settings sub-panels (`space-settings-channels` 6.8% at 390, `space-settings-audit-log` 6.5% at 390, `space-settings-roles` 4.3% at 390, `room-settings-*` 3.2-3.8% at 820).** At 390 the old space settings keeps a narrow icon rail of sections at the left and shows the panel to its right; the new app shows the section list as a full-width page first ("Mud Club" heading, search field, chevron rows), so the screenshot is a different screen. Decide which behaviour is intended and align it. At 820 the room-settings General page puts "Room name" and the topic at different heights and the avatar overlaps the title. Files: `app/features/space/spacesettings/SpaceSettings.tsx`, `SpaceModernSettings.tsx`, `General.tsx`, `ChannelsPanel.tsx`, `Channels.css.ts`; `app/features/room/roomsettings/RoomSettings.tsx`, `General.tsx`.
- [x] **L8. DONE: `settings-account` 2.7 / 3.7 / 6.1 -> 1.2 / 1.6 / 1.4%.** Restored the Profile heading and removed the About Me heading (the extended profile follows directly); the upstream Status section stays after it (the nav sub-list gains a Status entry). Original note: `settings-account` (2.7 / 3.7 / 6.1%). New adds a "Status" section (online status select, "Set a custom status") and an "About Me" heading, shows a camera overlay on the avatar, and places the avatar and fields about 40px higher than the old (which has a "Profile" heading above the avatar and the Display name and Save row below). Files: `app/features/settings/account/ProfileStyle.tsx`, `ExtendedProfile.tsx`, `Status.tsx`, `Avatar.tsx`, `DisplayName.tsx`, `index.ts`.
- [x] **L9. DONE: `settings-keybinds` 3.3 -> 0.0% at 390 (1.0 / 1.4% at 1440 / 820); mobile list rows are 56px, the divider shows, no close button on sub-pages; single `Ctrl + K` chips and the old bordered shortcut button; logout button back in the desktop nav footer.** Mobile settings list and Keybinds (`settings-keybinds` 3.3% at 390, `settings-activity` 3.2% at 390).** Old rows are 56px high with no search field; new rows are about 52px with a "Search settings" field on top. Keybinds: the old app shows one chip per shortcut ("Ctrl + K"); the new app shows separate key caps ("Ctrl" "K"), and the section headings sit 4px lower. The header close button appears on the list page in the new app but not on sub-pages in the old. Files: `app/features/settings/MobileSettingsHome.tsx`, `app/components/Settings/SettingsSearch.tsx`, `app/features/settings/keybinds/Keybinds.tsx`.
- [x] **L10. Partly DONE: the file-card copy action uses the `</>` icon again. The blue dot on the header threads icon (`useHasUnreadThreads`) and the red shield in the top bar are driven by data (unread thread state, unverified session, see D1) and are left alone.** Header / rail icons (all room screens, about 0.3-0.7% each).** The new room header has an extra blue dot on the threads icon; the top bar has an extra red shield icon (probably tied to the unverified session, see D1); the file-card first action icon is a copy icon where the old one is `</>`. Small, but they are on every timeline screen. Files: `app/features/timeline/RoomHeader.tsx`, and the file card under `app/features/timeline/message/` (not located; search for the download / copy action icons).
- [ ] **L11. Home / jump-back-in list at 390 (`home` 4.9%).** Row height, avatar size and the unread pill differ: old rows are about 74px with a round avatar and no unread pill, new rows add a pill-shaped unread badge and show different rooms. The row structure itself matches (avatar, bold name, grey "Room · Space"). Mostly D2; check the badge shape, spacing and section header (`JUMP BACK IN` uppercase) separately once data matches. Files: `app/pages/client/HomeWelcome.tsx`, `HomeWelcome.css.ts`.
- [ ] **L12. Chat density / text size (`timeline-density-spacious` 0.4 / 0.6 / 1.1%, `timeline-font-large` 0.5 / 0.7 / 0.6%, `timeline-density-compact` 0.4 / 0.5 / 0.4%, `timeline-modern` 0.4 / 0.7 / 0.3%).** These already match (under 2%). Remaining pixels: thread summary bar and read-receipt dots sit a few px differently at 390. No action needed beyond L10.

- [x] **L13. What's New dialog (from `docs/UPSTREAM_SYNC.md`). DONE** (not in the harness, checked by code only): back to the old `Modal` with the sparkle title ("What's new in vX"), the old release-notes typography and the "Full changelog" link + "Got it" footer; the upstream date / socials row is gone. The release-notes glob in `whatsNew.ts` is now `@whatsnew/*.md`, so the 26.11 and 26.12.2 notes load.

### DATA / CONTENT differences (not CSS; do not chase with styling)

- [ ] **D1. The new app shows "Verify this session" (home, header shield).** The new client session has not been verified on the test account, so the home page has an extra card and the top bar has an extra icon; the old app skips verification via `wz_verify_skipped_device`. Check whether the new app honours that key (the harness sets it); if it uses a different key, set it in the harness or fix the new app. Files: `app/pages/client/HomeWelcome.tsx`, the verification banner component.
- [ ] **D2. Different unread badges and "jump back in" rooms (`home` 2.9% at 1440).** The new app lists rooms such as `big-296` / `big-170` with unread counts; the old lists `general` / `art-dump` first. The two clients read different unread state and ordering from the same account (JS SDK against the Rust core). Needs core or ordering parity, not CSS.
- [ ] **D3. Space page never loads children (`room-list-modern` 1.7% at 390, `space-settings-*` backgrounds).** In the new app the Mud Club space shows a "Join" button and an empty room list in the left column, with its children listed with Join buttons, even though the test account is a member. The old app shows the Voice channels and Games groups, and Invite / Settings / Members buttons. Re-captured once with the same result, so it is not timing. Likely the space membership or hierarchy from the Rust core. Files: `app/pages/client/SpaceOverview.tsx`, `app/pages/client/RoomListPanel.tsx`, `app/features/room/useSpaceHierarchy.ts`, `app/features/space/spaceHierarchy.ts`.
- [ ] **D4. Server rail space order and badges (`home` / every desktop screen).** Different order and different spaces get an unread dot (old: P, M, D, B; new: B, M, P, D on some screens). Sorting and unread counts, not styling. File: `app/pages/client/SpacesList.tsx`.
- [ ] **D5. Extra upstream UI in the new settings.** The nav has a "Search settings" field, plus Voice & Video, Encryption and Sessions entries the old build lacks; the room-settings General page adds a Spaces section where the old has a Soundboard section. Decide whether to keep them; they cost diff percentage on every settings screen.
- [ ] **D6. Profile popup content.** The old shows "336 mutual rooms" and "9 sessions / Last seen 2d ago"; the new app cannot (needs `mutualRooms` and device-list RPCs, see `docs/WEB_LOOK_NOTES.md` section 1 and `docs/MISSING.md` row P10).
- [ ] **D7. Cosmetics chooser (`profile-cosmetics` 0.9%).** Old opens the `CosmeticChooserModal`; the new account page edits cosmetics inline. Already in `docs/WEB_LOOK_NOTES.md` section 1.
- [ ] **D8. Dynamic content.** Message timestamps, presence dots, avatar tints and "Listening to ..." activity in the member list change between runs and add a floor of about 0.3-0.7% to every timeline screen.

Not a fix: `call-stage` and `call-soundboard` are "not meaningful (no call connects)"; the test server has no TURN/STUN media path.

## 5. Theme summary (`node themes.mjs` -> `out/themes.md`)

- Both apps have the same 29 themes (carbon, oled, pewter, umbra, eclipse, midnight, tokyo, nord, ocean, solar, forest, parrot, gruvbox, hallow, ember, crimson, garnet, cherry, rose, dracula, amethyst, mocha, ethereal, cloud, mint, daybreak, poppy, sakura, blossom). None is missing on either side.
- 32 mapped colour tokens per theme compared (928 total) after parsing every colour to RGBA, so `#fff`, `rgb(...)` and 8-digit hex compare equal. 0 tokens differ in any theme, so the per-theme colours are not a source of the diffs.
- Mapping (old -> new): `bgPrimary/bgSecondary/bgTertiary/bgInput/bgHover/bgActive` -> `color.bg.app/surface/raised/input/hover/active`; `scrim.modal` -> `bg.overlay`; `accent/accentHover/bgAccentGlow1/2` -> `accent.default/hover/glow1/glow2`; `link/onAccent` -> `text.link/onAccent`; `textPrimary/Muted/Secondary` -> `text.*`; `border` -> `border.default`; `msgMineBg/msgOtherBg` -> `message.mine/other`; `mention/error/danger/success/warning` -> `status.*`; `logo.p0..p5/hover/hoverGlow` -> `logo.*`. Documented at the top of `tools/parity/themes.mjs`.
- Not compared: old-only `shadow.*`, `scrim.soft/base/deep/media`, `radius.*`, `font.body`, `accentRgb`; new-only `presence.*`, `role.*`, `username.c1-8`, `status.info`, `border.strong/focus`, `text.disabled`, `accent.soft`, `message.highlight`.
- Global values differ (see the bottom table of `out/themes.md`): `radius.lg` is 18px old and 12px new (new `radius.xl` is 18px, so check which one components use); pill radius 999px vs 9999px (no visual effect); the old popup / popover / menu shadows (`0 8px 32px .45`, `0 8px 28px .35`, `0 8px 24px .4`) are replaced by `shadow.sm/md/lg` with different offsets; the old font stack includes the Twemoji fonts, the new is `Roboto, sans-serif` only. Popups and cards may look slightly different because of the shadows and `radius.lg`; worth a quick check when working on L4 and L6.
- Per-theme screenshots were dropped (the account's settings sync overrode the theme between screens), so theme rendering is only checked statically.

## 6. Harness caveats

- Carbon only, one capture per screen per width. Each capture is tried twice; a second failure is recorded in `out/failures.json` and in the report. None failed in the full run.
- `explore` at 390 and `settings-activity` at 390 are fallback shots: the Explore button or the Activity tab is not reachable at that width in either app, so the screenshots are just the home page or the settings list. Their 4.8% and 3.2% are not about those screens; treat them as not meaningful. `settings-activity` is also not present in the old mobile list.
- Both apps re-apply account settings after every sync. The harness sets theme and display modes in the account data first, then localStorage, and verifies after load. If you add a screen that needs a different setting, add a `display` entry to the screen in `screens.mjs`; for settings other than layout, density and text size, extend `setAccountDisplay` / `applyDisplay` / `displayMismatch` in `run.mjs`.
- `timeline-*`, `composer` and `profile-popup` reject a capture that still shows a raw `!room:id` instead of the room name (an earlier run captured the new app before the room had loaded). The wide-layout room screens also wait until the room name shows in both the header and the room list.
- The full run was done in two steps: old app run, then new app run. After adding the raw room id guard I re-captured the new app for the 8 timeline / `composer` / `profile-popup` screens, then `room-list-modern` and `explore`, and re-ran `--report-only`; the table above reflects that. The old-app side was captured once.
- Diffs are whole-viewport pixelmatch; modal screens include the dimmed page behind the modal, so a difference in the page behind (D2-D4) counts against the modal screen.
- Per-screen dynamic content (D8) gives a baseline of roughly 0.3-0.7%; do not treat anything under about 1% as a fix.
- The new dev server logs `Encountered two children with the same key` (`room-<id>`) and a `Maximum update depth exceeded` error during runs; unrelated to styling but worth fixing (the duplicate-key warning may be linked to D3).
- Only the local test server and the throwaway account `@theo:mudrix.test` are used. Never point the harness at a real homeserver.

## 7. Needs behaviour

Looks that depend on logic the new app does not have. The visual shell is in place; the data or behaviour is not.

- Server software name and version in the server picker status line ("Tuwunel 1.9.4 detected"): the new `discoverAuthCapabilities` result has no software field, so the line reads "Matrix homeserver detected".
- Register form: a taken / invalid username is shown under the form (not under the username field as in the old app), because the error handling in `RegisterForm` keeps the new single status line.
- Login: "That account is on another server, switch" (`welcome.idOtherServer`, `welcome.idSwitch`) and signing in to the other server from the id are not wired up.

## 8. Summary after the look pass (new app only re-captured; old captures unchanged except where noted)

Diff % per width, worst first. The old-app captures are from the first run; the harness now seeds the new app's What's New version so the dialog does not cover the home page. Remaining differences are mostly content (D1-D8 and the Needs behaviour list), the unread / space-order data on the home page behind every modal, and the extra upstream settings entries (search field, Voice & Video, Encryption, Switch accounts).

| Screen                    | 1440 |  820 |  390 |
| :------------------------ | ---: | ---: | ---: |
| space-settings-audit-log  | 2.58 | 3.25 | 6.13 |
| home                      | 2.66 | 0.78 | 4.92 |
| room-list-classic         | 2.66 | 0.78 | 4.92 |
| explore                   | 0.33 | 0.39 | 4.92 |
| settings-activity         | 1.59 | 2.01 | 3.15 |
| call-soundboard           | 3.02 | 0.72 | 0.00 |
| space-settings-channels   | 2.06 | 2.40 | 2.45 |
| settings-about            | 2.37 | 1.63 | 1.53 |
| search                    | 1.16 | 0.40 | 2.10 |
| settings-account          | 1.59 | 2.01 | 1.39 |
| room-settings-audit-log   | 1.38 | 1.71 | 1.17 |
| room-settings-general     | 1.38 | 1.70 | 1.17 |
| settings-appearance       | 1.34 | 1.58 | 0.49 |
| auth-server               | 0.61 | 0.82 | 1.56 |
| settings-keybinds         | 1.23 | 1.53 | 0.02 |
| settings-notifications    | 1.21 | 1.51 | 0.00 |
| settings-media            | 1.18 | 1.47 | 0.00 |
| settings-integrations     | 1.18 | 1.46 | 0.00 |
| settings-privacy          | 1.18 | 1.46 | 0.00 |
| settings-voice            | 1.13 | 1.40 | 0.00 |
| settings-developer        | 1.10 | 1.36 | 0.00 |
| inbox                     | 1.27 | 0.14 | 0.01 |
| room-settings-roles       | 0.85 | 1.00 | 1.17 |
| space-settings-roles      | 0.98 | 1.08 | 0.01 |
| timeline-density-spacious | 0.17 | 0.39 | 1.03 |
| auth-login                | 0.49 | 0.66 | 1.01 |
| room-list-modern          | 0.88 | 0.99 | 0.95 |
| auth-welcome              | 0.41 | 0.55 | 0.84 |
| profile-popup             | 0.73 | 0.81 | 0.08 |
| call-stage                | 0.53 | 0.73 | 0.00 |
| timeline-modern           | 0.43 | 0.66 | 0.37 |
| profile-cosmetics         | 0.48 | 0.58 | 0.00 |
| timeline-compact          | 0.14 | 0.38 | 0.56 |
| timeline-font-large       | 0.31 | 0.42 | 0.49 |
| timeline-bubble           | 0.44 | 0.34 | 0.40 |
| composer                  | 0.21 | 0.43 | 0.17 |
| timeline-density-compact  | 0.23 | 0.22 | 0.31 |

Notes on what is left over 2%:

- `space-settings-audit-log` 390 and `space-settings-channels`: the old capture shows the General page (the old rail has no Audit log tab); the new capture is the Audit log page. Different screens, not a look issue.
- `home` / `room-list-classic` / `explore` / `search` (390): jump-back-in rooms, unread pills and the verify card differ (D1, D2); `explore` at 390 is a fallback shot of home.
- `room-list-modern`: the space overview shows the same children, but with new-app Join / + buttons per section and a different left list order (see the Join-button finding below).
- `settings-about`: new nav entries and the account switcher shift the nav column; the page itself matches.
- `settings-activity`: not reachable on phones in the old app (fallback shot).
- `call-soundboard` / `call-stage`: not meaningful.
- Not done: L11 (home list row structure at 390) beyond what the other items changed; L10's header unread dot / red shield (data driven); the harness cannot reach the room state explorer, so it was not restyled.
- New upstream UI (item 10): the settings search field, Voice & Video tab and Get-the-apps dialog already use the shared Settings / Dialog / Button primitives and tokens (checked on `new-voice-video` and `new-get-apps`, harness-only screens without an old counterpart); the Get-the-apps buttons now use `onAccent` instead of a hard-coded white. No further restyling was needed.
