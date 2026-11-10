# Building

| App     | Command                 | Result                                                                                     |
| ------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| Web     | `npm run build`         | `apps/web/dist/` (or `docker build -t mudrix .`)                                           |
| Desktop | `npm run desktop:build` | `target/release/bundle/`, for the platform you build on                                    |
| iOS     | `npm run ios:build`     | `apps/ios/build/Build/Products/Release-iphoneos/WizardChat.app` (shown as "Mudrix" on iOS) |
| Android | `npm run android:build` | `apps/android/app/build/outputs/apk/gplay/release/app-gplay-release.apk`                   |

`npm run desktop:release` builds the desktop app with updater artifacts (it needs `TAURI_SIGNING_PRIVATE_KEY` and its
password in the environment, see [RELEASING.md](../RELEASING.md)). The iOS product keeps its upstream target name
`WizardChat`, so the bundle on disk is still `WizardChat.app`; the name people see, the bundle id and the URL scheme are
Mudrix's.

The Android app has two flavours: `gplay` (push notifications through Firebase; its config is
`apps/android/app/src/gplay/res/values/firebase.xml`, from the Firebase project's `google-services.json`) and `fdroid`
(no Google code).

## Releases

How versions, tags and signing work, and which parts of the release process are not automated yet, is in
[RELEASING.md](../RELEASING.md). There is no GitHub Actions workflow in this repository yet. `.gitlab-ci.yml` and
`apps/desktop/scripts/publish-update.mjs` are upstream's GitLab release pipeline (GitLab package registry, Cloudflare
Pages, `wizardchat-desktop` feed); they are not used here and will be replaced.

The "What's new" notes in the apps come from `whatsnew/<version>.md`.
