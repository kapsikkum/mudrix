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

`TESTING.md` has the install steps, the seeded test server and the manual checklist. Nothing here is signed for
release: the Android signing key and the Apple signing/push setup are owner items (below).

## The rename

- Every user-visible and code-level WizardChat name is gone: strict branding scan `0 hit(s)` including
  `apps/web/public` HTML/YAML and the logo artwork, and the normal scan `0 hit(s)`.
- `WizardClient` is now `MudrixClient` across Rust, TypeScript, Kotlin and Swift, with the bindings regenerated.
- The names that have to stay for existing installs are kept and allowed with a reason in
  `tools/ci/branding-allow.txt`: the Android keystore alias `org.wizardchat.session`, the OAuth callback scheme
  `org.wizardchat` (iOS keeps it, both are registered), the stored sound-pack id `wizardchat`, the upstream YouTube
  bridge URL, and the old account-data/profile names, which are read but never written.
- **Upgrade proof:** the Android APK built from the rename was installed with `adb install -r` over the existing test
  install (same application id, `firstInstallTime` unchanged, no uninstall, no data clear). The account stayed signed
  in, the DM list and previews were identical, the theme, layout and Modern shell were unchanged, encrypted DMs still
  decrypted, and there was no verify-session prompt or re-login. The one side effect was the launcher component moving
  to `chat.mudrix.android.MainActivity`; an activity alias for `org.wizardchat.android.MainActivity` keeps old pinned
  shortcuts working.
- **Web sign-in migration:** accounts stored under `wizardchat.accounts` (and the older single-account key) move to
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
- **Branding**: the old WizardChat mark was still in the web loading screen and several theme logo files, and the
  desktop icon; all are the Mudrix mound now (one compiled macOS icon asset needs a Mac to rebuild — see below).
- **Status bugs found in review**: setting a status wiped the DND mode, and iOS wrote the expiry under a key the other
  clients did not read. The core now preserves every other key and writes `expires` in milliseconds, reading both keys.

## Ready for review

- CI is green on the final commit of the branch for Check, Branding, Android, Desktop and iOS (see the run for
  `9303b9fd`… and the last commit; the iOS workflow builds the app and runs XCTest).
- Core: `cargo fmt`, `clippy -D warnings`, 90+ unit tests, wasm check.
- Web: `tsc`, eslint, 218 unit tests, Prettier, i18n complete at 2810 keys in 11 languages.
- Android: 410 unit tests, 0 failures; the app installs and runs on the emulator with no crashes.
- iOS: builds and XCTests in CI (no device run — the owner's step).

## Open questions and owner items

1. **DeepSeek credit.** The `opencode-go` account ran out mid-run; work continued on Sonnet 5.5 and Haiku. Top up if
   you want the cheaper agents back.
2. **GitHub Pages** (E3): switch Settings → Pages → Source to "GitHub Actions" so the new workflow can deploy the
   stable site and `/next/`.
3. **Repository secrets**: `VITE_GIPHY_API_KEY` and `VITE_KLIPY_API_KEY` (the KLIPY tab stays hidden without its key),
   the Android release signing key, and the Apple signing + push entitlement/gateway (N3/Y3).
4. **iPhone testing**: install the CI simulator build (or an own-signed build) and run the checklist in `TESTING.md`.
   A device VoiceOver pass is the last part of `A11`.
5. **macOS icon**: `apps/desktop/.../Assets.car` (the compiled layered app icon) still contains the old art; it needs
   `actool`/Icon Composer on a Mac. The source PNGs are already the Mudrix mound.
6. **Choices I made that you may want to revisit** (all in `docs/DECISIONS.md`): the unslop pass overrides the old
   app's uppercase labels, heavy heading weights and trailing full stops; the grey "can't verify" shield is no longer
   drawn on normal messages in the phones' modern layouts (the old web showed it); the unnamed two-person room stays a
   room, not a DM; `R3`, `S5`, `I5` and `E3` are closed as described above rather than built out further.
7. **Cold-start room names** still show placeholder rows for a few seconds on a cold emulator start; a release wasm
   build or a lower per-room event limit would shorten it, at the cost of unread-count accuracy.
