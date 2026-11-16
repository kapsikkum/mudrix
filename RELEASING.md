# Releasing Mudrix

Adapted from the release notes of the old `mudrix-web`, `mudrix-desktop` and `mudrix-mobile` repositories. This
repository is a single repo for all apps, but **only the web channel is automated** (GitHub Pages, below); desktop, Android and iOS releases are still made by hand. This file says what is the
plan, what already works and what does not, so nothing here should be read as "CI does this" unless it says so.

## State of CI

- GitHub Actions workflows live in `.github/workflows/` (`check.yml`, `android.yml`, `ios.yml`, `desktop.yml`,
  `branding-gate.yml`, `pages.yml`). All but `pages.yml` check the code and build test builds. The Android release APK
  and the desktop updater artifacts are signed with the old apps' keys when the signing secrets exist; the desktop
  installers themselves remain unsigned, and nothing is published automatically. `pages.yml` only publishes the web
  client. `desktop.yml` also builds Arch, Fedora and Nix packages (from the Linux tarball, unsigned, nothing published;
  see [docs/BUILDING.md](docs/BUILDING.md#distribution-packages)). [docs/CI.md](docs/CI.md) describes every workflow,
  [TESTING.md](TESTING.md) what to do with the builds. Signing is in [docs/SIGNING.md](docs/SIGNING.md).
- `.gitlab-ci.yml` (and `.gitlab/issue_templates/`) are the upstream project's GitLab pipeline. They are kept for
  reference only, they are not used here, and they still point at the GitLab package registry, Cloudflare Pages and
  `wizardchat.org`. The GitHub Actions workflows replace them; delete the GitLab files when nothing needs the reference.
- A release is still built and published by hand (see [docs/BUILDING.md](docs/BUILDING.md)) and attached to a GitHub
  release of `kapsikkum/mudrix`: the CI builds are debug-profile, expire after 14 days, and only the Android release APK
  and the desktop updater signatures are signed.
- The old repositories had `check.yml`, `release.yml`, `pages.yml` (web), `release.yml` (desktop) and `android.yml` /
  `ios.yml` (mobile). They are the model for the release workflow that is still to be written.

## Versions

`YEAR.MONTH.N`, with the root `package.json` as the source of truth. A stable release is `26.12.0`; a pre-release adds a
suffix and sorts below the stable version it leads up to:

```
26.12.0-next.1  <  26.12.0-next.2  <  26.12.0-rc.1  <  26.12.0
```

Use `-next.N` for test builds cut from the `next` branch; `-rc.N` and `-beta.N` work the same way. A tag with a `-` in it
is a pre-release: it must be marked as one on GitHub (not "latest"), and it is never offered by the desktop updater,
because the updater reads `releases/latest/download/latest.json` and GitHub's "latest" ignores pre-releases.

Releases are `v*` tags, for example `v26.12.0-next.1`. The tag and `package.json` have to agree.

Where the version lives today:

| Place                                                                                     | How it follows `package.json`                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| root `package.json` (and `package-lock.json`)                                             | the source: `npm version <v> --no-git-tag-version`                                                                                                                                                                                                          |
| desktop (`tauri.conf.json`)                                                               | reads `../../../package.json`                                                                                                                                                                                                                               |
| iOS                                                                                       | `apps/ios/scripts/set-version.sh` copies it into `CFBundleShortVersionString` at build time, minus the pre-release suffix                                                                                                                                   |
| Cargo workspace (`Cargo.toml`, `version = "0.1.0"`)                                       | **not** in step: set by hand if you want crate versions to match                                                                                                                                                                                            |
| Android (`apps/android/app/build.gradle.kts`: `versionName = "0.1.0"`, `versionCode = 1`) | **not** in step: set both by hand. `versionCode` must increase with every release; the old mobile app derived it as `major * 1000000 + minor * 1000 + patch` (26.10.19 is 26010019) and ignored the suffix, so every `-next.N` of a version shares one code |

A script that sets all of these from one version (the old repos had `set-version.mjs` and `check-version.mjs`) is
still to be written.

## What a release should contain

| file                                                          | what                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Mudrix-<v>-windows-x64-setup.exe`                            | NSIS installer, per user                                                             |
| `Mudrix-<v>-windows-x64.msi`                                  | MSI, stable releases only (WiX only takes numeric versions)                          |
| `Mudrix-<v>-macos-universal.dmg` and `.app.tar.gz` (+ `.sig`) | macOS, Apple silicon and Intel                                                       |
| `Mudrix-<v>-linux-x64.AppImage` / `.deb` / `.rpm`             | Linux; pre-releases ship the AppImage only (deb and rpm reject a `-` in the version) |
| `Mudrix-<version>-release.apk`                                | Android, release-signed (the Android workflow's `mudrix-android-fdroid-release`)     |
| `Mudrix-simulator-<sha>.zip`                                  | iOS Simulator build only; there is no device-signed IPA                              |
| `latest.json`                                                 | update manifest read by the desktop updater                                          |
| `SHA256SUMS.txt`                                              | checksums of everything above                                                        |

These names are the old Mudrix convention and are kept so that installs of the old apps can find their update; no
release workflow creates them yet. The CI builds described in [TESTING.md](TESTING.md) are test builds; the Android
release APK and updater signatures are signed, the rest is not.

## Cutting a release (manual, until workflows exist)

1. Merge what you want to ship (`next` for a pre-release, `main` for a stable release) and run `npm run check`.
2. Set the version: `npm version 26.12.0 --no-git-tag-version`, plus the Android `versionName` / `versionCode` and,
   if wanted, the Cargo workspace version. Add `whatsnew/<version>.md` (and `.de.md`) for the in-app "What's new".
3. Commit, tag and push the tag only when the user wants it released:
   ```sh
   git commit -am "chore(release): prepare v26.12.0"
   git tag v26.12.0
   git push origin main v26.12.0
   ```
4. Build the apps on their platforms (`npm run build`, `npm run desktop:release`, `npm run android:build`,
   `npm run ios:build`), then create the GitHub release (a pre-release for any `-` tag) and attach the files, including a
   `latest.json` written from the `.sig` files of the desktop build.
5. Smoke test on a clean profile: install, sign in, receive a notification with the window closed (tray), check the
   unread badge, open a `matrix:` link, quit from the tray, and update from an older build.

To go from the last pre-release to the stable release, merge `next` into `main`, set the plain version and repeat.
Rollback: delete the GitHub release and its tag (`git push origin :refs/tags/v26.12.0-next.1`); settings and the web
profile live outside the app, so a downgrade keeps the user's data.

## Signing

No secret values belong in this repository or in this file.

- **Desktop installers are not code-signed** (no Windows certificate, no Apple notarization). The release notes say so.
- **In-app update artifacts are signed with the old mudrix-desktop minisign key.** The public key is committed as
  `plugins.updater.pubkey` in `apps/desktop/src-tauri/tauri.conf.json`. The private key and its password live only in the
  CI secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (and in a backup you keep). Installs
  only accept updates signed by that key; if it is lost or replaced, installed apps cannot update in place and users must
  reinstall. `desktop.yml` adds `src-tauri/tauri.updater.conf.json` when the key exists; a local
  `npm run desktop:release` also needs those two variables. The key is at `~/.tauri/mudrix-updater.key`; a replacement
  pair comes from `npx -w @mudrix/desktop tauri signer generate -w ~/.tauri/mudrix-updater.key`.
- **Android** is signed with the old `mudrix-release.keystore` (alias `mudrix`), so existing installs update in place.
  Losing it means installed apps cannot be updated in place. The Android workflow reads the repository secrets
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`, builds
  `assembleFdroidRelease`, verifies the signature and uploads `mudrix-android-fdroid-release`; without them it falls back
  to the debug-signed APK. Locally, `tools/ci/sign-android.mjs prepare` writes the git-ignored `keystore.properties`.
  Never commit a keystore.
- **iOS** has no signing: there is no Apple Developer account, so only the Simulator build exists (no device install,
  TestFlight, App Store or APNs push). The team and bundle prefix in `apps/ios/Config/Signing.xcconfig` are upstream's;
  `Local.xcconfig` remains for anyone who later signs their own build.
- Optional build-time keys for the GIF pickers (`VITE_GIPHY_API_KEY`, `VITE_KLIPY_API_KEY`) end up in the web bundle,
  so they are visible to anyone who loads the app. The names every platform uses, and the repository secrets CI maps to
  them, are in [docs/SECRETS.md](docs/SECRETS.md).

## Hosted web client (GitHub Pages)

`.github/workflows/pages.yml` publishes one Pages site with two builds of the web app:

| URL                                      | What                                                                                     | Built when                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------ |
| `https://<owner>.github.io/<repo>/`      | the **stable** channel: the newest `v*` tag without a `-` (the tag itself on a tag push) | a stable tag is pushed         |
| `https://<owner>.github.io/<repo>/next/` | the **next** channel: the head of `web-look` or `main`, whichever was pushed             | a push to `web-look` or `main` |

- Pages replaces the whole site on each deploy, so every run builds both: a branch push rebuilds `/next/` and keeps the
  stable build of the newest stable tag, a tag push rebuilds stable and `/next/` from the branch heads. Only tags and
  branches that contain `apps/web` count (the old upstream tags `v26.9.x` do not), and with no stable tag yet `/`
  just forwards to `/next/`.
- A pre-release tag (`v26.12.0-next.1`, `-rc.1`, `-beta.1`) does **not** deploy: a test build never replaces stable.
  Cut those from a branch push instead.
- It never runs for pull requests (no `pull_request` trigger and a guard in the job), so a fork cannot deploy or reach
  the Pages environment. It uses nothing but `GITHUB_TOKEN` (`contents: read`; `pages: write` and `id-token: write`
  only in the deploy job). The optional `VITE_GIPHY_API_KEY` / `VITE_KLIPY_API_KEY` secrets switch the GIF tabs on, see
  [docs/SECRETS.md](docs/SECRETS.md).
- The app is built for the subpath with `BASE_PATH` (read by `apps/web/vite.config.ts`; `/<repo>/` and
  `/<repo>/next/`). Every public asset, the service worker, the router basename and the sign-in callback follow it
  through `apps/web/src/util/publicUrl.ts`. A repository variable `PAGES_BASE_PATH` (ending in `/`, for example `/`)
  replaces the default `/<repo>/` when the site is served from a custom domain. The desktop build ignores it.
- Deep links such as `/<repo>/r/!room:server` have no file on Pages: `404.html` loads the `index.html` of the app the
  path belongs to and lets its router take over (`.github/workflows/pages/`).
- The two builds share one browser origin, which also shares storage, so a risky `next` change can break the stable
  site's session until site data is cleared.

One-time setup: **Settings -> Pages -> Source = "GitHub Actions"**, and let the `github-pages` environment deploy from
`web-look`, `main` and `v*` tags (Settings -> Environments -> github-pages -> deployment branches and tags). A private
repository needs a plan that has Pages for private repositories. Run it by hand from Actions -> Pages -> Run workflow;
a manual run builds both channels from the newest stable tag and `web-look`.

The `Dockerfile` builds the web app served by nginx; publishing an image (for example to GHCR) is future work.

## Application ids

Installs upgrade in place only if the ids match what the old Mudrix apps used:

| App                                                                                                                                     | Id                    |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Desktop (Tauri `identifier`, deep-link scheme)                                                                                          | `chat.mudrix.desktop` |
| Android `applicationId` (the Kotlin `namespace` is still `chat.mudrix.android`)                                                         | `chat.mudrix.mobile`  |
| iOS bundle id (`WZ_BUNDLE_PREFIX` `chat.mudrix` + `.mobile`, extensions `.mobile.widgets`, `.mobile.share` and `.mobile.notifications`) | `chat.mudrix.mobile`  |
