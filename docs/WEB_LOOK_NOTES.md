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
