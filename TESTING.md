# Testing builds

These are **test builds**: debug profile, unsigned, and cut from whatever is on the branch. They are
not releases, they will not replace an installed Mudrix, and they are rebuilt and thrown away.

Builds are produced by GitHub Actions: [.github/workflows](.github/workflows/), explained in
[docs/CI.md](docs/CI.md). Android and Desktop rebuild on every relevant push to `web-look` (and on
pull requests); Check and iOS run on pull requests and pushes to `main`; every workflow can be
started by hand from **Actions → the workflow → Run workflow**. Artifacts stay available for
**14 days**; if one expired, re-run the workflow or push again.

## What each artifact is

| Artifact                          | Workflow | What is inside                                                                                              |
| --------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `mudrix-android-fdroid-debug`     | Android  | `app-fdroid-debug.apk` (universal, arm64-v8a + x86_64, debug-signed, `fdroid` flavour) and `SHA256SUMS.txt` |
| `mudrix-desktop-Windows-unsigned` | Desktop  | NSIS `*-setup.exe` (per user), `.msi`, `SHA256SUMS.txt`                                                     |
| `mudrix-desktop-Linux-unsigned`   | Desktop  | `.AppImage`, `.deb`, `SHA256SUMS.txt`                                                                       |
| `mudrix-desktop-macOS-unsigned`   | Desktop  | `.dmg` and a zipped `.app`, plus `SHA256SUMS.txt` (unsigned, **Apple silicon only**)                        |
| `mudrix-linux-tarball`            | Desktop  | the Linux tarball the Arch, Fedora and Nix packages are built from, with a filled `PKGBUILD` and `.spec`    |
| `mudrix-arch-package`             | Desktop  | the `.pkg.tar.zst` Arch package built with `makepkg` on Arch                                                |
| `mudrix-fedora-package`           | Desktop  | the `.rpm` Fedora package built with `rpmbuild` on Fedora (also installable on Bazzite via `rpm-ostree`)    |
| `mudrix-desktop-debug-<OS>`       | Desktop  | the raw debug binary, for debugging a crash                                                                 |
| `ios-simulator-app`               | iOS      | zipped Simulator `.app` and `bundle-id.txt` (unsigned, arm64, iOS 18+)                                      |
| `ios-screenshots`                 | iOS      | PNGs of the app right after launch, light and dark                                                          |
| `ios-xcodebuild-logs`             | iOS      | `xcodebuild` logs and `.xcresult` bundles                                                                   |
| `mudrix-web-dist`                 | Check    | a static build of the web app; serve it, no toolchain needed                                                |

`<OS>` in `mudrix-desktop-debug-<OS>` is `Windows`, `Linux` or `macOS`. The installers only exist
when the Desktop workflow bundled (the default); a manual run with the `bundles` input set to
`false` uploads the raw binary and nothing else.

Not in these builds: release signing, push notifications through Google (the `gplay` Android
flavour is not built), any store metadata, and the desktop updater (these builds never update
themselves).

## Getting the builds

You need `gh`, signed in to an account that can read the repository (`gh auth login`).

```sh
# What ran last, newest first
gh run list -R kapsikkum/mudrix -b web-look -L 30

# The newest successful run of one workflow
gh run list -R kapsikkum/mudrix -w android.yml -b web-look -L 30 \
  --json databaseId,conclusion --jq 'map(select(.conclusion=="success"))[0].databaseId'
```

Then download by run id, into `builds/`:

```sh
gh run download <run-id> -R kapsikkum/mudrix -n mudrix-android-fdroid-debug      -D builds/android
gh run download <run-id> -R kapsikkum/mudrix -n mudrix-desktop-Windows-unsigned  -D builds/windows
gh run download <run-id> -R kapsikkum/mudrix -n mudrix-desktop-Linux-unsigned    -D builds/linux
gh run download <run-id> -R kapsikkum/mudrix -n mudrix-desktop-macOS-unsigned    -D builds/macos
gh run download <run-id> -R kapsikkum/mudrix -n ios-simulator-app                -D builds/ios
gh run download <run-id> -R kapsikkum/mudrix -n ios-screenshots                  -D builds/ios
gh run download <run-id> -R kapsikkum/mudrix -n mudrix-web-dist                  -D builds/web
```

`gh run watch <run-id>` follows a run. The browser UI works too: the run page has the artifacts at
the bottom. Every installer artifact carries a `SHA256SUMS.txt`; check one with
`sha256sum -c SHA256SUMS.txt` (Linux), `shasum -a 256 -c SHA256SUMS.txt` (macOS) or
`Get-FileHash` (Windows).

---

## Android (APK)

```sh
adb install -r builds/android/app-fdroid-debug.apk
# or, if it is already installed and the version went down:
adb install -r -d builds/android/app-fdroid-debug.apk
adb shell monkey -p chat.mudrix.mobile.test -c android.intent.category.LAUNCHER 1
```

Without `adb`: copy the `.apk` to the phone, open it, allow "install unknown apps" for the file
manager or browser, then install. It shows up as **Mudrix** and installs **next to** a release
Mudrix (that is what the `.test` id suffix is for), so both can be on the phone at once.

- Needs Android 8.0+ (`minSdk` 26). The APK is large (hundreds of MB) because it carries both ABIs
  and debug info.
- It is signed with the throwaway debug key: never a release.
- The `fdroid` flavour has no Firebase, so notifications use the keepalive path instead of FCM.
  Expect them to be delayed or missing when the app is force-stopped; that is not a bug.
- On an emulator it runs as x86_64 - no extra setup.

## Windows (installer)

1. Unzip `mudrix-desktop-Windows-unsigned`, run `Mudrix_<version>_x64-setup.exe`.
2. Windows SmartScreen says "Windows protected your PC" - click **More info → Run anyway**. There
   is no code-signing certificate, so every build does this.
3. The installer is per-user (no admin prompt), installs into `%LOCALAPPDATA%` and adds Start Menu
   entries. Uninstall from **Settings → Apps**.
4. The `.msi` is the alternative if the exe is blocked by policy.
5. WebView2 must be present (Windows 11 has it; the installer pulls the bootstrapper if not).

Your settings and session survive uninstalling and reinstalling - they live in the app's data
directory, not in the install directory.

## macOS (dmg / app)

1. Unzip `mudrix-desktop-macOS-unsigned`, open the `.dmg`, drag **Mudrix** to Applications.
2. First launch: macOS blocks it ("cannot be opened because the developer cannot be verified").
   Either right-click the app → **Open** → **Open**, or:

   ```sh
   xattr -dr com.apple.quarantine /Applications/Mudrix.app
   ```

3. The build is **arm64 only** (Apple silicon). On an Intel Mac it will not start.
4. If you prefer the zipped `.app`: unzip it with `ditto -x -k <file>.zip .` (Finder's unzip loses
   the executable bits and the app will not start), then drag it to Applications.

## Linux (AppImage / deb)

```sh
chmod +x Mudrix_<version>_amd64.AppImage    # the exec bit is lost in the download
./Mudrix_<version>_amd64.AppImage

# or
sudo apt install ./Mudrix_<version>_amd64.deb
```

Needs `webkit2gtk-4.1` (Debian/Ubuntu: `libwebkit2gtk-4.1-0`). The AppImage bundles the media
framework; the deb does not, so install `gstreamer1.0-plugins-*` if calls or video playback
misbehave.

## iOS (Simulator)

Needs a Mac with Xcode 26 (or whichever Xcode `ios.yml` used; the run log's `versions.log` says) and
an iOS 18+ Simulator runtime. The build is arm64, so an Apple-silicon Mac.

```sh
unzip builds/ios/*-simulator-*.zip -d builds/ios/app
open -a Simulator
xcrun simctl boot "iPhone 16" || true
open -a Simulator                    # makes the window visible
xcrun simctl install booted "builds/ios/app/<Target>.app"
xcrun simctl launch booted "$(cat builds/ios/bundle-id.txt)"
```

Or drag the `.app` from Finder onto the Simulator window. The `.app` is unsigned: the Simulator
does not care, and `codesign --force --deep --sign - <app>` fixes it if `simctl install` complains.

The `.app` on disk is named after the Xcode target, which is not necessarily "Mudrix": take the
name from the zip. The bundle id to launch is in `bundle-id.txt`.

Screenshots of a fresh launch (light and dark) are in the `ios-screenshots` artifact, so you can
check the first screen without booting anything.

## Web (one command)

Prerequisites once: Node 22+, Rust via [rustup](https://rustup.rs), and `wasm-pack`
(`cargo install wasm-pack`, or the platform package).

```sh
npm ci
npm run dev:web        # builds the wasm core in the dev profile, then serves the app
```

Open <http://localhost:5180>. Hot reload works; edits under `crates/core` need another
`npm run core:web:dev` (the dev server keeps running).

Without a toolchain: download the `mudrix-web-dist` artifact and serve it (the SPA fallback
matters for deep links):

```sh
npx serve -s builds/web -l 5180
```

`npm run build` makes a production build in `apps/web/dist/`; `npm run preview:web` serves that
(vite's preview port, 4173 by default).

---

## A local homeserver to test against

`tools/test-server` starts a throwaway Matrix homeserver (tuwunel) with LiveKit, a token service
and seeded people, rooms and fixtures. It needs Docker or Podman and Node 22+; see
[tools/test-server/README.md](tools/test-server/README.md) for the details and the parity checks it
exists for.

```sh
npm run test-server          # start; writes tools/test-server/.generated/env.json
npm run test-server:seed     # accounts, rooms, spaces, fixtures
npm run dev:web              # the web app, http://localhost:5180

npm run test-server:down     # stop, keep the database
npm run test-server:reset    # stop and delete everything it made
```

Print the address to sign in to:

```sh
node -e "console.log(require('./tools/test-server/.generated/env.json').homeserver)"
```

Then open `http://localhost:5180/welcome/<that address>` and sign in. Every account's password is
`mudrix-test-password`:

| Account | What it is for                                                |
| ------- | ------------------------------------------------------------- |
| `ash`   | the viewer: owns the rooms, reads and marks unread            |
| `juno`  | the other side: sends messages, mentions, thread replies, DMs |
| `theo`  | a DM, and the missing-avatar placeholder                      |
| `mira`  | cosmetics and a rich timeline                                 |
| `wren`  | cosmetics, a second member in the mention/quiet rooms         |
| `sable` | a DM whose other member left                                  |

Point the other builds at it:

- **Desktop / iOS Simulator:** same sign-in URL; `localhost` on the Mac is the same machine.
- **Android emulator:** `npm run test-server:forward` (6167, 8090, 7880, 7881), then sign in to
  `http://10.0.2.2:6167`. Start the stack with `MUDRIX_TEST_MEDIA_HOST=10.0.2.2` if you want calls
  to work.
- **USB phone:** `npm run test-server:forward` plus `adb reverse tcp:6167 tcp:6167` (and 8090,
  7880, 7881), then sign in to `http://localhost:6167`.
- **Calls** need Caddy's local CA trusted (the README has the `podman cp` / `docker cp` command),
  or skip them: the checks below that matter most do not need calls.

---

## Manual checklist

Run through this once per platform per build worth keeping. Tick what works, note the build
(artifact name + run id) in anything you report. The scenarios in
[tools/test-server/README.md](tools/test-server/README.md) say exactly what to send and what to
expect; the ids below point at them.

### First run and account

- [ ] Cold start shows the launch screen then the welcome screen, no white flash, no crash
- [ ] Sign in with password against the local server
- [ ] Sign in with a wrong password: a readable error, no stuck spinner
- [ ] Sign out, sign back in: the session is restored, no re-login needed after a restart
- [ ] Register a new account (if the server allows it)
- [ ] Sign-in via SSO / QR code, if the homeserver offers it

### What the seeded server is for

- [ ] [R8](tools/test-server/README.md#r8---which-rooms-count-as-direct-messages): the three seeded
      DMs are under People (including the one whose other member left), the two two-person rooms
      that are not DMs stay in the room list, and `m.direct` lists exactly three users
- [ ] [N4](tools/test-server/README.md#n4---unread-and-mention-counts-across-rooms-and-threads):
      badges and the mention marker match the fixture table, join/leave/call events add nothing,
      "mark unread" puts one item back, and the thread lives in Inbox → Threads, not on the room
- [ ] [R10](tools/test-server/README.md#r10---space-hierarchy-load-time-and-behaviour): Parity Space
      fills in completely within about two seconds, expanding a category is instant, and a second
      visit comes from the cache with no new hierarchy request

### Feature scenarios (S1-S9)

Each one is a full script in
[tools/test-server/README.md](tools/test-server/README.md#feature-scenarios-s1-s9); these are the
headlines.

- [ ] [S1](tools/test-server/README.md#s1---send-edit-delete-react-and-reply): send, edit, delete,
      react, reply and quoted previews
- [ ] [S2](tools/test-server/README.md#s2---threads): threads, thread list, thread unread vs room
      badge
- [ ] [S3](tools/test-server/README.md#s3---uploads-image-video-or-file-voice): image, video, file
      and voice uploads, progress and reload
- [ ] [S4](tools/test-server/README.md#s4---search-room-global-paging): room search, global search,
      paging (36 matches over two pages)
- [ ] [S5](tools/test-server/README.md#s5---inbox-mentions-threads-mark-read): Inbox mentions,
      threads, mark all read, saved messages
- [ ] [S6](tools/test-server/README.md#s6---notifications-web-android-mentions-mute): web and Android
      notifications, mention vs plain, mute, focus rules
- [ ] [S7](tools/test-server/README.md#s7---calls-start-join-leave-mute-participants): calls: join,
      mute, leave, last-one-out countdown, second device, decline
- [ ] [S8](tools/test-server/README.md#s8---cosmetics-nameplate-decoration-banner-packs): nameplates,
      decorations, banner, pack switch
- [ ] [S9](tools/test-server/README.md#s9---settings-sync-between-web-and-android): settings sync
      between web and Android, and what stays device-only

### Rooms and timeline

- [ ] Room list loads with names, avatars, last message and timestamp
- [ ] Open a room: history loads, scrolling up loads older messages
- [ ] Send a message; it appears immediately (no reload) and arrives on a second client
- [ ] Received message from `juno` appears without a manual refresh
- [ ] Edit a message, redact a message, both reflected on the other client
- [ ] Reply, thread reply; the thread opens and its reply count is right
- [ ] React with an emoji; reaction shows and is removed again
- [ ] Send an image, a video and a file (attachment picker, drag-and-drop, paste where supported)
- [ ] Open an image: full-screen viewer, zoom, save/download
- [ ] Voice message: record, send, play
- [ ] Mentions (`@ash`) render as a chip and show up under Inbox → Mentions
- [ ] Unread badges and the mention marker match reality; opening a room clears it
- [ ] "Mark unread" from the room list puts one item back
- [ ] Link previews resolve; clicking a link opens the system browser
- [ ] Search finds a message in the room and across rooms
- [ ] Emoji picker, GIF picker (if a key is configured), sticker/custom emoji
- [ ] Message layouts: Modern (left-aligned, 15 sp, a warning shield only where a message needs one), Bubble (media
      edge-to-edge with the time in a pill, emoji-only messages without a bubble, warnings inside the bubble) and Compact
- [ ] Delete a message: a confirmation dialog appears first
- [ ] Threads: the All / My threads filters, and Back from a thread opened from a message returns to the room
- [ ] DM screen sort sheet (Android and iOS): most recent / newest / oldest / categorised; the list reorders
      immediately and the choice survives a reload and reaches the other app
- [ ] Pinning a DM (long-press / context menu) puts it in a Pinned section at the top; unpinning returns it
- [ ] Favourites get their own section, and turning "Separate rooms and direct messages" off merges the two lists

### People, spaces, settings

- [ ] Direct messages appear under People, including one where the other member left
- [ ] A two-person room that is not a DM stays in the room list
- [ ] Space rail: open a space, its categories and rooms are complete; re-opening is instant
- [ ] Space settings: room-list style (Matrix/Modern), auto-join, banner preset and an uploaded banner image
- [ ] Invite someone to a room; the invite arrives on the other client and can be accepted
- [ ] Room settings: name, topic, avatar, addresses, publish to the directory, notifications, leave room
- [ ] Room settings → Widgets lists a room's widgets (mobile opens them outside the app)
- [ ] Profile: display name, avatar, status/presence change and show on the other client
- [ ] Home: no greeting card; friends playing or listening to something appear under the friends heading; the
      search tip mentions the search icon on phones and Ctrl K on the desktop
- [ ] Settings: theme (light/dark/system), accent, message layout, font size; all apply immediately
- [ ] Settings → Cosmetics: the packs switch, Select Packs and the subscribed lists; Account → Profile cosmetics:
      pick each kind and upload your own picture (it becomes a custom cosmetic in the personal pack)
- [ ] Switch language; the UI changes without a restart
- [ ] Notifications: message from `juno` with the app in the background / closed
- [ ] Encryption: a room with E2EE sends and receives, and session verification works
- [ ] A status with Do Not Disturb survives setting the status text; it expires at the time you set

### Calls

- [ ] Join a voice room; the other side hears you
- [ ] Start a video call; camera and microphone toggles work
- [ ] Screen share (desktop and web), stop sharing
- [ ] Leave the call; the tile disappears for everyone
- [ ] On a server without MSC4140 delayed events (the local tuwunel), the call stays connected past a minute
- [ ] The connection stats sheet opens from the call's ⋯ menu; the soundboard plays for everyone

### Platform specifics

- [ ] **Web:** reload on a deep link (`/room/...`) works; browser back/forward behave; a second tab
      does not break the session
- [ ] **Windows:** tray icon, close-to-tray, unread badge on the taskbar, `matrix:`/`mudrix:` deep
      link opens the app, quit from the tray
- [ ] **macOS:** menu bar, dock badge, deep link, quit with the window closed, traffic-light spacing
- [ ] **Linux:** AppImage starts from a different directory; deb menu entry; Wayland and X11
- [ ] **Android:** back gesture at the room list, rotation, notification tap opens the room, share
      sheet target, battery/doze behaviour for notifications
- [ ] **iOS Simulator:** share extension appears in Photos/Safari, notification service extension
      renders a preview (needs a push), the app survives backgrounding

---

## Reporting

Include: platform and version, artifact name, run id (or the link), what you did, what happened,
what you expected, and a screenshot if it is visual. Logs help: desktop and Android write to the
console, and the iOS `ios-xcodebuild-logs` artifact has the build logs.
