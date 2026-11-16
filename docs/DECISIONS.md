# Owner decisions

Decisions from the project owner that every port package follows. Newest at the bottom of each section.

## Branding and data

- **No WizardChat anywhere visible.** No screen, window title, session name, notification, store text or download link
  may show "WizardChat". The desktop session name is **Mudrix Desktop**. Legal attribution (LICENSE, upstream copyright
  lines, the "Based on WizardChat" credit) stays.
- **Data namespaces: read theirs, write ours.** Read `org.wizardchat.*` (and `chat.mudrix.*`) so people coming from
  WizardChat keep their data; always write `io.github.kapsikkum.mudrix.*`, never a WizardChat key. This covers custom
  status (`io.github.kapsikkum.mudrix.status`, with `chat.mudrix.status` / `org.wizardchat.status` read and the expiry
  in `expires` milliseconds), the watch-together topic and every other account-data / state / profile key.
- **Rename compatibility: some names stay forever.** These are wire names other software or stored data depends on, so
  they keep their pre-rename value and are not user-visible: the Android keystore alias `org.wizardchat.session`
  (`matrix/SessionStore.kt`), the OAuth/SSO callback scheme `org.wizardchat` (`matrix/MatrixSession.kt`), the built-in
  `wizardchat` sound pack id, the upstream YouTube bridge `app.wizardchat.org/youtube-player.html` (still upstream's
  player), and every upstream `org.wizardchat.*` account-data / profile name, which is read but never written (settings
  also read the older `io.gitlab.wizardchat.settings`). Accounts stored in the browser move from the upstream
  `wizardchat.accounts` / `wizardchat.account` keys to `mudrix.accounts` on the first read
  (`apps/web/src/core/accountsState.ts`), so nobody is signed out by the rename.

## Push and background delivery (compile-time choice)

- **iOS:** support both APNs push (needs an Apple Developer account, push entitlement and a gateway) and Mudrix's
  background keep-alive with local notifications. A compile-time flag picks one.
- **Android:** support UnifiedPush, the background keep-alive foreground service, and Firebase (FCM, the official
  channel, like APNs on iOS). A compile-time flag (Gradle flavour/property) picks one.
- No Apple or Firebase credentials exist yet; builds must work with the credential-free options.

### Notifications after a force-quit (APNs mode)

Silent (content-available) pushes are not delivered once the app has been force-quit, so `apns` mode registered a
pusher that asked for them and nothing was ever shown. The pusher now also asks for a visible, mutable alert
(`aps.alert` with a generic title and "New message", `mutable-content: 1`, ids still in `event_id_only` format), which
iOS shows and hands to the `NotificationService` extension in `apps/ios/NotificationService`. The extension restores
the account over the app's store in a second process and asks the core for the message itself, so a force-quit no
longer means a generic alert. What the owner must do:

- **Push Notifications capability** on the app target: build with `WZ_ENTITLEMENTS = WizardChat/WizardChat-Push.entitlements`
  (the default `WizardChat/WizardChat.entitlements` has no `aps-environment`, so no device token arrives).
- **App Group on all four bundle ids** (`...mobile`, `...mobile.widgets`, `...mobile.share`, `...mobile.notifications`):
  the account stores live in the app group container, and `NotificationService` needs the same `$(WZ_APP_GROUP)` as the
  app, the widget and the share extension.
- **Keychain Sharing on the app and `...mobile.notifications`**, for the access group
  `$(AppIdentifierPrefix)$(WZ_KEYCHAIN_GROUP)` (`WZ_KEYCHAIN_GROUP = $(WZ_BUNDLE_PREFIX).mobile` in
  `Config/Signing.xcconfig`). The session (access token, device id, store passphrase) is one keychain item in that
  group; the app's own container is not reachable from the extension. The value reaches the code through
  `WZKeychainAccessGroup` in Info.plist because the team prefix is not known at compile time. An empty or team-less
  value (an unsigned simulator build, as on CI) makes the app use the keychain without an access group, exactly as
  before.
- **A gateway that forwards `mutable-content`.** The app sends the alert in the pusher's `default_payload`, which
  Sygnal-style gateways merge into the APNs payload as-is; the gateway must not strip `aps` and must send the push as an
  alert (`push_type: alert` in Sygnal, that is the `apns-push-type: alert` header).

The extension restores the same session over the app's store with its own `StoreConfig.processName`
(`notification-service`; the app keeps the SDK's default `main`), which keeps the two processes' store locks apart, and
calls `pushedNotificationFromExtension`, which builds a `MultipleProcesses` notification client and never starts a sync
service. What it still can't do:

- **Decrypt an event whose room key this device doesn't have, or whose crypto store the app process is holding.**
  The event comes back with `encrypted: true` and an empty body; the extension then shows the room name from
  `rooms.json` over the generic text.
- **Reach a store that hasn't moved yet.** The app moves the account folders from its Application Support into the app
  group on the first launch after the update, before it restores a client. Until that has happened (or when the app
  group container isn't available at all), the extension can't open the store and keeps the generic text.

The extension keeps the app's mirrored settings: streamer mode hides the message text, and turning notification sounds
off silences the alert. In the app itself, a remote alert that carries an event id is suppressed while the app is on
screen (the sync path already shows the real notification), and a local notification about an event removes the push
iOS delivered for the same event, so there is only ever one entry.

## Content and assets

- **The presence dot sits above every cosmetic.** It is drawn at the avatar's z-layer on web (above decorations,
  profile frames and effects) and as the last overlay on Android and iOS, so a decoration can never hide someone's
  status.

- **Discord cosmetics sync script stays.** Running it is up to each user and is not a supported feature. The art
  shipped in the repo is original. No scraped packs in the repo or default config.
- **Mobile shell has two styles.** "Modern" is the default: a persistent space rail plus one content pane, matching
  the desktop look, with sheets and docked pickers as in `docs/MOBILE_BEHAVIOUR_NOTES.md`. "Classic" keeps the
  current shell (bottom pill navigation). The choice is a setting on Android and iOS.
- **Mobile swipes.** Swiping a message to the left replies. Swiping right in a chat goes back.
- **All built-in cosmetic art is original**, including the `eevee-stars` effect sprite and the `eevee-meadow`
  nameplate, so every built-in is drawn on every platform.
- **Device checks use the local test server** (`tools/test-server`) with its seeded accounts, never a real account.
- **Cosmetic packs are ported everywhere.** Settings > Cosmetics lists them, with an option to turn packs off, and
  pack cosmetics render on web, desktop, Android and iOS.
- **Game detection stays and should be built upon** (`games.json`, desktop activity detection).
- **Sound packs** came from each chat app respectively (Element, Cinny, FluffyChat, Commet, ...); credit each in
  `packages/sounds/LICENSES.md`.
- **Embedded widgets (I5) are in scope**, with a security review of the sandbox.

## Desktop shell

- **Only `tauri dev` shows a console window** (owner report, 2026-11-16): the debug-profile test
  installers used to open one beside the app, because `windows_subsystem` was only set for release builds. The
  attribute is now `not(dev)` — every built installer, debug-profile included, is a GUI app, while the dev session
  keeps its console for logs.

## Keys and secrets

- GIF keys: the owner adds the `VITE_GIPHY_API_KEY` and `VITE_KLIPY_API_KEY` repo secrets.
- Android release APKs are signed with the old `mudrix-release.keystore`, and desktop in-app update artifacts
  with the old `mudrix-updater` minisign key, so existing installs keep updating in place. The keystore was re-encrypted
  with a new password on 2026-11-16 (same certificate; the old password was lost). The passwords live in the owner's
  password manager and in GitHub repository secrets, never in the tree. Windows code signing, macOS notarisation and all
  of iOS signing do not exist: there is no Apple Developer account, so iOS remains Simulator-only (no device install,
  TestFlight, App Store or APNs).

## Encryption keys

- Room-key **file** import/export (an exported `.txt` key file) is separate from the recovery key. The recovery key
  restores from server-side key backup and works on every platform including web. File import/export is offered where
  matrix-rust-sdk allows it (desktop and mobile, by path); on web it is not possible with the current SDK.

## Parity: won't-do

Rows in `docs/PARITY_MATRIX.md` that stay undone on purpose, with the reason a user would be given:

- **N1, iOS reminders with the app closed.** iOS schedules the reminder as a local notification, but a suspended app
  cannot learn that another device already delivered the event. That ceiling is the platform's, so this stays
  **won't-do**; reminders still work while the app runs.
- **X1, native sheet stretch/wobble and docked emoji picker.** These are web-only effects. Android and iOS use their
  platform sheets and pickers, which users already know; copying the web animation would fight those gestures.
- **X2, swipe right from anywhere to open the room list (web).** Swiping a message to the right is swipe-to-reply on
  every platform. Two meanings for one gesture would break replies, so this stays **won't-do**.
- **S1, the Ogg-only iOS sound packs (Cinny, Commet).** iOS cannot decode Ogg on the system banner-sound path. The
  packs are left out in Settings rather than shown as silent; that part is **won't-do**.
- **K8, room-key file export on web.** matrix-rust-sdk 0.19 exports key files by file path and wasm has no file path.
  Desktop and mobile offer export/import; web offers server key backup and recovery only.
- **K5, reset sync cache.** The core keeps sync state and the crypto keys in one store, so clearing the sync cache
  would wipe the encryption keys. It is not offered on any platform; clear-media-cache remains.
- **I5, running a widget's own code inside the app on mobile.** Mobile lists a room's widgets and opens them outside the
  app (Android) or in a read-only sandboxed viewer (iOS). Running a widget's driver — third-party code with app
  capabilities — needs a security review of the sandbox first; until then it is **won't-do** on both phones.
- **R3, a second Matrix-style rooms panel inside the space settings.** Both phones have the Channels tab and the
  auto-join runner; a panel duplicating the room list adds no capability, so the rest of the row is **won't-do**.
- **S5, editing a space's own soundboard from the call sheet (iOS).** Room boards are editable on both phones; a space
  board is edited from the space settings, which avoids a second editor in the call sheet.
- **E3, the hosted web build needs one repository setting.** The Pages workflow is in `.github/workflows/pages.yml`
  (stable on tags, `/next/` on `web-look`/`main`); it cannot deploy until Pages is switched to "GitHub Actions" in the
  repository settings, which is an owner action. The row stays partial until that is done.

## Parity: kept web deviations from the old app

- **Cosmetic packs have a switch.** Settings > Cosmetics keeps `showCosmeticPacks` (default on) so people who do not
  want pack art can turn it off; the old app had no switch. The choice syncs.
- **Built-in decorations moved to Account > Profile cosmetics.** The built-in decorations, nameplates, frames and
  effects live in Account > Profile cosmetics (`ProfileStyle` inside `ExtendedProfile`), not in a separate dialog, so
  there is one place to edit the profile.
- **Account > Status is its own page**, using the core-backed status and expiry, instead of only the profile modal.
- **Voice & Video is a page**, not a section inside Voice & Audio: device/processing toggles and the per-event sounds
  stay together, while sound packs and the soundboard keep their Mudrix page.
- **The system accent colour row is last** in Appearance, under the Carbon theme, because it only applies there.
- **Settings search was removed from the desktop settings dialog** and kept on the mobile settings list, where
  scrolling through 20 pages is the slow part. Room and space settings keep their own search.
- **The space rail defaults to the core's stream order.** A stored old-app order (`wz_space_order`) is honoured until
  the user drags a space; after the first drag the new order is written to room account data and the old key is
  ignored.

## Rooms, threads and room lists

- **The DM screen's order is the user's choice** (owner request, 2026-11-16; Android and iOS): most recent activity
  (the old app's order, default), newest first, oldest first, or categorised. Newest/oldest use the room's
  `m.room.create` timestamp, so a long-lived room you just joined is not "newest" — that is a deliberate choice over
  join time. Categorised always shows the sections: pinned, favourites, DMs, rooms. "Separate rooms and direct
  messages" can be turned off to merge DMs and rooms into one list; categorised ignores it. Favourite rooms (and DMs)
  can be pulled into their own section or sort inline. Pinned users sit above everything and are saved by user id in
  `io.github.kapsikkum.mudrix.room_list`, so a pin survives a room upgrade and follows the account to the other app.
  The manual Home order still wins while the mode is "most recent"; picking newest/oldest replaces it.
- **An unnamed two-person room stays a room, not a DM.** Core rule: only a room in `m.direct` is a DM
  (`crates/core/src/rooms.rs`). The old app guessed from the member count; that guess is deliberately not ported, and
  such a room is listed under Rooms. R8 in the parity matrix records this as **won't-do** everywhere.
- **Thread support is on app-wide.** The core enables SDK thread support, so thread replies never count toward a
  room's badge and threads are available in every room that has them.
- **The room list loads 20 events per room** (owner-approved), which is enough for the last-message preview and the
  unread counts without loading full timelines for every room.

## Message layout

- **Bubble layout polish (owner request, 2026-11-16), all platforms, bubble layout only:** no per-message encryption
  shield in the gutter; only a message with a real warning shows a small icon inside the bubble beside the time.
  Emoji-only messages have no bubble background. Pictures, videos, GIFs and galleries fill the bubble edge to edge
  (Messenger/Instagram style), a media-only message has no coloured frame and shows its time in a small pill over the
  picture, and a caption sits below the media inside the bubble. This is a deliberate deviation from the old web app's
  bubble layout; the other layouts are unchanged.
- **Bubble reactions hang on the bubble's edge** (owner request, 2026-11-16): the reaction pills overlap the bottom of
  the bubble by about half their height, aligned right for your messages and left for everyone else's, as Messenger
  does. The other layouts keep the plain row under the message.
- **Unslop polish pass on web (owner request, 2026-11-16):** spacing snapped to the token grid, glows and gradient
  washes removed from Home and call tiles, emoji used as chrome replaced by Phosphor icons, no uppercase tracked labels,
  heading weight 600 max, no italics in empty states, and no `!` or trailing full stop on short UI strings in all 11
  languages. This deliberately overrides the old app's look where they differ. Not applied (owner's call): the
  "Welcome, {{name}}" greeting, snapping the remaining 6px/10px steps, merging the type scale.
- **The Modern shell's user card has a settings cog, not an inbox bell** (owner request, 2026-11-15): the inbox is
  already at the top of the shell.
