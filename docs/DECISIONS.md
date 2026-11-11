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

## Content and assets

- **Discord cosmetics sync script stays.**
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
