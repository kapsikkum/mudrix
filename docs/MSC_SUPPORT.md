# MSC support

What Matrix Spec Change proposals this repository implements, and where. Built on 2026-11-21 from
`next` at `8a73d2e1` by scanning `apps/`, `crates/` and `packages/` for `MSC<number>` and
`org.matrix.msc<number>` references, then checking each hit in the code. A machine-readable copy is
[MSC_SUPPORT.csv](MSC_SUPPORT.csv).

## Legend

- **Yes** - the app or core implements the wire format or feature.
- **Partial** - only part of the proposal, or only a compatibility path.
- **No** - not implemented; a reference may still appear in a test or a comment.
- **Core** - `crates/core`. A `Yes` there with `Yes` in the app columns usually means the app gets
  the behavior through the core rather than its own wire code; the notes say when.

Stable spec features that came from an MSC but are not named by number in the code are in the
second table. Other stable protocol behavior (sync, E2EE, receipts, typing, presence) comes from the
spec and matrix-sdk and is not tracked here; see [PARITY_MATRIX.md](PARITY_MATRIX.md).

## MSCs named in the code

| MSC     | Title                                  | Status   | Web     | Android | iOS | Core | Notes                                                                                      |
| ------- | -------------------------------------- | -------- | ------- | ------- | --- | ---- | ------------------------------------------------------------------------------------------ |
| MSC1767 | Extensible event types & fallback (v2) | Accepted | Partial | No      | No  | No   | Web polls send `org.matrix.msc1767.text`; no general extensible-event parsing in app code. |
| MSC2285 | Private read receipts                  | Accepted | No      | No      | No  | No   | Only a feature-list check in a delayed-events test.                                        |
| MSC2545 | Image packs (emoticons & stickers)     | Accepted | Yes     | Yes     | Yes | Yes  | Personal and room packs, custom emoji, stickers.                                           |
| MSC2666 | Rooms in common with another user      | Accepted | Yes     | Yes     | Yes | No   | Web hook plus native mutual-rooms helpers.                                                 |
| MSC2705 | Animated thumbnails for media          | Accepted | Partial | No      | No  | No   | Profile effects ask for a still thumbnail with `animated=false`.                           |
| MSC2762 | Widgets send/receive events            | Open     | Yes     | No      | No  | No   | `org.matrix.msc2762.timeline` capability. Widgets only run on web/desktop.                 |
| MSC2873 | Identifying clients in widgets         | Open     | Yes     | No      | No  | Yes  | Core appends `org.matrix.msc2873.client_id` to widget URLs.                                |
| MSC2965 | OAuth 2.0 server metadata discovery    | Accepted | Yes     | Yes     | Yes | No   | Web reads `auth_metadata`; mobile signs in with OIDC through matrix-sdk.                   |
| MSC3030 | Jump to date API                       | Accepted | Yes     | Yes     | Yes | Yes  | Web jump-to-date modal, native sheets, core history jump.                                  |
| MSC3230 | Spaces top-level order                 | Open     | Yes     | No      | No  | No   | `org.matrix.msc3230.space_order` on the space.                                             |
| MSC3245 | Voice messages                         | Open     | Yes     | Yes     | Yes | Yes  | Record, send, waveform, playback.                                                          |
| MSC3381 | Polls (mk II)                          | Accepted | Yes     | Yes     | Yes | Yes  | Create, vote, end; stable `m.poll.*` with unstable fallback.                               |
| MSC3401 | Native group VoIP signalling           | Closed   | Partial | No      | No  | No   | Legacy `org.matrix.msc3401.call` room type and permissions; MatrixRTC replaces it.         |
| MSC3417 | Call room room type                    | Open     | Yes     | Yes     | Yes | Yes  | `org.matrix.msc3417.call`.                                                                 |
| MSC3488 | Location events                        | Open     | Yes     | Yes     | Yes | Yes  | `geo:` URI plus `org.matrix.msc3488.location`/`asset`.                                     |
| MSC3819 | Widgets send to-device messages        | Open     | No      | No      | No  | No   | Appears only in widget capability test fixtures.                                           |
| MSC3861 | Next-generation auth (OAuth/OIDC)      | Accepted | Yes     | Yes     | Yes | Yes  | Sign-in on the server's own page.                                                          |
| MSC3881 | Remote push notification toggle        | Open     | No      | No      | No  | No   | Only a negative case in an invite-blocking test.                                           |
| MSC3916 | Authenticated media                    | Accepted | Yes     | Yes     | Yes | Yes  | Core requests media with authentication; apps render through core.                         |
| MSC4039 | Widget content repository access       | Open     | Yes     | No      | No  | No   | `MSC4039UploadFile` widget capability. Web only.                                           |
| MSC4075 | MatrixRTC invites and notifications    | Open     | No      | No      | No  | Yes  | `org.matrix.msc4075.rtc.notification` handled in core calls only.                          |
| MSC4108 | QR code login                          | Open     | No      | Yes     | Yes | Yes  | Core login API; native QR scanner and QR display. Web has no QR UI.                        |
| MSC4133 | Extended profile key/value fields      | Accepted | Yes     | Yes     | Yes | Yes  | Banner, bio, pronouns, timezone, accent.                                                   |
| MSC4140 | Cancellable delayed events             | Accepted | Yes     | Yes     | Yes | Yes  | "Send later" and the scheduled list.                                                       |
| MSC4143 | MatrixRTC                              | Accepted | Yes     | Yes     | Yes | Yes  | Well-known `rtc_foci`; call UI in all apps.                                                |
| MSC4155 | Invite filtering                       | Open     | Yes     | Yes     | Yes | No   | `M_INVITE_BLOCKED` / `ORG.MATRIX.MSC4155.INVITE_BLOCKED`.                                  |
| MSC4175 | Profile time zone field                | Accepted | Yes     | Yes     | Yes | Yes  | `m.tz`.                                                                                    |
| MSC4186 | Simplified sliding sync                | Accepted | Yes     | Yes     | Yes | Yes  | Core sync; apps get it through core.                                                       |
| MSC4193 | Spoilers on media                      | Open     | Yes     | Yes     | Yes | Yes  | `page.codeberg.everypizza.msc4193.spoiler`.                                                |
| MSC4230 | Animated image flag                    | Accepted | Yes     | Yes     | Yes | Yes  | `is_animated` on uploaded images and timelines.                                            |
| MSC4247 | User pronouns                          | Open     | Yes     | Yes     | Yes | Yes  | `m.pronouns`, with vendor fallbacks.                                                       |
| MSC4310 | MatrixRTC decline event                | Closed   | No      | No      | No  | Yes  | `org.matrix.msc4310.rtc.decline` in core calls.                                            |
| MSC4380 | Invite blocking                        | Accepted | Yes     | Yes     | Yes | Yes  | `org.matrix.msc4380.invite_permission_config` account data.                                |
| MSC4427 | Custom profile banners                 | Open     | Yes     | No      | No  | No   | `m.banner_url` in web profiles only.                                                       |
| MSC4440 | Profile biography                      | Open     | Yes     | Yes     | Yes | Yes  | `m.biography`, with vendor fallbacks.                                                      |
| MSC4577 | Soundboards for MatrixRTC calls        | Open     | Yes     | Yes     | Yes | Yes  | Standard board format; old Mudrix format is read and migrated.                             |

## Stable features whose MSC is not named in the code

These are implemented through the spec and matrix-sdk, so the code does not carry the proposal
number.

| MSC     | Feature               | Status           | Web | Android | iOS | Notes                                   |
| ------- | --------------------- | ---------------- | --- | ------- | --- | --------------------------------------- |
| MSC1772 | Spaces                | Accepted         | Yes | Yes     | Yes | Child rooms, hierarchy, space settings. |
| MSC2403 | Knock                 | Accepted         | Yes | Yes     | Yes | Knock and withdraw.                     |
| MSC3440 | Threads               | Accepted         | Yes | Yes     | Yes | `m.thread` timelines and replies.       |
| MSC2677 | Reactions             | Accepted         | Yes | Yes     | Yes | Send, aggregate, redact.                |
| MSC2676 | Message edits         | Accepted         | Yes | Yes     | Yes | `m.replace` and `m.new_content`.        |
| MSC1501 | Room version upgrades | Closed (shipped) | Yes | Yes     | Yes | Tombstone and predecessor handling.     |
| MSC3952 | Intentional mentions  | Accepted         | Yes | Yes     | Yes | `m.mentions` and highlight rules.       |

## Notable gaps

- **DM archiving**: there is no archive MSC. The spec only has left-room inclusion in `/sync`
  (`include_leave`, MSC210) and forgetting a room. Element Web models left rooms with a synthetic
  `im.vector.fake.archived` tag; a WhatsApp-style archive (hide without leaving) is still an open
  request, not a proposal. Mudrix uses its own `u.archived` room tag, with the archive time in the
  tag's `order`, and the core unarchives on a newer message (see
  [DECISIONS.md](DECISIONS.md#rooms-threads-and-room-lists)).
- **MSC4021 Archive client controls** is about the public room archive (`matrix-public-archive`),
  not direct messages, and is still open.
- **MSC2199 Canonical DMs**: server-side; the homeserver must put `m.kind` in the sync summary and
  `m.dm` on membership events. No homeserver implements it (tuwunel reports `0/0`, "no m.kind in
  sync summary; uses legacy m.direct"), and ruma 0.25 drops `m.kind`, so the client half cannot be
  observed. Mudrix keeps using `m.direct`.
- **MSC2285 private read receipts**: not implemented.
- **Live location / beacons**: no beacon support.
- **MSC3819 / MSC3881**: not implemented.
- **Widgets on mobile**: Android and iOS list widgets but do not run them; widget MSCs are web only.
