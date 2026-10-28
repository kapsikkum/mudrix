# WizardChat Mobile

Capacitor shell that wraps the web app in `../` for Android and iOS. Like the
desktop app, it loads the web build (`../dist`) from the device instead of a server.

## Prerequisites

- Node >= 22
- Android: JDK 21 (`brew install openjdk@21`)
- Android: Android SDK (`brew install --cask android-commandlinetools`, then
  `sdkmanager "platform-tools" "emulator" "platforms;android-36" "build-tools;36.0.0"`)

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
```

## Build & run (Android)

```sh
npm install
npm run android:debug          # web build -> cap sync -> gradle assembleDebug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Or `npm run android` to open the project in Android Studio.

After changing only web code: `(cd .. && npx vite build) && npx cap sync android`, then rebuild.

## Build & run (iOS)

Needs a Mac with Xcode (`sudo xcode-select -s /Applications/Xcode.app`). The simulator works
without an Apple developer account; a free Apple ID is enough for your own device.

```sh
npm install
npm run ios                    # web build -> cap sync -> opens Xcode
```

Pick a simulator or device in Xcode and press Run. After changing only web code:
`npm run ios:sync`, then run again.

## How it fits together

- The WebView is served by Capacitor from `https://localhost` (Android) or
  `capacitor://localhost` (iOS). The web app detects this via `window.Capacitor`
  (`src/util/nativeApp.ts`).
- OIDC/SSO open in the system browser (Custom Tabs on Android, the system login sheet on
  iOS) and redirect to `org.wizardchat.mobile:/oidc/callback` or `…/sso/callback`. The
  `@capacitor/app` plugin reports the link and `src/util/nativeApp.ts` loads the matching
  route, the same on both platforms.
- The native `WizardChat` plugin (`WizardChatPlugin.java` / `WizardChatPlugin.swift`) opens
  login pages and saves downloads (Downloads folder on Android, share sheet on iOS).
- Android: the hardware/gesture back button walks the WebView history, then backgrounds the app.

## Testing against a local homeserver

Run Synapse on port 8008 and use `http://127.0.0.1:8008` as a custom server.

- Android: debug builds allow plain HTTP to `127.0.0.1` / `10.0.2.2`
  (`android/app/src/debug`). Run `adb reverse tcp:8008 tcp:8008` first.
- iOS: plain HTTP to local addresses is allowed (`NSAllowsLocalNetworking`). The simulator
  reaches the Mac's `localhost` directly.

Debugging: `chrome://inspect` (Android) or Safari's Develop menu (iOS) shows the WebView.
