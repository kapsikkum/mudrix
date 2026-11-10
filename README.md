<img src="apps/web/public/assets/images/logo.svg" alt="Mudrix logo" width="128" />

# Mudrix - Simple, Secure, Muddy

![license](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)
[![release](https://img.shields.io/github/v/release/kapsikkum/mudrix?sort=semver&logo=github&include_prereleases)](https://github.com/kapsikkum/mudrix/releases)

Mudrix is a Matrix client. End-to-end encrypted, open source, and works in your browser, as a desktop app for Windows,
macOS and Linux, and as a native app for iOS and Android. All apps share one Rust core built on matrix-rust-sdk.

This repository replaces the earlier `mudrix-web`, `mudrix-desktop` and `mudrix-mobile` repositories: the web client, the
desktop app and the two native mobile apps now live here, on a new base (see [Based on WizardChat](#based-on-wizardchat)).
The port is still in progress: [docs/PORT.md](docs/PORT.md) lists what came over from the old Mudrix and
[docs/MISSING.md](docs/MISSING.md) what is still missing. Most of it has not been run on every platform yet.

## Features

- End-to-end encryption, with device verification and key backup
- Direct messages and Spaces, with a modern or a Matrix-style space layout
- Voice and video calls (1:1 and group, via MatrixRTC and LiveKit) with screen sharing, push-to-talk and Watch Together
- Threads, replies, reactions, edits and pinned messages
- Advanced message formatting, custom stickers and emojis, GIFs (GIPHY and KLIPY)
- File, image and video sharing (big videos are shrunk before sending, photos are stripped of metadata), voice messages,
  polls and location sharing
- Link previews, YouTube cards and message search
- Rich profiles: bio, pronouns, timezone, a "Mudrix user" badge, avatar decorations, frames and an activity line
- Reminders, a saved-messages inbox, streamer mode and per-sound notification sound packs
- Integrations and widgets
- Sign in with SSO, OAuth or a QR code, multiple accounts
- 29 built-in themes (dark and light), custom themes you make from nine colours, and phone layouts with bottom sheets
- 11 languages: English, Deutsch, Español, Français, Italiano, Português, Русский, 日本語, Türkçe, Nederlands, Polski

Desktop adds a tray icon, native notifications, an unread badge, launch at login, deep links and in-app updates.

## Try out Mudrix

Pre-built apps are published on the [releases page](https://github.com/kapsikkum/mudrix/releases). No release has been
cut from this repository yet (see [RELEASING.md](RELEASING.md)), so until then build it yourself (see Local Development).

### Desktop

Windows (installer), macOS (DMG) and Linux (AppImage, `.deb`, `.rpm`): download from the
[releases page](https://github.com/kapsikkum/mudrix/releases/latest). The installers are not code-signed.

- **Windows:** SmartScreen shows "Windows protected your PC". Click "More info", then "Run anyway".
- **macOS:** Gatekeeper blocks the first launch. Open **System Settings -> Privacy & Security**, scroll to **Security**
  and click **Open Anyway**.
- **Linux:** make the AppImage executable (`chmod +x`) and run it.

In-app updates are checked against a minisign signature before they are installed.

### Android

Download the APK from the [releases page](https://github.com/kapsikkum/mudrix/releases/latest). Notifications arrive
through [UnifiedPush](https://unifiedpush.org) when a distributor is installed.

### iOS

The IPA is not signed by the project. Sideload it with AltStore, SideStore, Sideloadly or TrollStore, or build it
yourself with your own Apple team (see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)). There is no store or source feed for
this repository yet. The old repositories were listed at <https://kapsikkum.github.io/apps/>; that listing has not been
updated for the new apps.

### Web

There is no hosted client for this repository yet (the old one was at <https://kapsikkum.github.io/mudrix-web/>).
Build it with `npm run build`, or serve it with Docker:

```sh
docker build -t mudrix .
docker run -p 8080:80 mudrix
```

## Local Development

Short version, from the repo root (Rust via rustup, wasm-pack and Node 22+ installed):

```sh
npm install
npm run core:web:dev   # builds the core for the browser once
npm run dev            # web app on http://localhost:5180
```

`npm run desktop`, `npm run android` and `npm run ios` run the other apps. GIF search needs API keys at build time: put
`VITE_GIPHY_API_KEY` and `VITE_KLIPY_API_KEY` in a git-ignored `.env.local`; without a key that provider's tab is
disabled.

- [Development](docs/DEVELOPMENT.md): setting up, running the apps, checks
- [Building](docs/BUILDING.md) and [releasing](RELEASING.md)
- [Working on the codebase](docs/CODEBASE.md): where code goes, the conventions and the internal names that still say WizardChat
- [Contributing](CONTRIBUTING.md): reporting bugs, suggesting features and contributing code
- [Branding and artwork](docs/BRANDING.md)

## Based on WizardChat

Mudrix is a fork of [WizardChat](https://gitlab.com/wizardchat/wizardchat)'s Rust-core rewrite and keeps its
AGPL-3.0 licence. The core, the native iOS and Android apps and much of the web client come from WizardChat, (c) its
authors; Mudrix adds its own features on top. Some internal names (crates, npm workspaces, Swift and Kotlin types) still
say WizardChat to keep merging upstream changes practical.

## License

- **Code:** [AGPL-3.0](LICENSE). Forks and modified versions must stay under the AGPL, and if you host a modified version,
  its users must be able to get the source code.
- **Logo and app icons:** the Mudrix logo is original Mudrix artwork. Upstream's own logo and icons are
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), (c) WizardChat; the few places that still use them are
  listed in [docs/BRANDING.md](docs/BRANDING.md) and are being replaced.
- **Name:** the licences don't cover the WizardChat name, and Mudrix is not the official WizardChat app.
