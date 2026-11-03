# Building and releasing

| App     | Command                 | Result                                                          |
| ------- | ----------------------- | --------------------------------------------------------------- |
| Web     | `npm run build`         | `apps/web/dist/` (or `docker build -t wizardchat .`)            |
| Desktop | `npm run desktop:build` | `target/release/bundle/`, for the platform you build on         |
| iOS     | `npm run ios:build`     | `apps/ios/build/Build/Products/Release-iphoneos/WizardChat.app` |
| Android | `npm run android:build` | `apps/android/app/build/outputs/apk/release/app-release.apk`    |

## Releases

Start a release from **Build -> Pipelines -> Run pipeline** on `main` with the variable `VERSION`: `v26.11.0` for
stable, `v26.11.0-next.1` for next (add `DRY_RUN=true` to try it without publishing). The pipeline bumps the version in
`package.json` on a `prepare/<version>` branch, tags it and opens a merge request to merge back. The tag then:

- builds the web app and deploys it, stable to <https://rust.wizardchat.org>, next to <https://next-rust.wizardchat.org>
- pushes the Docker image to the container registry
- builds the desktop apps for macOS, Windows and Linux and publishes them with the update feed the installed apps check,
  plus a Linux tarball and a `PKGBUILD` for it (from `packaging/aur/wizardchat-bin/`). Only the AppImage updates itself
  on Linux. Like the web app, stable installs only get stable releases and next installs only next ones
- creates the GitLab release with the notes from the commits and the installers

The "What's new" notes in the apps come from `whatsnew/<version>.md`.

CI needs `GITLAB_RELEASE_TOKEN` (pushes the branch and tag, opens the merge request), `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` (the Pages projects `wizardchat-rust` and `wizardchat-rust-next`) and the updater key. The updates are signed with Tauri's updater key, which CI reads from the `TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` and `TAURI_UPDATER_PUBKEY` variables. Create it once with
`npx -w @wizardchat/desktop tauri signer generate -w wizardchat-updater.key` and keep it safe: without it, installed
apps can't verify updates any more.
