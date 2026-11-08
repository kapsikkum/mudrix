# Web Look Notes & Behaviour Discrepancies

This document tracks visual differences between the new web client (`apps/web`) and the target look in `mudrix-web` that cannot be resolved solely through CSS/styling changes because they depend on missing Rust core RPCs, data models, or core behaviour changes.

---

## 1. User Profile Popup (`profile-popup`)

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

## 3. Settings & Modal Backdrops (`room-settings-*`, `settings-*`)

- **Modal Backdrop Scrim & Timeline Artifacts**:
  - Modal dialogs (such as Room Settings and Space Settings) are displayed with a semi-transparent scrim (`vars.scrim.modal` / `rgba(0,0,0,0.6)`).
  - In tablet viewports (820x1180), the centered modal dialog measures < 1.0% diff internally, but the visible background timeline around the modal exhibits variance driven by live message relative timestamps ("just now", "1m ago"), presence badges, and seeded room avatar gradient generation.
- **Roles & Permissions and Audit Log Subpanels**:
  - On desktop (1440px) and mobile (390px), both `room-settings-roles` and `room-settings-audit-log` achieve < 1.3% pixel diff across Carbon, Amber, and Ethereal themes.
- **User Settings Account & Appearance (`settings-account`, `settings-appearance`)**:
  - `settings-account` achieves 1.57% diff on desktop (1440px) and 1.94% on tablet (820px) across Amber and Ethereal themes.
  - Remaining variance on mobile (390px) is driven by the dynamic safe-area-inset fallback variables and seed user avatar placeholder tint.
  - `settings-appearance` desktop achieves 3.0% diff; minor differences stem from presence and profile effect toggles currently reserved in `mudrix-web`'s feature branches.
