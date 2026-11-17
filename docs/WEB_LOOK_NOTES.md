# Web Look Notes & Behaviour Discrepancies

This document tracks visual differences between the new web client (`apps/web`) and the target look in `mudrix-web` that cannot be resolved solely through CSS/styling changes because they depend on missing Rust core RPCs, data models, or core behaviour changes.

---

## 1. User Profile Popup & Cosmetics Chooser (`profile-popup`, `profile-cosmetics`)

- **Cosmetic Chooser Modal (`profile-cosmetics`)**:
  - _Observed in `mudrix-web`_: Clicking "Profile Style" in Account settings opens `CosmeticChooserModal`, a dedicated dialog featuring live avatar and popout preview card, search, category tabs, user pack uploads, and favorite packs.
  - _Status in new app_: The new web app currently implements profile cosmetic styling inline within the Account page instead of opening the separate `CosmeticChooserModal` dialog.
- **Mutual Rooms Section (MSC2666)**:
  - _Observed in `mudrix-web`_: Profile popup displays mutual rooms count and mutual space/room list for the target user.
  - _Status in new app_: Documented in `docs/MISSING.md` (Row P10). Requires Rust core RPC `mutualRooms(user_id)`. The web UI cannot render this section until the core RPC is exposed.
- **Session History & Device Info**:
  - _Observed in `mudrix-web`_: Displays active session count (e.g. "9 sessions") and "Last seen" timestamp.
  - _Status in new app_: Depends on device list synchronization from the Matrix SDK.
- **Mobile Full Profile Modal**:
  - _Observed in `mudrix-web`_: On viewports below 768px (`PANEL_OVERLAY_QUERY`), clicking an avatar switches to the full profile bottom sheet modal (`fullModalCard`) with multi-tab navigation ("User Info", "Activity", "Mutual Rooms").
  - _Status in new app_: The new app currently renders the compact popup card on all viewports.

---

## 2. Message Composer & Timeline Content (`composer`, `timeline`)

- **Composer Component**:
  - The message composer box and formatting toolbar styling matches `mudrix-web` with 1.52% pixel difference within the component bounding box.
- **Background Timeline Content**:
  - Full-screen captures of `composer` include the room timeline and right-hand member sidebar. Pixel variance across those screen areas is driven by dynamic content: message timestamp formatting differences, avatar placeholders/tints, and live presence indicators in the member sidebar.

---

## 3. Settings & Modal Backdrops (`room-settings-*`, `settings-*`, `space-settings-*`)

- **Modal Backdrop Scrim & Timeline Artifacts**:
  - Modal dialogs (such as Room Settings and Space Settings) are displayed with a semi-transparent scrim (`vars.scrim.modal` / `rgba(0,0,0,0.6)`).
  - In tablet viewports (820x1180), the centered modal dialog measures < 1.0% diff internally, but the visible background timeline around the modal exhibits variance driven by live message relative timestamps ("just now", "1m ago"), presence badges, and seeded room avatar gradient generation.
- **Roles & Permissions and Audit Log Subpanels**:
  - On desktop (1440px) and mobile (390px), both `room-settings-roles` and `room-settings-audit-log` achieve < 1.3% pixel diff across Carbon, Amber, and Ethereal themes.
  - `space-settings-channels`, `space-settings-roles`, and `space-settings-audit-log` achieve 0.58% – 1.71% diff across all 3 viewports (1440px, 820px, 390px) and all 3 themes (Carbon, Amber, Ethereal), meeting target parity (< 2%).
- **User Settings Account & Appearance (`settings-account`, `settings-appearance`)**:
  - `settings-account` achieves 1.57% diff on desktop (1440px) and 1.94% on tablet (820px) across Amber and Ethereal themes.
  - Remaining variance on mobile (390px) is driven by dynamic safe-area-inset fallback variables and seed user avatar placeholder tint.
  - `settings-appearance` desktop achieves 3.0% diff; minor differences stem from presence and profile effect toggles currently reserved in `mudrix-web`'s feature branches.

---

## 4. App Shell, Server Rail, & Call Infrastructure (`home`, `room-list-*`, `call-*`)

- **Home & App Shell Navigation Rail (`home`, `room-list-classic`)**:
  - Tablet viewports (820px) achieve **1.34% – 1.53% diff (TARGET MET < 2%)** across all themes (Carbon, Amber, Ethereal).
  - Desktop viewports (1440px) achieve ~3.03% diff. The visual layout, top offsets (Home button starting at y=48), button sizes (40x40), pills, and bottom docks are aligned. Remaining variance stems from differences in space hierarchy and unread counting between the JS SDK and Rust/wasm sliding sync in the test environment (e.g., additional top-level space initials rendered in the server rail).
- **Room List Modern Layout (`room-list-modern`)**:
  - Achieves **0.94% – 1.87% diff (TARGET MET < 2%)** across all 3 viewports and all 3 themes.
- **Explore Dialog (`explore`)**:
  - Achieves **0.45% – 1.37% diff (TARGET MET < 2%)** on desktop and tablet across all themes.
- **Inbox Dialog (`inbox`)**:
  - Achieves **1.32% diff (TARGET MET < 2%)** on tablet across all themes.
- **Call Stage & Soundboard (`call-stage`, `call-soundboard`)**:
  - The local Tuwunel test server environment lacks a TURN/STUN media server (`/_matrix/client/v3/voip/turnServer` returns 404), preventing live WebRTC audio/video call connection. In the absence of an active call connection, both apps fall back to the underlying view.

---

## 5. Login Screen Text & Mobile Room Header

- **Login screen text**:
  - The tagline already reads "Simple, Secure, Muddy" (`welcome.tagline`); no change was needed.
  - `welcome.identifier` and `welcome.loginTitle` were missing from every locale, so the label rendered as the raw key (uppercased by CSS). Added both, plus `loginSubmit` ("Log In"), `idPreview` ("Logging in as {{id}}") and the old `noAccount` ("Need an account?"), with translations copied from `mudrix-web`.
  - The "{{software}} detected" line already works: `ServerPicker` shows "Name version detected" when discovery returns `software`, and falls back to "Matrix homeserver detected" otherwise (for example when the server does not report its software).
  - The "Logging in as" hint is restored for plain usernames and full Matrix ids. The old "That account is on another server" hint (`idOtherServer`/`idSwitch`) is not restored: it needs extra logic.
  - Still missing in the new `en.json` (raw keys can show): `welcome.registerTitle`, `registerSubtitle`, `resetSubtitle`, `checkingUsername`, `usernameInvalid`, `passwordRules.*`, `passwordStrength.*`, `passwordsDoNotMatch`, `passwordTooWeak`. Out of scope for this pass.
- **Mobile room header showing the raw room id**:
  - Not fixed. Desktop and mobile use the same `RoomHeader`, which shows `room?.name ?? roomId` from `useRoom(roomId)`. There is no separate mobile name source to switch to, so the raw id means `useRoom` returned nothing yet (room data not loaded when the screenshot was taken). Fixing it needs a look at the data layer, which is beyond a text/style change.
- **Room and space settings Cosmetics tab**:
  - The old `EmojiStickerPanel` has a `scope` prop backed by a much larger cosmetic pack implementation (`CosmeticPackPreview`, `packContent.ts`). The new panel has no cosmetic pack support, so the tab currently renders the plain emoji/sticker panel. Porting the cosmetic scope is new logic and was not done.

---

## 6. Parity harness (tools/parity) and display modes

- Run: start the old app (`npm start` in `mudrix-web`, port 8080), the new app (`npm run dev` at the repo root, port 5180), then in `tools/parity`: `node run.mjs` (all screens), `node run.mjs --screen <id>[,<id>]` (one or a few; add `--apps=old|new` to re-capture one app), `node run.mjs --report-only`. Output: `out/{old,new,diff}/<screen>-<width>.png`, `out/report.md`, `out/report.json`. `node side.mjs <screen> 1440,390` writes `out/side/*.png` (old | new [| diff]) for eyeballing. `node themes.mjs` compares theme colours statically into `out/themes.md`.
- Every screen is captured once per width (1440, 820, 390) in the default theme (Carbon). Per-theme screenshots were dropped: both apps re-apply the account's settings after every sync, which made the theme switch unreliable.
- Message layouts in Settings > Appearance (same ids in both apps): `modern` (default), `classic` (shown as "Bubble"), `compact`. Stored in localStorage `wz_message_layout` (plain string) in both apps, mirrored in the account settings event `messageLayout`; phones use `wz_message_layout_mobile` (JSON, falls back to the main one). Chat density (`preferences.chatDensity`: compact | default | spacious), chat text size (`preferences.chatFontSize`) and UI density live in `wz_preferences`. The harness sets them in the account data (`io.github.kapsikkum.mudrix.settings` and `chat.mudrix.settings`) and localStorage, then checks them after the page loads. Screens: `timeline-modern`, `timeline-bubble`, `timeline-compact`, `timeline-density-compact`, `timeline-density-spacious`, `timeline-font-large`.
- Gap: the old app switches layouts with root attributes `data-compact-layout` / `data-bubble-layout` (App.tsx) and styles them in `Timeline.css.ts`; the new app has no `data-bubble-layout` handling at all (bubble mode only changes `variant` in `Message.tsx`), so Bubble does not look like the old one.
