# CI

GitHub Actions workflows live in `.github/workflows/`. They check the code and build test builds. The Android
release APK and the desktop updater artifacts are signed with the old apps' keys when the signing secrets exist
(see [SIGNING.md](SIGNING.md)); everything else is unsigned and nothing is published. [TESTING.md](../TESTING.md)
says what each artifact is and how to install it. The repository is public; macOS runner minutes bill 10x; see
[Cost](#cost).

| Workflow                                                    | Runs on                                                                                                                                                 | What it does                                                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [check.yml](../.github/workflows/check.yml)                 | push to `main`, every pull request                                                                                                                      | The root `npm run check` as jobs, plus a web build (`mudrix-web-dist`) and web tests                                                                                                  |
| [android.yml](../.github/workflows/android.yml)             | push to `main` or `web-look` / PR touching `apps/android`, `crates`, `packages` (and build inputs), manual                                              | Core for Android, `fdroid` debug APK (+ `SHA256SUMS.txt`), unit tests; a release-signed `fdroid` APK when the signing secrets exist                                                   |
| [ios.yml](../.github/workflows/ios.yml)                     | push to `main` / PR touching `apps/ios`, `crates`, `packages` (and build inputs), manual                                                                | Core for iOS, `xcodegen`, unsigned Simulator build, XCTest, `.app` + screenshots + raw logs                                                                                           |
| [desktop.yml](../.github/workflows/desktop.yml)             | push to `main` or `web-look` / PR touching `apps/desktop`, `apps/web`, `crates`, `packages`, `packaging`, `flake.nix`, `nix` (and build inputs), manual | `tauri build --debug` on Windows, Linux and macOS: installers + raw binary; then Arch (`makepkg`), Fedora (`rpmbuild`) and Nix (`nix build` + module) packages from the Linux tarball |
| [branding-gate.yml](../.github/workflows/branding-gate.yml) | push to `main`, every pull request                                                                                                                      | Fails when the upstream name shows up in user-visible text                                                                                                                            |

Shared steps are local composite actions: `.github/actions/setup-rust` (toolchain from `rust-toolchain.toml`, extra
targets, `Swatinem/rust-cache`) and `.github/actions/tauri-linux-deps` (apt packages for Tauri v2 on Ubuntu). Every
workflow cancels a superseded run on the same ref (`concurrency`) and asks for `contents: read` only.

## The workflows

### check.yml

Three jobs on `ubuntu-latest`:

- **web**: `npm ci --ignore-scripts`, `npm run tokens`, `npm run i18n`, the wasm core (`npm run core:web:dev` on pull
  requests, `npm run core:web` (release, `wasm-opt -Oz`) on pushes to `main`), `npm run typecheck -w @mudrix/web`,
  `npm run lint`, `npm run format:check`, `vite build` for the web app, uploaded as `mudrix-web-dist` (a static build
  testers can serve without Rust; nothing is uploaded when an earlier step fails). wasm-pack 0.15.0 is the version
  upstream pins.
- **web-tests**: `npm test -w @mudrix/web` (Node's test runner over `apps/web/tests`). Not part of `npm run check`.
- **rust**: `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, and
  clippy for the core and wasm crates on `wasm32-unknown-unknown`. The workspace includes the Tauri crate, so the job
  installs Tauri's Linux libraries and creates an empty `apps/web/dist-desktop` (the Tauri macro fails to compile
  without its `frontendDist` directory).

Run it by hand: Actions -> Check -> Run workflow (that run uses the release wasm profile). Locally: `npm run check`.

### android.yml

`ubuntu-latest`, JDK 17 (Temurin), Android SDK platform 36, build-tools 36.0.0, NDK 28.2.13676358 (all as upstream's
`build-android` job), Gradle 8.14.3 through the wrapper.

1. `npm ci --ignore-scripts`, `npm run assets` (tokens, i18n, emoji, icons)
2. `apps/android/scripts/build-core.sh --debug --all` (arm64-v8a + x86_64, debug profile; installs `cargo-ndk` on first
   use, then generates the Kotlin bindings)
3. `./gradlew --no-daemon :app:assembleFdroidDebug`
4. `./gradlew --no-daemon :app:testFdroidDebugUnitTest`
5. When the signing secrets exist (never on pull requests): `node tools/ci/sign-android.mjs prepare`,
   `:app:assembleFdroidRelease`, `sign-android.mjs verify` with `apksigner`, then the APK is renamed
   `Mudrix-<version>-release.apk` and uploaded as `mudrix-android-fdroid-release`
6. uploads `apps/android/app/build/outputs/apk/fdroid/debug/*.apk` together with a `SHA256SUMS.txt` of it as
   `mudrix-android-fdroid-debug` (14 days); the test reports are uploaded when a step fails

Only the `fdroid` flavour is built: `gplay` needs `apps/android/app/src/gplay/res/values/firebase.xml` from a Firebase
project. The debug build type installs as `chat.mudrix.mobile.test`.

Run by hand: Actions -> Android -> Run workflow.

### ios.yml

`macos-26` (Apple silicon), Xcode 26 by default (an input lets a manual run pick another version; it must ship the iOS
18 SDK).

1. `npm ci --ignore-scripts`, `npm run assets`
2. `apps/ios/scripts/build-core.sh --debug` (XCFramework for device + Simulator, Swift bindings)
3. `xcodegen generate` in `apps/ios`
4. resolves the project and scheme names from what `xcodegen` generated (or from the `IOS_XCODEPROJ` / `IOS_SCHEME`
   repository variables), so a rename of `name:` in `apps/ios/project.yml` does not break the job
5. picks the newest iPhone Simulator with an iOS 18+ runtime
6. `xcodebuild build -project <project> -scheme <scheme> -configuration Debug -destination "platform=iOS Simulator,id=<udid>" -derivedDataPath build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= ARCHS=arm64 ONLY_ACTIVE_ARCH=YES`
7. the same with `test` (the scheme includes the tests target; the manual-run input `run-tests` turns it off)
8. zips the built `.app` from `apps/ios/build/Build/Products/Debug-iphonesimulator` as `ios-simulator-app` (with its
   `bundle-id.txt`), boots the simulator, installs the app and uploads a light and a dark screenshot as `ios-screenshots`

`xcbeautify` prints readable output, but the **raw logs are always kept**: the `ios-xcodebuild-logs` artifact (even
when a step fails) holds `xcodebuild-build.log`, `xcodebuild-test.log`, `build-core.log`, `xcodegen.log`, the
`.xcresult` bundles and `versions.log`. The run summary lists every distinct `error:` line. The `.app` and screenshot
artifacts are best-effort: they are skipped when the build produced no app.

Run by hand: Actions -> iOS -> Run workflow.

### desktop.yml

Matrix `windows-latest`, `ubuntu-latest`, `macos-latest` (`fail-fast: false`). Each: `npm ci --ignore-scripts`,
`npm run tokens`, then `npm run tauri -w @mudrix/desktop -- build --debug --bundles <list>` (Tauri's
`beforeBuildCommand` runs `tsc` and `vite build --mode desktop`). The bundle list is per runner, because Tauri rejects a
target it cannot build there: `nsis,msi` on Windows, `appimage,deb` on Linux, `app,dmg` on macOS. A release run
(`--ref v<version> -f profile=release`) builds the optimised profile, runs `release-config.mjs` to require that tag, and
passes `--config src-tauri/tauri.release.conf.json`, which makes Tauri write the minisign-signed updater bundles
(`.sig` files) into the bundle directory; the signing key is only exposed on that tag-and-release path. Debug builds,
branch pushes and pull requests stay unsigned. The updater bundles are uploaded as `mudrix-desktop-updater-<OS>`. Two
artifacts per leg:
`mudrix-desktop-<OS>-unsigned` (the installers plus a `SHA256SUMS.txt`; the macOS `.app` is zipped with `ditto`, because
`upload-artifact` loses a bundle's symlinks and file modes) and `mudrix-desktop-debug-<OS>` (the raw
`target/debug/mudrix-desktop[.exe]`, plus `.pdb` on Windows). The installers themselves are not code-signed, so
SmartScreen and Gatekeeper complain.
Ubuntu installs `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev
librsvg2-dev libx11-dev libxi-dev libxtst-dev libxdo-dev libssl-dev patchelf`.

Run by hand: Actions -> Desktop -> Run workflow. A release must be dispatched on the version tag (`--ref v<version>`) with
`profile=release`; `platforms` takes a JSON array, for example `["ubuntu-latest"]` to skip the expensive runners, and
`bundles` set to `"false"` compiles without building installers.

### branding-gate.yml

`node tools/ci/branding-gate.mjs` (Node, no dependencies). Looks for `wizardchat` in any case, only in user-visible
places: translation **values** in `packages/i18n/locales/*.json`, `README*.md`, `docs/*.md` (except `BRANDING`, `PORT`,
`MISSING`, `PARITY_PLAN`, `UPSTREAM_SYNC` and `CONTRIBUTING`), `apps/web/index.html` and web manifests, Tauri
`productName` / `title` / description / publisher, Android manifest labels and `strings*.xml`, iOS `Info.plist` display
names and usage descriptions (also when `project.yml` generates them) and `*.xcstrings` values.

- Allowed exceptions live in `tools/ci/branding-allow.txt`: `<path glob> [:: <line regex>]`, each with a reason.
- `--strict` scans every tracked text file (except `LICENSE`, the upstream-discussing docs, `tools/ci/branding-*`,
  GitLab files). **It is not enabled in the workflow**; switch the command once the internal rename is done.
- Locally: `node tools/ci/branding-gate.mjs` (add `--strict` to preview). Manual run: Actions -> Branding gate.
- It will be red until the hits it reports are fixed or allow-listed with a reason.

## Signing secrets

The signing secrets are configured on the repository (Settings -> Secrets and variables -> Actions); values never go
into the repository. The Android and desktop builds read them; iOS needs the Apple secrets below only if device builds
are ever signed. See [SIGNING.md](SIGNING.md).

| Name                                                                                                                            | Used for                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`                                                               | Signs desktop updater artifacts (minisign). The public key is already in `tauri.conf.json`; losing the private key strands installed apps ([RELEASING.md](../RELEASING.md))                                                                     |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`                             | Release signing of the Android APK/AAB (same names as the old mobile workflow). The workflow writes `apps/android/keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) and the `.jks`; Gradle already reads that file |
| `ANDROID_GOOGLE_SERVICES_JSON_BASE64`                                                                                           | `gplay` flavour only: Firebase config for `app/src/gplay/res/values/firebase.xml`                                                                                                                                                               |
| `PLAY_SERVICE_ACCOUNT_JSON`                                                                                                     | Only if uploading to Google Play (the `apps/android/fastlane` lanes)                                                                                                                                                                            |
| `APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD`                                                                    | iOS distribution certificate (an own Apple Developer account; the team id in `Signing.xcconfig` is upstream's)                                                                                                                                  |
| `APPLE_PROVISIONING_PROFILE_APP_BASE64`, `APPLE_PROVISIONING_PROFILE_WIDGETS_BASE64`, `APPLE_PROVISIONING_PROFILE_SHARE_BASE64` | One profile each for the app, the Live Activity widget and the share extension (shared app group)                                                                                                                                               |
| `APPLE_TEAM_ID` (variable is enough)                                                                                            | Team id passed as `WZ_TEAM`                                                                                                                                                                                                                     |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_API_KEY_P8_BASE64`                                                                          | App Store Connect API key, for TestFlight upload (`apps/ios/fastlane`)                                                                                                                                                                          |
| `APPLE_DEVELOPER_ID_CERT_BASE64`, `APPLE_DEVELOPER_ID_CERT_PASSWORD`, `APPLE_ID`, `APPLE_APP_PASSWORD`                          | Only if the macOS desktop app gets signed and notarized (none today; Tauri reads them as `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`)                                                      |
| `VITE_GIPHY_API_KEY`, `VITE_KLIPY_API_KEY`                                                                                      | Optional GIF picker keys baked into the web bundle (the old web check workflow passed them)                                                                                                                                                     |

Also needed, but public (a repository variable, not a secret): `TAURI_UPDATER_PUBKEY`, because
`apps/desktop/scripts/release-config.mjs` insists on it. Publishing a GitHub release, GHCR images or GitHub Pages only
needs the built-in `GITHUB_TOKEN` with `contents: write` / `packages: write` / `pages: write` on that job.

## Upstream GitLab jobs

| `.gitlab-ci.yml` job                                                    | Status        | Why                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint` (`npm run lint`, `format:check`, `i18n`)                         | ported        | `check.yml` web job                                                                                                                                                 |
| `build-web` (`npm run build`)                                           | ported        | `check.yml` web job (tokens, wasm core, type check, vite build; pull requests use the dev wasm profile to save time)                                                |
| rustfmt and clippy                                                      | added         | Upstream only had them in the local `npm run check`                                                                                                                 |
| `build-android` (signed `assembleGplayRelease`)                         | partly ported | `android.yml` builds `fdroid` debug and runs unit tests with the same SDK/NDK versions; the signed gplay release needs secrets and Firebase config                  |
| iOS                                                                     | added         | Upstream has no iOS job                                                                                                                                             |
| `build-desktop-mac` / `-linux` / `-win`                                 | not ported    | Release bundling and signing. `desktop.yml` only proves the app compiles (`--debug --no-bundle`) on native runners; no `cargo-xwin` cross build is needed on GitHub |
| `build-desktop-arch`                                                    | not ported    | Release packaging (Arch package from the Linux tarball)                                                                                                             |
| `prepare-release`, `release-notes`, `create-release`, `publish-desktop` | not ported    | Use GitLab's MR/tag API, `release-cli` and the GitLab package registry; replaced by a GitHub release workflow later (`RELEASING.md`)                                |
| `build-web-release`, `deploy`                                           | not ported    | Cloudflare Pages deployment of upstream's domains. A GitHub Pages workflow is a future item                                                                         |
| `build-docker`                                                          | not ported    | GitLab registry; a GHCR publish is future work (`Dockerfile` exists)                                                                                                |

## Cost

GitHub bills private-repository minutes with multipliers: Linux 1x, Windows 2x, macOS 10x (the free plan includes 2,000
Linux-equivalent minutes a month; check the current numbers on your plan). The estimates below are guesses from the
size of the dependency tree (matrix-sdk, aws-lc, Tauri) and **have not been measured**; the first cold run is the
slowest, later runs use the cargo/npm/Gradle caches.

| Workflow                           | Runner                              | Wall time (warm cache / cold) | Billed minutes per run     |
| ---------------------------------- | ----------------------------------- | ----------------------------- | -------------------------- |
| check.yml (web + web-tests + rust) | ubuntu                              | 8-15 / 25-40 per job          | ~15-80                     |
| android.yml                        | ubuntu                              | 15-25 / 40-60                 | ~15-60                     |
| ios.yml                            | macOS (10x)                         | 20-30 / 40-60                 | ~200-600                   |
| desktop.yml, per leg               | ubuntu / Windows (2x) / macOS (10x) | 15-25 / 30-45                 | ~15-45 / ~30-90 / ~150-450 |
| branding-gate.yml                  | ubuntu                              | <1                            | 1                          |

Because the macOS legs dominate the bill, `ios.yml` and the macOS leg of `desktop.yml` are path-scoped (they do not run
for docs-only changes), bundling adds a few minutes per desktop leg, and all of them can be started by hand for one
platform at a time. Superseded runs are cancelled. If it is still too much: drop `pull_request` from `ios.yml`
and keep `workflow_dispatch` only, or pass `["ubuntu-latest","windows-latest"]` as the `platforms` default.

## Assumptions worth re-checking

The workflows were written from reading the repository and upstream's pipeline. These are the assumptions most likely to
break on a change:

- `rustup toolchain install` without arguments (setup-rust) needs rustup 1.28+ on the runner image.
- wasm-pack 0.15.0 is downloaded from the GitHub release URL upstream's pipeline uses; `wasm-opt` is fetched by wasm-pack.
- clippy of the Tauri crate on Ubuntu may need more system libraries than listed (the build script's `pkg-config` error
  names the missing one), and `tauri::generate_context!` is assumed to accept an empty `frontendDist` directory.
- `cargo-ndk` is installed by `build-core.sh` with `cargo install --locked`; the cargo-bin cache of `rust-cache`
  should keep it between runs.
- `:app:testFdroidDebugUnitTest` assumes the unit tests under `apps/android/app/src/test` run on the JVM alone.
- `maxim-lobanov/setup-xcode` finds Xcode 26 on `macos-26`; if the image changes, pass another `xcode-version`.
- `xcodebuild` with `CODE_SIGNING_ALLOWED=NO` while `project.yml` sets `DEVELOPMENT_TEAM` and entitlements (app group)
  is expected to build for the Simulator; the LiveKit Swift package is resolved from GitHub on the first run.
- the `desktop.yml` binary name `mudrix-desktop` comes from the Cargo package name (`apps/desktop/src-tauri`), and the
  installers land under `target/debug/bundle/<format>` in the workspace's target directory.
