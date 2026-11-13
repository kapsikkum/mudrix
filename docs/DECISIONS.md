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
iOS shows and hands to the `NotificationService` extension in `apps/ios/NotificationService`. What the owner must do:

- **Push Notifications capability** on the app target: build with `WZ_ENTITLEMENTS = WizardChat/WizardChat-Push.entitlements`
  (the default `WizardChat/WizardChat.entitlements` has no `aps-environment`, so no device token arrives).
- **App Group on the new target's provisioning profile.** `NotificationService` uses `$(WZ_APP_GROUP)` like the app, the
  widget and the share extension; the App Group capability has to be enabled for all four bundle ids
  (`...mobile`, `...mobile.widgets`, `...mobile.share`, `...mobile.notifications`).
- **A gateway that forwards `mutable-content`.** The app sends the alert in the pusher's `default_payload`, which
  Sygnal-style gateways merge into the APNs payload as-is; the gateway must not strip `aps` and must send the push as an
  alert (`push_type: alert` in Sygnal, that is the `apns-push-type: alert` header).

The core now supports the extension decrypting the notification itself: the extension restores the same session over the
app's store with its own `StoreConfig.processName` (the SDK's cross-process lock holder name; the app keeps the default
`main`, the extension uses `notification-service`) and calls `pushedNotificationFromExtension`, which builds a
`MultipleProcesses` notification client and never starts a sync service. Two conditions remain:

- **The store and the session must be reachable from the extension**: the store path has to live in the App Group
  container and the session (access token, device id) in a keychain item shared with the app through an access group.
- **Keys that haven't reached this device can't be fetched while the app holds the crypto store lock.** The extension
  then gets the notification with `encrypted: true` and an empty body, and shows the generic text (plus the room name
  from `rooms.json`) instead of the message.

Until the iOS app implements that (app + extension: App Group store path, shared keychain item, `processName`s, the
call above), the extension keeps showing the room's name from the app group (`rooms.json`) over the generic text, plus
the ids that open the room on tap.

## Content and assets

- **Discord cosmetics sync script stays.** Running it is up to each user and is not a supported feature. The art
  shipped in the repo is original. No scraped packs in the repo or default config.
- **Mobile shell has two styles.** "Modern" is the default: a persistent space rail plus one content pane, matching
  the desktop look, with sheets and docked pickers as in `docs/MOBILE_BEHAVIOUR_NOTES.md`. "Classic" keeps the
  current shell (bottom pill navigation). The choice is a setting on Android and iOS.
- **Mobile swipes.** Swiping a message to the left replies. Swiping right in a chat goes back.
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
