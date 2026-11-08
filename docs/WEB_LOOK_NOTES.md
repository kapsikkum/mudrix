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
