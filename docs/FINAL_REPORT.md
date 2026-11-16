# Mudrix: final report

Date: 2026-11-16. Branch: `web-look` (private repo). This report covers the Rust-core port of Mudrix on web,
desktop, Android and iOS: what was done, the evidence for it, and what is left for the owner.

## Where to get a build

| Target                          | How                                                                                              | Artifact                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Web                             | `npm ci` once, then `npm run dev:web` → <http://localhost:5180>                                  | CI also uploads `mudrix-web-dist` (the built site) on every push                                                      |
| Desktop (Windows, Linux, macOS) | CI → Desktop workflow                                                                            | `mudrix-desktop-{Windows,Linux,macOS}-unsigned` (NSIS/MSI, AppImage/DEB, dmg/app zip) plus `SHA256SUMS.txt`; unsigned |
| Android                         | CI → Android workflow, or `apps/android/app/build/outputs/apk/fdroid/debug/app-fdroid-debug.apk` | `mudrix-android-fdroid-debug` (APK + `SHA256SUMS.txt`)                                                                |
| iOS simulator                   | CI → iOS workflow                                                                                | `ios-simulator-app` (zipped `.app` + bundle id), `ios-screenshots`                                                    |

`TESTING.md` has the install steps, the seeded test server and the manual checklist. The Android release APK is signed
with the old app's release keystore and desktop updater artifacts with the old `mudrix-desktop` minisign key
(`docs/SIGNING.md`); the desktop installers themselves stay unsigned, and iOS is Simulator-only (there is no Apple
Developer account). The Desktop workflow also
builds Arch, Fedora and Nix packages from the same Linux tarball; `TESTING.md` lists those artifacts.

The final code commit is `baa6383e`; documentation-only commits follow it. The Desktop artifacts are from its push run
`43848422884`, and the Android APK from run `43845706935` (the web-only presence-dot fix does not touch Android). A
copy of every artifact is in **`E:\code\web\mudrix-builds\signed-20261116\`**: Windows NSIS/MSI, Linux AppImage/DEB,
macOS dmg/app zip and the minisign updater `.sig` files (each `SHA256SUMS` verifies every file beside it), Arch and
Fedora packages, the Linux tarball with PKGBUILD and spec, the Android `Mudrix-26.12.2-release.apk` (old certificate
`494a…`), and the web dist built from `baa6383e`. The iOS simulator app and screenshots from run `43848436941` are
in the same folder.

## The rename

- Every user-visible and code-level upstream name is gone: strict branding scan `0 hit(s)` including
  `apps/web/public` HTML/YAML and the logo artwork, and the normal scan `0 hit(s)`.
- `WizardClient` is now `MudrixClient` across Rust, TypeScript, Kotlin and Swift, with the bindings regenerated.
- The names that have to stay for existing installs are kept and allowed with a reason in
  `tools/ci/branding-allow.txt`: the Android keystore alias (the upstream package prefix), the OAuth callback scheme
  (the upstream scheme; iOS keeps it, both are registered), the stored sound-pack id, the upstream YouTube
  bridge URL, and the old account-data/profile names, which are read but never written.
- **Upgrade proof:** the Android APK built from the rename was installed with `adb install -r` over the existing test
  install (same application id, `firstInstallTime` unchanged, no uninstall, no data clear). The account stayed signed
  in, the DM list and previews were identical, the theme, layout and Modern shell were unchanged, encrypted DMs still
  decrypted, and there was no verify-session prompt or re-login. The one side effect was the launcher component moving
  to `chat.mudrix.android.MainActivity`; an activity alias for the upstream package activity keeps old pinned
  shortcuts working.
- **Web sign-in migration:** accounts stored under the upstream accounts key (and the older single-account key) move to
  `mudrix.accounts` on first read and stay signed in, keeping the token, device id and refresh token. Unit-tested and
  checked in a browser.

## Parity

`docs/PARITY_MATRIX.md` is the source of truth (160 numbered rows; per-platform status and evidence in each row).

| Platform      | done | partial | missing | won't-do |
| ------------- | ---- | ------- | ------- | -------- |
| Web / Desktop | 154  | 1       | 0       | 2        |
| Android       | 126  | 6       | 0       | 2        |
| iOS           | 119  | 7       | 0       | 3        |

What the remaining partials are, and why:

- **Web:** `E3` — the Pages workflow is written (stable on tags, `/next/` on pushes) but Pages has to be switched to
  "GitHub Actions" in the repository settings, which is the owner's step. `K8` (room-key file export) is not possible
  with the current SDK on wasm; desktop and mobile offer it.
- **Android:** `A11` (focus handling and a device-wide accessibility pass; touch targets, announcements and reduced
  motion are in), `I5` (widgets open outside the app; a widget driver needs a security review), `R3` (the Channels tab
  and auto-join exist; a second Matrix-style rooms panel was judged redundant), `S1` (two Ogg packs), `S5` (a space's
  own board is edited from space settings), and the push rows `N3`/`Y3`, which depend on the owner's push setup.
- **iOS:** the same push rows, `S1` Ogg packs, `S5`, `R3`, `I5`, and `A11` (no device VoiceOver pass yet). iOS "done"
  means the code compiles and XCTest passes in CI; the owner's iPhone test is the last step.

Won't-dos are in `docs/DECISIONS.md` with the reason a user would be given (`N1`, `X1`, `X2`, `S1` Ogg, `K8`, `K5`,
`I5` widget drivers, `R3` duplicate panel, `S5` space board editor, `E3` Pages setting).

## Scenarios (local test server, seeded accounts only)

Full step/expected/actual tables with screenshots are in
`C:\Users\kapsikkum\AppData\Local\Temp\opencode\evidence\{web,android}\report.md`, with screenshots beside them.
**Screenshots note:** a `docs/screenshots` folder was committed and then removed again: this machine's browser and
emulator are shared with another project, and the captures were mixed up with that project's images. The run evidence
folders above and the CI `ios-screenshots` artifact are the trustworthy sets; `TESTING.md` describes each screen to
capture. Re-shoot on a quiet machine (nothing else driving the shared browser or emulator) before publishing them.
Summary:

| Scenario                               | Web                                            | Android                                                    |
| -------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| N4 unread/mentions/thread badges       | pass                                           | pass                                                       |
| R8 DMs and two-person rooms            | pass                                           | pass                                                       |
| R10 large space (40 rooms)             | pass, 0.7 s warm / 3.1 s cold, no refetch      | pass, names at ~0.8 s, never raw ids                       |
| Media in bubbles                       | pass                                           | pass                                                       |
| S1 send/edit/react/reply               | pass                                           | pass (delete confirmation added after the first run)       |
| S2 threads                             | pass                                           | pass (All/My filters added after the first run)            |
| S3 uploads (image, video, file, voice) | pass                                           | pass (video upload not run)                                |
| S4 search                              | pass                                           | pass (count in the first run polluted by a concurrent run) |
| S5 inbox and mark-all-read             | pass                                           | pass                                                       |
| S6 notifications                       | pass                                           | pass                                                       |
| S7 calls                               | pass after the core fix: stayed connected 72 s | pass after the core fix: 75 s, no cleartext error          |
| S8 cosmetics                           | pass                                           | pass, plus the new Cosmetics page and custom uploads       |
| S9 settings sync                       | pass                                           | pass                                                       |

No crashes: no `FATAL EXCEPTION`, `AndroidRuntime` or ANR for the package across the Android runs.

## Bugs found by the runs, and fixed

- **Calls dropped ~6 s after joining** on servers without MSC4140 delayed events (tuwunel). The core now checks the
  server's features, falls back to a plain membership and renews it, and never tears the call down for that.
- **Room and space names** showed "2 people", "Empty Room" or a raw id while loading. Names come from the SDK cache,
  are re-emitted when they resolve, and the state sync requests the name-relevant state. A cold start still shows
  placeholder rows until the first sync lands (about 8 s on the emulator), which is server + full-range sync time.
- **Large spaces** took 44 s with three `/hierarchy` fetches per visit. The hierarchy is now built from local state
  first and cached per session, with invalidation on child changes.
- **Thread panel** waited 6–12 s; the first page now arrives in about 0.7 s.
- **Room list rows** showed raw ids until state loaded; the list no longer subscribes to rooms the SDK has not stored,
  which also removed ~68 "Room is unknown" log lines per cold start.
- **Modern Android message layout** centred the text and put an encryption shield in a gutter column on every line;
  it is now left-aligned at 15 sp, with a warning shield only for messages that need one.
- **Sheet header** on Android had a drag handle, ~60 dp of empty space and a Done-only row; it is now just the handle.
  The profile sheet no longer draws the nameplate behind the name, its ⋯ menu sits inside the banner, and its mutual
  counts agree.
- **Bubble layout** (all platforms): no gutter shields, warnings only, emoji-only messages without a bubble, media
  edge-to-edge with the time in a pill, captions inside the bubble.
- **Web look**: the blocking "set up secure messaging" screen is gone (dismissible Home card instead), 29 missing
  translation keys added in 11 languages, the Cosmetics page rebuilt to the old app's shape, the settings search
  removed, the space rail order honours the old `wz_space_order`, the login says "<software> <version> detected", the
  old app's password form stays on SSO servers, and the Windows-style keyboard pills, keycaps and row heights match.
  The unslop pass then snapped spacing to the token grid, removed glows and gradient washes, replaced emoji used as
  chrome with icons, dropped uppercase tracked labels, calmed heading weights and cleaned punctuation in all 11
  languages. The greeting card is gone; the type scale is six steps; the Live badge is a theme colour.
- **Branding**: the old upstream mark was still in the web loading screen and several theme logo files, and the
  desktop icon; all are the Mudrix mound now (one compiled macOS icon asset needs a Mac to rebuild — see below).
- **Status bugs found in review**: setting a status wiped the DND mode, and iOS wrote the expiry under a key the other
  clients did not read. The core now preserves every other key and writes `expires` in milliseconds, reading both keys.

## Owner reports, fixed after the first hand-over

- **The Windows installer said "Dev build".** Only `tauri dev` is a dev build now: it keeps its own app id, its
  "Mudrix Dev" name and its badged icon, while every built installer — including CI's unsigned debug-profile ones —
  is plain Mudrix.
- **"Verify this session" stayed after verifying.** A device now counts as verified when the account's cross-signing
  identity has signed it, the same fact the old app read, so the badge, the Home card and the Sessions row clear as
  soon as verification finishes. A fresh sign-in on an unverified device opens Settings › Sessions once; restored and
  verified sessions do not prompt.
- **Messages were not marked read.** The old app's receipt rules are back: sent on a new message, on window focus and
  visibility, with a 2-second safety net while the room sits at the bottom; retried after a failed send and while the
  server still counts the room unread; never for local `~` echoes, while scrolled up or while the tab is hidden.
  Checked against the test server: the other client saw the unread count go to 0.
- **Compact mode regressed.** Its stylesheet already matched the old app rule for rule; the six-step type-scale merge
  had fattened its time and sender sizes. Compact uses its original narrow sizes again.
- **The call menu** has one "Pop out" (the real separate window) with the box-with-arrow icon, no "Beta" badge on
  Watch Together, and "Show non-video participants" where the old app kept call display preferences: Settings ›
  Voice & Audio › Calls.
- **Sounds:** screen share start/stop, deafen/undeafen, raise hand and reaction had no pack sounds. All eight packs
  gained those six clips (48 files, built by `tools/sounds/generate-packs.mjs`) and web, Android and iOS play the
  chosen pack for them like the other cues.
- **A console window opened beside the Windows app.** `windows_subsystem` was only set for release builds, so the
  debug-profile installers CI publishes opened a console. It is now gated on tauri's `dev` cfg: `tauri dev` keeps its
  terminal, and every built installer — debug-profile included — is a GUI app. Verified on the rebuilt binary with a
  PE-header check (`subsystem=2`, GUI; the previous artifact was `subsystem=3`, console).
- **Android release APKs and desktop update artifacts are signed with the old apps' keys**, so existing installs keep
  updating in place: the old `mudrix-release.keystore` for Android and the old `mudrix-updater` minisign key for the
  desktop updater (`docs/SIGNING.md`). The signing path was checked end to end: the keystore was re-encrypted (same
  certificate), a release APK built with it carries the old app's certificate `494a…` and the production package id,
  and the R8 build launches; the updater key signs a test payload. The key material and passwords are in the repository
  secrets, so CI builds the signed release APK and updater `.sig` files on the next run.
- **The presence dot could hide behind an avatar cosmetic.** On web the decoration, frame and effect overlays sat above
  it; the dot now has the avatar's z-layer, so it stays on top. Android and iOS already draw it as the last overlay.
- **Android room list rows** have a little vertical air so full-width nameplates do not read as one block.
- **The DM screen got sort modes** (owner request): most recent, newest first, oldest first or categorised, plus a
  switch for separating rooms and DMs, a favourites section and pinned users. Newest/oldest use the room's
  `m.room.create` time; the options and pins live in `io.github.kapsikkum.mudrix.room_list`, so Android and iOS agree
  and a pin survives a room upgrade. Android was checked on the emulator (sort applies, pin/unpin, merged list); iOS
  is covered by its unit tests and the simulator build.

## Packaging

- **Distribution packages are built in CI** (Desktop workflow, Linux leg): a `mudrix-linux-tarball` artifact (the tarball
  plus a filled `PKGBUILD` and `mudrix.spec`), then `mudrix-arch-package` (`makepkg` on Arch), `mudrix-fedora-package`
  (`rpmbuild` on Fedora, installable on Bazzite with `rpm-ostree`) and a Nix check (`nix flake check`, `nix build` from
  the tarball, and a `nixosSystem` evaluation with `nixosModules.mudrix`). The Nix job is green: the package builds from
  the tarball and the module evaluates to a system derivation. All are debug-profile and unsigned, like the other CI
  artifacts; the Nix package's `sha256` is a placeholder until a release carries the tarball.

## Ready for review

- CI is green on `baa6383e` for Check, Branding, Android, Desktop and iOS (the iOS workflow builds the app and runs
  XCTest; the Android workflow builds and unit-tests the APK, and both upload artifacts). The Desktop push run also
  passes Arch, Fedora and Nix, including the NixOS module evaluation. Pages deploys too: the site is live at
  <https://kapsikkum.github.io/mudrix/> with the `/next/` build (the front page redirects to `/next/` until a stable
  tag carries the web app).
- The Android CI artifact is signed with the old certificate `494a…`, and the Windows, macOS and Linux updater
  `.sig` files verify against the old public key in `tauri.conf.json`.
- The Windows test installer is a GUI app: the rebuilt binary has PE `subsystem=2` (GUI), where the first hand-over's
  binary was `subsystem=3` (console).
- Core: `cargo fmt`, `clippy -D warnings`, 90+ unit tests, wasm check.
- Web: `tsc`, eslint, 234 unit tests, Prettier, i18n complete at 2821 keys in 11 languages. The presence dot was
  checked in the running app against a decorated test profile: the dot computes `z-index: 15` over the decoration's
  `1` and sits visibly on top (screenshot in the artifact folder).
- Android: 416 unit tests, 0 failures; the app installs and runs on the emulator with no crashes.
- iOS: builds and XCTests in CI; it runs in the Simulator only (no device install without an Apple Developer account).

## Open questions and owner items

1. **DeepSeek credit.** The `opencode-go` account ran out mid-run; work continued on Sonnet 5.5 and Haiku. Top up if
   you want the cheaper agents back.
2. **GitHub Pages** (E3): **done.** The Pages site is enabled with build type **"GitHub Actions"**, and the
   `github-pages` environment deploys from `web-look`, `main` and `v*` tags. The deploy on `baa6383e` is green and the
   site is live at <https://kapsikkum.github.io/mudrix/>. No signing step and no Apple account were needed.
3. **GIF keys**: **done.** `VITE_GIPHY_API_KEY` and `VITE_KLIPY_API_KEY` are repository secrets, and the Pages,
   Desktop, Android and iOS workflows pass them to each platform's build.
4. **iOS is Simulator-only**: without an Apple Developer account the app cannot be signed for a device, TestFlight or
   the App Store, and APNs push cannot work. The simulator build (`TESTING.md`) is the test target, and the iOS push
   path is the background keep-alive with local notifications, not APNs. A device VoiceOver pass (`A11`) is therefore
   not possible.
5. **macOS icon**: `apps/desktop/.../Assets.car` (the compiled layered app icon) still contains the old art; it needs
   `actool`/Icon Composer on a Mac. The source PNGs are already the Mudrix mound.
6. **Choices I made that you may want to revisit** (all in `docs/DECISIONS.md`): the unslop pass overrides the old
   app's uppercase labels, heavy heading weights and trailing full stops; the grey "can't verify" shield is no longer
   drawn on normal messages in the phones' modern layouts (the old web showed it); the unnamed two-person room stays a
   room, not a DM; `R3`, `S5`, `I5` and `E3` are closed as described above rather than built out further.
7. **Cold-start room names** still show placeholder rows for a few seconds on a cold emulator start; a release wasm
   build or a lower per-room event limit would shorten it, at the cost of unread-count accuracy.
