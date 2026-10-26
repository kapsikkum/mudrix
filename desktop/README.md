# WizardChat Desktop

The Electron app for [WizardChat](https://wizardchat.org). It packages the web app from the repo
root (`../dist`), so build that first.

- **Version:** taken from the root `package.json` (see `electron-builder.cjs`); the `version` here
  is a placeholder.
- **Config:** `electron-builder.base.yml` holds the packaging settings, `electron-builder.cjs` adds
  the version.
- **Updates:** stable builds read `https://app.wizardchat.org/desktop/latest*.yml`, next builds
  `https://next.wizardchat.org/desktop/`. CI writes those files on release
  (`scripts/write-update-feed.mjs`).

## Build

```sh
# web build at the repo root
npm --prefix .. ci && npm --prefix .. run build

npm ci
npm run build:electron

npx electron-builder --mac     # or --linux (AppImage) / --win
```

The output is in `release/`. `npm run package:mac` / `package:linux` / `package:win` do all of the
above in one go.

## macOS: unsigned build warning

WizardChat isn't signed yet, so macOS may block it the first time. To allow it:

1. Open **System Settings** → **Privacy & Security**
2. Scroll to the bottom under **Security**
3. Click **Allow WizardChat**
