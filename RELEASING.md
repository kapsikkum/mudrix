# Releasing Mudrix

Adapted from the release notes of the old `mudrix-web`, `mudrix-desktop` and `mudrix-mobile` repositories. This
repository is a single repo for all apps, but **its release automation does not exist yet**. This file says what is the
plan, what already works and what does not, so nothing here should be read as "CI does this" unless it says so.

## State of CI

- There is no `.github/` directory and no GitHub Actions workflow in this repository.
- `.gitlab-ci.yml` (and `.gitlab/issue_templates/`) are upstream WizardChat's GitLab pipeline. They are kept for
  reference only, they are not used here, and they still point at the GitLab package registry, Cloudflare Pages and
  `wizardchat.org`. GitHub Actions workflows will replace them later; delete the GitLab files then.
- Nothing builds, signs or publishes a release automatically. Until the workflows exist, a release is built by hand
  (see [docs/BUILDING.md](docs/BUILDING.md)) and attached to a GitHub release of `kapsikkum/mudrix`.
- The old repositories had `check.yml`, `release.yml`, `pages.yml` (web), `release.yml` (desktop) and `android.yml` /
  `ios.yml` (mobile). They are the model for the new workflows below.

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

| Place | How it follows `package.json` |
| --- | --- |
| root `package.json` (and `package-lock.json`) | the source: `npm version <v> --no-git-tag-version` |
| desktop (`tauri.conf.json`) | reads `../../../package.json` |
| iOS | `apps/ios/scripts/set-version.sh` copies it into `CFBundleShortVersionString` at build time, minus the pre-release suffix |
| Cargo workspace (`Cargo.toml`, `version = "0.1.0"`) | **not** in step: set by hand if you want crate versions to match |
| Android (`apps/android/app/build.gradle.kts`: `versionName = "0.1.0"`, `versionCode = 1`) | **not** in step: set both by hand. `versionCode` must increase with every release; the old mobile app derived it as `major * 1000000 + minor * 1000 + patch` (26.10.19 is 26010019) and ignored the suffix, so every `-next.N` of a version shares one code |

A script that sets all of these from one version (the old repos had `set-version.mjs` and `check-version.mjs`) is
still to be written.

## What a release should contain

| file | what |
| --- | --- |
| `Mudrix-<v>-windows-x64-setup.exe` | NSIS installer, per user |
| `Mudrix-<v>-windows-x64.msi` | MSI, stable releases only (WiX only takes numeric versions) |
| `Mudrix-<v>-macos-universal.dmg` and `.app.tar.gz` (+ `.sig`) | macOS, Apple silicon and Intel |
| `Mudrix-<v>-linux-x64.AppImage` / `.deb` / `.rpm` | Linux; pre-releases ship the AppImage only (deb and rpm reject a `-` in the version) |
| `Mudrix-<v>.apk` (name not fixed yet) | Android, release-signed |
| `Mudrix-unsigned.ipa` | iOS, unsigned, to be sideloaded |
| `latest.json` | update manifest read by the desktop updater |
| `SHA256SUMS.txt` | checksums of everything above |

These names are the old Mudrix convention and are kept so that installs of the old apps can find their update; the
workflows that create them do not exist yet.

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
- **In-app update artifacts are signed with a minisign key.** The public key is committed as `plugins.updater.pubkey` in
  `apps/desktop/src-tauri/tauri.conf.json`. The private key and its password must live only in the CI secrets
  `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (and in a backup you keep). Installs only accept
  updates signed by that key; if it is lost or replaced, installed apps cannot update in place and users must reinstall.
  A local `npm run desktop:release` also needs those two variables in the environment, because
  `tauri.release.conf.json` turns on `createUpdaterArtifacts`. A fresh key pair comes from
  `npx -w @wizardchat/desktop tauri signer generate -w ~/.tauri/mudrix-updater.key`; put the public half into the
  config and the private half into the secrets.
- **Android** is signed with a keystore you create once and must keep safe: losing it means installed apps cannot be
  updated in place. Create it with `keytool -genkeypair -v -keystore mudrix-release.keystore -alias mudrix -keyalg RSA
  -keysize 4096 -validity 10000`. The old mobile workflow read four repository secrets: `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`, and fell back to a debug-signed APK when
  they were missing. `apps/android` here does not read them yet; wire up the signing config before the first release.
  Never commit a keystore.
- **iOS** builds are unsigned and sideloaded with a tool that signs them for the user's own device. The team and bundle
  prefix come from `apps/ios/Config/Signing.xcconfig` (still the upstream team id, see
  [docs/BRANDING.md](docs/BRANDING.md)); use `Local.xcconfig` for your own Apple account.
- Optional build-time keys for the GIF pickers (`VITE_GIPHY_API_KEY`, `VITE_KLIPY_API_KEY`) end up in the web bundle,
  so they are visible to anyone who loads the app.

## Hosted web client (not set up)

The old web client was deployed to GitHub Pages under `/mudrix-web/` (stable) and `/mudrix-web/next/` (the `next`
branch), with a `404.html` router for deep links. Both builds share one browser origin, which also shares storage, so a
risky `next` change can break the stable site's session until site data is cleared. None of that exists for this
repository yet. The `Dockerfile` builds the web app served by nginx; publishing an image (for example to GHCR) is also
future workflow work.

## Application ids

Installs upgrade in place only if the ids match what the old Mudrix apps used:

| App | Id |
| --- | --- |
| Desktop (Tauri `identifier`, deep-link scheme) | `chat.mudrix.desktop` |
| Android `applicationId` (the Kotlin `namespace` is still `org.wizardchat.android`) | `chat.mudrix.mobile` |
| iOS bundle id (`WZ_BUNDLE_PREFIX` `chat.mudrix` + `.mobile`, extensions `.mobile.widgets` and `.mobile.share`) | `chat.mudrix.mobile` |
