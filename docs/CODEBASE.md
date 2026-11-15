# Working on the codebase

Mudrix is a fork of WizardChat's Rust-core rewrite (see the README). User-visible text, ids, packages, crates and docs
say Mudrix; a short list of wire and compatibility names still says WizardChat, see
[Internal names left as-is](#internal-names-left-as-is).

## Where code goes

**Features live in the Rust core. Apps only render state and call the core.**

- Anything that talks to Matrix, stores data, encrypts, syncs, decides what a room list or timeline contains, or would
  be the same on every platform goes in `crates/core`.
- An app (`apps/web`, `apps/desktop`, `apps/ios`, `apps/android`) contains only what is platform-specific: UI,
  navigation, OS integration (notifications, keychain, share sheets, CallKit, push) and media capture and playback.
- If an app needs data or an action the core doesn't offer, add it to the core. Never re-implement Matrix logic in an
  app or call a homeserver from app code.

The same goes for everything else that is shared:

| Need                                                  | Use                                                                           | Never                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| Matrix data or actions                                | the core's API (generated bindings)                                           | an SDK in the app, raw HTTP to the homeserver |
| Colours, spacing, radii, sizes, type, motion, shadows | `packages/design-tokens`                                                      | hard-coded values                             |
| User-facing text                                      | `packages/i18n`                                                               | string literals in UI code                    |
| Emoji data                                            | `emojibase-data` on the web, `packages/emoji` on iOS and Android              | a second emoji list                           |
| Icons                                                 | Phosphor: `@phosphor-icons/react` on the web, `packages/icons` on iOS/Android | other icon sets, copied SVGs                  |
| Sounds                                                | `packages/sounds`                                                             | sound files inside an app                     |
| The app version                                       | the root `package.json`                                                       | a version number anywhere else                |

`apps/web` is the reference for which features exist and how they behave. `apps/ios` and `apps/android` are the same
app twice, each with its platform's controls: when you change a screen in one, make the same change in the other.

## Layout

```
crates/
|- core/        matrix-rust-sdk + every feature, no UI
|  |- src/rpc/  the app-facing API, one declaration per method
|  `- examples/ end-to-end runs against a homeserver
|- wasm/        transport: core <-> web app
`- ffi/         transport: core <-> iOS and Android (UniFFI)
packages/       design-tokens, i18n, emoji, icons, sounds
whatsnew/       release notes per version
apps/
|- web/         React web app
|- desktop/     Tauri: the web UI with the core running natively
|- ios/         SwiftUI app
`- android/     Jetpack Compose app
```

## Adding to the core

Apps talk to the core through one entry point, `Rpc::call("Class.method", handle, args, blobs)`, and get pushed state
through `watch...` methods as diffs. Objects (clients, timelines, calls) live in the core and apps hold handles. Errors
carry a stable `code` so the UI can show translated messages.

1. Implement the feature in `crates/core/src/<area>.rs` and return plain serialisable view models, never SDK types.
2. Declare the method in the matching `crates/core/src/rpc/*.rs` file:
   ```rust
   rpc_methods! {
       WizardClient(this: WizardClient) {
           /// Docs end up in every generated API
           call fn sendMessage(room_id: String, body: String) -> () { this.send_message(&room_id, &body).await }
       }
   }
   ```
3. Run `npm run core:types`. It generates the TypeScript, Swift and Kotlin APIs.
4. Use it from the apps. If you change an existing signature, update every app that calls it.

The core has to compile for native targets and for `wasm32-unknown-unknown`; `npm run check` builds both.

## Shared packages

- **Design tokens** (`packages/design-tokens/src`): `base.json` for everything theme-independent, `themes/*.json` for
  each theme's colours. A new colour must go into every theme.
- **Translations** (`packages/i18n/locales/<lang>.json`, i18next format, English is the source): every language has
  the same keys and placeholders. Write a real translation for each language, and reuse existing keys where you can.
- **Icons** (`packages/icons/src/icons.json`): the Phosphor icons and weights the native apps use. Add the one a screen
  needs, with the same icon and weight as the web.
- **Sounds** (`packages/sounds/raw`): lowercase names with digits and underscores only, so Android can use them as
  resources.

## Checking a change

There are no test suites. Build, run `npm run check`, and use the app: the web app in a browser, `npm run desktop`,
`npm run android` on an emulator (it reaches a server on your machine at `http://10.0.2.2:8008`), `npm run ios` in the
simulator. For core changes, also run the example for the area you changed (see [DEVELOPMENT.md](DEVELOPMENT.md)).

## Conventions

- Commit messages follow Conventional Commits, with a scope when the change belongs to one part of the repo:
  `feat(ios):`, `fix(core):`, `chore(ci):`. The release notes are built from them. No AI attribution in commits.
- Comment only where the code can't speak for itself: a non-obvious decision, a constraint, a workaround for an SDK or
  platform quirk. Say why, not what. No commented-out code or leftover TODOs.
- Don't edit generated files (`api.gen.ts`, `Api.gen.swift`, `Api.gen.kt`, `dist/`, `crates/wasm/pkg`); change the
  source and regenerate.
- Never hard-code the iOS team, bundle IDs or app group; they come from `apps/ios/Config/Signing.xcconfig`.

## Internal names left as-is

The rename is done (commits `95014bc9`, `03409f72`, `24bd38f0`): packages, crates, Kotlin packages, iOS targets and
folders, npm workspaces and the native library all say Mudrix. What still says WizardChat or Wizard is listed below.
These are wire formats, stored data, upstream-owned code or generated names; renaming one would either break other
clients or stored accounts, or make merges from the upstream base much harder. Do not rename them without a
compatibility decision.

- **Rust and the generated API:** the `WizardClient` type in the core (`crates/core/src/client.rs`) and in every
  generated binding, because it is the one type all four apps hold; the wasm package `mudrix-core-wasm` and its output
  `mudrix_core`, imported on the web as `@mudrix/core-wasm` through the `@mudrix/core` alias. The JNI class is now
  `chat.mudrix.core.CoreInit`.
- **Android:** the Kotlin packages and `namespace` are `chat.mudrix.android`; the `applicationId` is
  `chat.mudrix.mobile` and the Gradle project is `Mudrix`. Still Wizard-named, because they are the app's own symbols:
  `WizardLogo`, `WizardThemeRoot`, `wizardFont` and the `WZ` size/radius/colour tokens used by every screen.
- **iOS:** the Xcode project is `Mudrix.xcodeproj` and the targets and folders are `Mudrix`, `MudrixCore`,
  `MudrixShare`, `MudrixWidgets` and `MudrixTests`; the product is `Mudrix.app`, and `NotificationService` keeps its
  descriptive name. The Swift types `WizardLogo`, `WizardMark` and the `WZ_*` build settings (`WZ_TEAM`,
  `WZ_BUNDLE_PREFIX`, `WZ_APP_GROUP`, `WZ_PUSH_MODE`, ...) keep their names; their values are Mudrix's, except
  `WZ_TEAM`, which is still upstream's Apple team id and has to be set to your own.
- **Web:** the `WizardMark` component (it draws the Mudrix logo), the `wz_*` localStorage and sessionStorage keys
  (renaming them would sign people out and lose their layout), the `WizardChat` credit line in About and the
  `wizardchat-youtube` iframe source. `@mudrix/core` is the wasm package alias.
- **Protocol and compatibility, on purpose:** the `org.wizardchat.*` account-data and profile-field names (read, and
  written only where `util/namespace.ts` says another device may still need one), the `org.wizardchat` OAuth/SSO
  callback scheme (registered next to `chat.mudrix` in `apps/android/app/src/main/AndroidManifest.xml` and
  `apps/ios/Mudrix/Info.plist`), the older `chat.mudrix.*` event and state names, `io.gitlab.wizardchat.settings`, the
  `wizardchat` sound pack id (the base's own alert sound) and the YouTube player host
  `*.wizardchat.org/youtube-player.html`, which is still upstream's. The `chat.mudrix.theme` extension key in
  `packages/design-tokens/src/themes/*.json` is an older Mudrix name and stays for existing theme files.
- **Packaging and CI:** `packaging/aur/mudrix-bin` is renamed; `apps/desktop/scripts/package-linux.mjs` and
  `publish-update.mjs` keep their generic names, and `.gitlab-ci.yml` / `.gitlab/` are upstream's GitLab-era release
  tooling, unused here (see [RELEASING.md](../RELEASING.md)); the live workflows are in `.github/workflows/`.
- **Research docs:** [PORT.md](PORT.md) and [MISSING.md](MISSING.md) name WizardChat as the upstream the port starts
  from.
