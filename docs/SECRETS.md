# Build-time keys and embedded identifiers

No third-party API key is committed to this repository. Keys are supplied when an app is built, locally from a git-ignored
file and in CI from repository secrets. This page lists every key, where each platform reads it, and the audit of what
else in the tree belongs to somebody else's account. Never write a real value into a tracked file, a doc or an issue.

The GIPHY key that older revisions of the Android, iOS and web apps shipped is WizardChat's (upstream's), not ours. It stays
in git history and in upstream's public repository; history is not rewritten here.

## Keys

| Key              | Used by                   | Variable per platform                                                  | Where to put it locally                             | Without it                                   |
| ---------------- | ------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| GIPHY API key    | web, desktop (web bundle) | `VITE_GIPHY_API_KEY`                                                   | `apps/web/.env.local` (see `apps/web/.env.example`) | GIPHY tab disabled, "not configured" tooltip |
| GIPHY API key    | Android                   | `GIPHY_API_KEY`: Gradle property, else environment variable, else file | `apps/android/local.properties` (git-ignored)       | GIF picker shows "not configured"            |
| GIPHY API key    | iOS                       | `GIPHY_API_KEY` build setting, surfaced as Info.plist `WZGiphyApiKey`  | `apps/ios/Config/Secrets.xcconfig` (git-ignored)    | GIF picker shows "not configured"            |
| KLIPY API key    | web, desktop (web bundle) | `VITE_KLIPY_API_KEY`                                                   | `apps/web/.env.local`                               | KLIPY tab disabled                           |
| Push gateway URL | Android                   | `PUSH_GATEWAY_URL` (same lookup as `GIPHY_API_KEY`)                    | `apps/android/local.properties`                     | No pusher is registered                      |

Android and iOS have no KLIPY support, so they take no KLIPY key.

Notes:

- `VITE_*` values are embedded in the built JavaScript, so the web and desktop keys are visible to anyone who can load the
  app. Use keys you own and restrict them at the provider where it allows. Android and iOS keys end up in the app binary
  the same way.
- Vite reads `apps/web/.env.local` because the web app's Vite root is `apps/web`. Restart the dev server after a change.
- Android: `./gradlew -PGIPHY_API_KEY=... :app:assembleGplayRelease`, `GIPHY_API_KEY=... ./gradlew ...` and a
  `GIPHY_API_KEY=...` line in `local.properties` all work, in that order of precedence. Values become `BuildConfig` fields.
- iOS: copy `apps/ios/Config/Secrets.example.xcconfig` to `Secrets.xcconfig` and fill it in. The include is optional
  (`#include?`), so builds work without the file. In CI write the file from the secret before `xcodegen`/`xcodebuild`, or
  pass `GIPHY_API_KEY=...` to `xcodebuild` as a build setting. Keep `//` out of values (xcconfig comment syntax).
- The Android and iOS changes have not been built yet.

## GitHub repository secrets

Define these in the repository settings (Settings > Secrets and variables > Actions). One value feeds every platform; the
workflows map the same secret to each platform's variable name.

| Secret               | Maps to                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `VITE_GIPHY_API_KEY` | web and desktop `VITE_GIPHY_API_KEY`; Android and iOS `GIPHY_API_KEY` |
| `VITE_KLIPY_API_KEY` | web and desktop `VITE_KLIPY_API_KEY`                                  |

Signing secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, the Android keystore) are described in
[RELEASING.md](../RELEASING.md). `PUSH_GATEWAY_URL` is not set in CI until a Mudrix push gateway exists.

Workflow `env:` for each job:

```yaml
# web build (Pages and release) and desktop build
env:
  VITE_GIPHY_API_KEY: ${{ secrets.VITE_GIPHY_API_KEY }}
  VITE_KLIPY_API_KEY: ${{ secrets.VITE_KLIPY_API_KEY }}

# Android build
env:
  GIPHY_API_KEY: ${{ secrets.VITE_GIPHY_API_KEY }}

# iOS build (and write apps/ios/Config/Secrets.xcconfig from it, or pass it to xcodebuild)
env:
  GIPHY_API_KEY: ${{ secrets.VITE_GIPHY_API_KEY }}
```

## Audit of embedded third-party credentials and account-bound identifiers

Classes: **a** secret or key, moved to build-time config; **b** bound to upstream's (WizardChat's) accounts but not secret,
so a Mudrix build should not use it; **c** harmless public constant, left alone. Searched: the whole tree except
`node_modules`, `target` and lockfiles, for API keys, client ids and secrets, DSNs, Firebase and Google config, push
gateways, OIDC client ids, analytics ids, TURN and LiveKit credentials, signing identities and provisioning. There is no
Sentry or other analytics, no TURN or LiveKit credential and no OIDC client id in the tree (OIDC clients register
dynamically with the app name and `https://github.com/kapsikkum/mudrix`).

Line numbers are those before this change.

| Class | Where                                                                                                                                                                                                                         | What                                                                                                                      | Status                                                                                                                                                                                                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a     | `apps/web/src/app/features/timeline/composer/gifProviders/giphy.ts:12`                                                                                                                                                        | upstream's GIPHY key as the fallback                                                                                      | Removed; `VITE_GIPHY_API_KEY` only                                                                                                                                                                                                                             |
| a     | `apps/android/app/src/main/kotlin/org/wizardchat/android/ui/composer/GifPicker.kt:79`                                                                                                                                         | `GIPHY_API_KEY` constant                                                                                                  | Removed; `BuildConfig.GIPHY_API_KEY`                                                                                                                                                                                                                           |
| a     | `apps/ios/WizardChat/Views/Composer/GifPicker.swift:15`                                                                                                                                                                       | `apiKey`                                                                                                                  | Removed; Info.plist `WZGiphyApiKey`                                                                                                                                                                                                                            |
| b     | `apps/android/app/src/main/kotlin/org/wizardchat/android/push/Push.kt:24`                                                                                                                                                     | push gateway `https://push.wizardchat.org/_matrix/push/v1/notify`                                                         | Now `BuildConfig.PUSH_GATEWAY_URL`, empty by default: no pusher is registered                                                                                                                                                                                  |
| b     | `apps/android/app/src/gplay/res/values/firebase.xml:3-7`                                                                                                                                                                      | upstream's Firebase project `wizardchat-66016`: app id, sender id, client API key (`AIza...`), project id, storage bucket | Not changed. Firebase client keys are not secrets, but they bind the gplay flavour to upstream's project. Push needs a Mudrix Firebase project (`google-services.json` values) and a Mudrix gateway; see the push item in [UPSTREAM_SYNC.md](UPSTREAM_SYNC.md) |
| b     | `apps/ios/Config/Signing.xcconfig:3`                                                                                                                                                                                          | `WZ_TEAM = QLN374H4MT`, upstream's Apple team id                                                                          | Not changed. Already overridable through `Config/Local.xcconfig`; a team id is not secret                                                                                                                                                                      |
| b     | `apps/web/src/app/features/calls/watchTogether/youtube.ts:35`, Android `ui/room/YouTubeCard.kt:206`, `ui/voice/WatchTogetherUi.kt:144`, iOS `Views/Messages/YouTubeCard.swift:174`, `Views/Voice/WatchTogetherViews.swift:27` | upstream-hosted `*.wizardchat.org` YouTube player page and embed origin                                                   | Not changed; needs a Mudrix-hosted player (see [CODEBASE.md](CODEBASE.md)). No credential involved                                                                                                                                                             |
| b     | `apps/android/.../ui/settings/GeneralSettings.kt:572`                                                                                                                                                                         | link to `https://wizardchat.org/privacy/`                                                                                 | Not changed; belongs to the later rename and branding pass                                                                                                                                                                                                     |
| b     | `.gitlab-ci.yml:65,70`, `packaging/aur/wizardchat-bin/PKGBUILD:8`                                                                                                                                                             | `*.wizardchat.org` deploy URLs and package metadata                                                                       | Legacy GitLab and AUR files, to be deleted or rewritten when GitHub Actions replaces them                                                                                                                                                                      |
| c     | `apps/web/src/app/features/integrations/officialKeys.ts:10`, Android `IntegrationSignature.kt:13`, iOS `IntegrationSignature.swift:17`                                                                                        | Ed25519 public key that marks the official integrations repo                                                              | Public verification key; repo URL is `kapsikkum/mudrix-integrations`                                                                                                                                                                                           |
| c     | `apps/desktop/src-tauri/tauri.conf.json:80`                                                                                                                                                                                   | minisign public key for in-app updates                                                                                    | Public verification key; the private half lives only in CI secrets                                                                                                                                                                                             |
| c     | `apps/android/app/build.gradle.kts` (`applicationId`), `apps/desktop/src-tauri/tauri.conf.json:5`, `apps/ios/Config/Signing.xcconfig:4`                                                                                       | `chat.mudrix.*` application ids and bundle prefix                                                                         | Mudrix's own identifiers                                                                                                                                                                                                                                       |
| c     | `GeneralSettings.kt:292,301`, `GeneralSettings.swift:171,176`                                                                                                                                                                 | `@merlin:wizardchat.org` sample user ids in a settings preview                                                            | Display text only                                                                                                                                                                                                                                              |
| c     | `apps/ios/WizardChatTests/Resources/integration-manifests.json`, test fixtures                                                                                                                                                | words like "secret" and "credentials" in test data                                                                        | Not credentials                                                                                                                                                                                                                                                |
