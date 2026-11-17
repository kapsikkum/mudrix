# Signing

Mudrix is set up to sign two things with the keys the old apps used, so existing installs keep updating in place:

- **Android release APKs** are signed with the old release keystore. Debug APKs use the throwaway debug
  key and the `.test` package id, as before.
- **Desktop in-app updates** are signed with the same minisign key as the old `mudrix-desktop`
  releases. Windows code signing and macOS notarisation are still not set up, so the installers
  themselves remain unsigned.
- **iOS** has no device signing and no Apple Developer account; only the Simulator build exists.

The passwords are not in this repository; they are in the owner's password manager and in GitHub's
repository secrets.

## Android

The key pair is the old `mudrix-release.keystore` (alias `mudrix`, RSA 4096, valid until 2054). The old app's
installed copy and its release APK are both signed with certificate SHA-256
`494a0b6dd284ed8f97c4aa9a2ac621857bf6af6a5682c6b42af54ad4c5e2e317`; a signed build must show the same value from
`sign-android.mjs verify`. The key is at `E:\code\web\mudrix-mobile\mudrix-release.keystore` and a working copy is in
`C:\Users\kapsikkum\.mudrix-signing\`. Keep a backup: if it is lost, installed apps can no longer be updated in place.
The keystore was re-encrypted with a new password on 2026-11-16, keeping the same certificate; the old password is
obsolete. The release APK uses package `chat.mudrix.mobile`; debug builds add `.test` and install beside it.

Repository secrets (Settings -> Secrets and variables -> Actions):

| Secret                      | Value                                                                             |
| --------------------------- | --------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | `base64 -w0 mudrix-release.keystore` (macOS: `base64 -i mudrix-release.keystore`) |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password                                                             |
| `ANDROID_KEY_ALIAS`         | `mudrix`                                                                          |
| `ANDROID_KEY_PASSWORD`      | the key password (usually the same as the store password)                         |

The Android workflow builds `assembleFdroidRelease`, verifies the signature with `apksigner`, and
uploads `mudrix-android-fdroid-release` (package `chat.mudrix.mobile`) when all four secrets exist. On
pull requests, and when the secrets are absent, it uploads only the debug APK.

For a local signed build:

```bash
export ANDROID_KEYSTORE_PATH="$HOME/.mudrix-signing/mudrix-release.keystore"
export ANDROID_KEYSTORE_PASSWORD='<store password>'
export ANDROID_KEY_ALIAS=mudrix
export ANDROID_KEY_PASSWORD='<key password>'
node tools/ci/sign-android.mjs prepare      # writes the git-ignored keystore.properties + copy
cd apps/android && ./gradlew :app:assembleFdroidRelease
node tools/ci/sign-android.mjs verify \
  app/build/outputs/apk/fdroid/release/app-fdroid-release.apk
node tools/ci/sign-android.mjs clean        # removes the local signing files
```

The script never prints a password. `verify` prints the signer certificate's SHA-256, which is safe to
share.

## Desktop updates

The minisign key pair is `~/.tauri/mudrix-updater.key` and `.key.pub` on the machine that made the old
`mudrix-desktop` releases. Its public key is already in `apps/desktop/src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`), so old installs accept updates from this build. Replacing the key would
force users to reinstall manually; do not rotate it unless that is intended.

Repository secrets:

| Secret                               | Value                                |
| ------------------------------------ | ------------------------------------ |
| `TAURI_SIGNING_PRIVATE_KEY`          | the contents of `mudrix-updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the key's password                   |

When both secrets exist, the Desktop workflow adds `--config src-tauri/tauri.updater.conf.json` so Tauri
writes the updater bundles and their `.sig` files, then uploads them as
`mudrix-desktop-updater-<os>`. Without both secrets it builds unsigned, exactly as before.

For a local signed build:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$HOME/.tauri/mudrix-updater.key")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='<key password>'
npm run tauri -w @mudrix/desktop -- build --debug --bundles nsis,msi,dmg,app,appimage,deb \
  --config src-tauri/tauri.updater.conf.json
```

The `.sig` files sit beside the bundles under `target/debug/bundle/` (release: `target/release/bundle/`).
The updater feed stays `https://github.com/kapsikkum/mudrix-desktop/releases/latest/download/latest.json`
until a new release feed replaces it.
