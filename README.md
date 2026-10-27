<img src="public/assets/images/logo.svg" alt="WizardChat Logo" width="128" />

# WizardChat - Simple, Secure, Magical

[![pipeline status](https://gitlab.com/wizardchat/wizardchat-web/badges/main/pipeline.svg)](https://gitlab.com/wizardchat/wizardchat-web/-/pipelines)
[![release](https://img.shields.io/gitlab/v/release/wizardchat/wizardchat-web?sort=semver&logo=gitlab)](https://gitlab.com/wizardchat/wizardchat-web/-/releases)
![license](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)
[![chat](https://img.shields.io/matrix/wizardchat-app:matrix.org?logo=matrix)](https://matrix.to/#/#wizardchat-app:matrix.org)

WizardChat is a Matrix client. End-to-end encrypted, open source, and works in your browser and as a desktop app for Windows, macOS and Linux.

<img align="center" src="https://gitlab.com/wizardchat/wizardchat-site/-/raw/main/assets/wizardchat-screenshot.png" height="320">

## Features

- E2EE
- Direct messages and Spaces
- Voice and video calls (1:1 and group, via MatrixRTC + LiveKit)
- File, image, and video sharing
- Pin messages
- Message search
- Threads
- Message reactions, edits, and replies
- Advanced Message formatting
- Typing indicators
- Custom Stickers and Emojis
- GIFs
- SSO login
- Read receipts
- Themes (Carbon, Parrot, Hallow, Ethereal)

## Try out WizardChat

### Web

- **Stable**: [app.wizardchat.org](https://app.wizardchat.org)
- **Next** (pre-release): [next.wizardchat.org](https://next.wizardchat.org)

### Desktop

Windows (installer), macOS (Apple Silicon, DMG) and Linux (AppImage): download from [wizardchat.org](https://wizardchat.org) or the [releases page](https://gitlab.com/wizardchat/wizardchat-web/-/releases).

> **macOS:** the app isn't signed yet, so macOS may block it the first time. Open **System Settings -> Privacy & Security**, scroll down to **Security** and click **Allow WizardChat**.

## Local Development

### Manual Setup

#### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher)
- [npm](https://www.npmjs.com/)

1.  Clone the repository:

    ```bash
    git clone https://gitlab.com/wizardchat/wizardchat-web.git
    cd wizardchat-web
    ```

2.  Install dependencies and start development server:

    ```bash
    npm ci
    npm start
    ```

    The app will be available at **http://localhost:8080**

### Desktop app

The Electron app lives in [`desktop/`](desktop/) with its own `package.json`; it packages the web build from the repo root.

```bash
npm ci && npm run build
cd desktop && npm ci
npm run build:electron
npx electron-builder --mac # or --linux / --win
```

### Using Docker

- Just pull the newest docker image from [Gitlab Container Registry](https://gitlab.com/wizardchat/wizardchat-web/container_registry/)

## License

- **Code:** [AGPL-3.0](LICENSE). Forks and modified versions must stay under the AGPL, and if you host a modified version, its users must be able to get the source code.
- **Logo and app icons** (`public/assets/images/logo*.svg`, `desktop/icons/`): [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), © WizardChat. Share and adapt them with attribution, under the same license.
- **Name:** the licenses don't cover the WizardChat name. If you publish a fork, please give it its own name and logo so it isn't mistaken for the official app.
