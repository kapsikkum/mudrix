# Owner decisions

Decisions from the project owner that every port package follows. Newest at the bottom of each section.

## Branding and data

- **No WizardChat anywhere visible.** No screen, window title, session name, notification, store text or download link
  may show "WizardChat". The desktop session name is **Mudrix Desktop**. Legal attribution (LICENSE, upstream copyright
  lines, the "Based on WizardChat" credit) stays.
- **Data namespaces: read theirs, write ours.** Read `org.wizardchat.*` (and `chat.mudrix.*`) so people coming from
  WizardChat keep their data; always write `io.github.kapsikkum.mudrix.*`, never a WizardChat key. This covers custom
  status (`org.wizardchat.status`), the watch-together topic and every other account-data / state / profile key.

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

## Keys and secrets

- GIF keys: the owner adds the `VITE_GIPHY_API_KEY` and `VITE_KLIPY_API_KEY` repo secrets.
- Signing keys (Apple, Windows code signing, Tauri updater) do not exist. Release workflows must build unsigned until
  they do, and say so.

## Encryption keys

- Room-key **file** import/export (an exported `.txt` key file) is separate from the recovery key. The recovery key
  restores from server-side key backup and works on every platform including web. File import/export is offered where
  matrix-rust-sdk allows it (desktop and mobile, by path); on web it is not possible with the current SDK.
