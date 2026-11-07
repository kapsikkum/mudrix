# Parity plan: make the new Mudrix look and behave like the old one

Goal: every screen, card, dialog, sound, string and gesture matches the old TypeScript Mudrix
(`E:\code\web\mudrix-web`, plus `mudrix-desktop` and `mudrix-mobile`), with no WizardChat leftovers.
This is a plan only. Nothing here has been started. Related lists: `docs/MISSING.md` (features not ported),
`docs/BRANDING.md` (artwork still to replace), `docs/PORT.md` (per-row status).

## Why it doesn't match yet

1. The port copied features, not looks. Each batch re-implemented a feature inside the new base's own
   components, so cards, buttons, modals, spacing and animation come from WizardChat's design system.
2. Several rows are marked partial (phone message layout reuses the base renderers, profile cosmetics,
   Home, soundboard, spaces) and some artwork is still WizardChat's.
3. No screen has ever been compared side by side. Everything so far is compile-checked, not looked at.

## Key decision (needs the user before phase 2)

How far to take "looks how it used to":

| Option                   | What it means                                                                                                       | Cost                  | Risk                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| A. Restyle the base      | Keep the base's components, change tokens and CSS until they look like the old ones                                 | Medium                | Never exactly identical; every upstream merge fights it                                |
| B. Bring the old UI over | Copy the old `src/app/components` and feature CSS (vanilla-extract) into `apps/web`, keep only the Rust core wiring | Large, but mechanical | Closest result; upstream UI merges become impractical (acceptable, upstream is frozen) |

Recommendation: B for web and desktop (they share the UI). Android and iOS keep their native layouts (decided
after seeing the Android app); there "parity" means Mudrix's features, colours, type, icons, cosmetics and sounds
inside the native layouts, not the old layouts (see phase 5).

## Phase 0: reference capture (cheap, scripted, do first)

- Run the old app (`npm start` in `mudrix-web`, port 8080) and the new one (`npm run dev`, port 5180) against a
  throwaway test account on a test server. Never use a real account and never send real messages.
- Script a screenshot tour (one Playwright or Chrome-automation script, not an LLM clicking around) of every
  screen at 3 widths (desktop 1440, tablet 820, phone 390) in 3 themes (Carbon, one light, one custom).
- Store old and new images side by side with an automated pixel-diff report (a small node script using
  `pixelmatch`). The report ranks screens by difference, which tells us where to spend effort.
- Output: `docs/parity/` report with the worst screens first. This is the work list for phases 2 to 4.

## Phase 1: WizardChat leftover sweep (cheap, mostly grep)

Already done: visible strings in docs, app names, window titles, ids and URLs (see `docs/BRANDING.md`).
Still to do:

- Artwork: macOS and iOS layered icons, Android launcher foreground, Compose and SwiftUI logos, web
  `LogoLoader` and `LogoHover`, theme logo colours, favicon and manifest icons, notification icons, splash.
- Runtime check, not just grep: the browser tab title, About screen, "What's new" text, error messages,
  empty states, onboarding copy, notification text and channel names, share sheet names, deep-link scheme
  handlers, update feed, user-agent and device display name (`WizardChat web` as a device name shows up in
  other clients' session lists).
- Sounds: the `wizardchat` sound pack and the default pack. Old Mudrix defaulted to its own pack
  ("Bloop"); check the default and the pack order match.
- Compatibility names that stay on purpose (`org.wizardchat.*` account data, OIDC callback scheme) get a
  one-line comment in code so nobody "fixes" them later.
- Native: Android `namespace`, iOS target names stay internal, but app label, bundle display name, widgets,
  share extension and permission prompts must say Mudrix.
- Gate: a CI grep that fails on user-visible `wizard` strings outside an allow-list.

## Phase 1b: full rename, we are a hard fork (do this before any other work: it touches ~700 files)

Decision (user): Mudrix is a hard fork and takes upstream changes by cherry-picking, so internal names are renamed
too, not just visible text. This replaces the "Internal names left as-is" note in `docs/CONTRIBUTING.md`.

What gets renamed (scripted codemod, not hand edits; one commit per layer so each can be reverted):

| Layer              | Examples                                                                                                                                                                                                         | How                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Rust               | crates `wizardchat-core`, `-core-wasm`, `-core-ffi`, `-desktop`; lib names (`wizardchat_core_ffi`, `wizardchat_core`), `WizardClient` and other `Wizard*` types, Cargo.lock, `rust-toolchain`/workspace metadata | `git mv` crate dirs only if they carry the name; rewrite `Cargo.toml` names and `use` paths; regenerate `Cargo.lock`      |
| UniFFI and typegen | generated Swift/Kotlin/TS API files, the `.so`/`.a` names the apps load                                                                                                                                          | rename in the source declarations, then `npm run core:types` and rebuild the bindings; do not hand-edit generated files   |
| npm                | `@wizardchat/web`, `@wizardchat/desktop`, workspace scripts, `package-lock.json`                                                                                                                                 | rename, then `npm install` to rewrite the lock file                                                                       |
| Android            | Kotlin package `org.wizardchat.*` (namespace, every file's `package` line and directory), `WizardApplication`, JNI/library names, resource names                                                                 | move directories to `chat/mudrix/...`, rewrite package lines and imports; `applicationId` is already `chat.mudrix.mobile` |
| iOS                | target names `WizardChat*`, `WizardChatCore`, `WizardChatShare`, `WizardChatWidgets`, `WZ_*` build settings, bundle id prefixes, `Signing.xcconfig`, app group, Swift type prefixes                              | rename directories and `project.yml`, rewrite sources; `WZ_TEAM` becomes the user's own team id                           |
| Web                | CSS/vanilla-extract class prefixes, storage keys, event names, localStorage/IndexedDB names, service-worker cache names, `window.*` bridge names, file names                                                     | rename; **keep reading the old storage keys once** so an existing local session migrates instead of logging out           |
| Desktop            | Tauri crate, bundle names, installer names, `wizardchat-desktop.exe` becomes `mudrix.exe`, deep-link scheme, updater endpoint                                                                                    | rename; deep-link scheme stays `mudrix`                                                                                   |
| Packaging and CI   | `packaging/` (AUR), `.gitlab-ci.yml`, `.gitlab/`                                                                                                                                                                 | delete what we will not use; GitHub Actions replace it later                                                              |
| Docs               | the "Internal names" note in `docs/CONTRIBUTING.md`, the grep gate allow-list                                                                                                                                    | update                                                                                                                    |

What must NOT be blindly renamed (compatibility with data that already exists):

- `org.wizardchat.*` account-data and state keys: Mudrix now writes `io.github.kapsikkum.mudrix.*`, but keep
  READING `org.wizardchat.*` (legacy read path in `util/namespace.ts` and the Android and iOS equivalents), so
  data written by the base or by accounts that used WizardChat clients still loads. Renaming the read path
  would drop that data.
- `*.wizardchat.org` hosts used at runtime (for example the YouTube player host): either point at a Mudrix-hosted
  copy or keep until one exists; do not leave a dependency on someone else's domain unnoticed. List every
  remaining one in `docs/BRANDING.md`.
- The AGPL-3.0 licence text and the one-paragraph "based on WizardChat" attribution in `README.md`, plus upstream
  copyright lines in file headers where they exist. These are legal requirements, not branding.
- Persisted data names on installed apps: an installed old Mudrix keeps its own ids; the new app's storage
  names changing is fine because it is a new install, but web users of the new build must not lose a session.

Cherry-picking afterwards: keep the `upstream` remote and add `scripts/upstream-pick` that applies the inverse
rename to an upstream diff (`mudrix` to `wizardchat` for the touched layers) before `git apply --3way`, so
upstream fixes can still be pulled in without hand-translating every name.

Verification (heavy, do once at the end of the rename, one build at a time): `cargo fmt`, clippy for wasm and
workspace, `cargo test -p <core>`, `npm run core:types`, `npm run core:web:dev`, web `tsc`, ESLint, `npm run i18n`,
unit tests, `vite build`; Android `compile.sh`, unit tests, `assembleDebug` (and an emulator launch, since the
JNI library name changes and a mismatch only shows at launch, as the x86_64 crash did); desktop `tauri build
--debug --no-bundle`; iOS cannot be compiled here, so the rename is checked by grep and rechecked on the Mac.
Final gate: `git grep -il wizard` returns only the allow-listed files above.

Order: Rust and UniFFI first (everything depends on it), then npm and web, then desktop, then Android, then iOS,
then packaging and docs. Commit after each layer, build after each of the first three.

## Phase 2: design system parity (web and desktop)

Order matters, each step shrinks the diff for the next:

1. Tokens: colours (all 29 themes against the old ones), radii, spacing scale, shadows and elevation, the
   named font-size scale and z-index scale from the old repo, font stacks (including the Mudrix Twemoji
   font), icon set and weights, motion durations and easing.
2. Primitives: button, icon button, select, input, toggle, slider, tooltip, popover, context menu, modal,
   bottom sheet, toast, avatar, badge, skeleton, chip. Replace the base's versions with the old ones (option B).
3. Layout shell: server rail, room list panel, header, side panels, resizers, tab bar, safe areas.
4. Cards: profile card, user popup, link and integration cards, YouTube card, file and media cards, gallery,
   call tiles, invite cards, space cards, "What's new".
5. Messages: bubble, modern and compact layouts, reactions, replies, threads, edits, receipts, timestamps,
   day dividers, unread divider, composer and attachment tray.

## Phase 3: screen-by-screen pass (web and desktop), driven by the phase 0 report

Auth and server step; Home; room list (classic and modern per space); timeline; composer; profile and
cosmetics (decorations, nameplates, frames, effects, banner crop, expanded profile); Settings (every page and
its order: Account, Appearance, Notifications, Privacy, Media, Voice and Audio, Integrations, Keybinds,
Activity, Developer, About); inbox; explore; search; room settings and space settings (roles, channels,
categories, audit log); calls (stage, tiles, soundboard, stats, watch together, pop-out, screen-share bar);
dialogs and empty or error states.
For each: fix until the pixel diff is under an agreed threshold, then tick it in the report.

## Phase 4: behaviour discrepancies

Take the P1 and P2 rows from `docs/MISSING.md` that change daily use, plus behaviour differences found in
phase 3 (animations, gesture feel, focus and keyboard behaviour, scroll anchoring, unread and receipt logic).
Known partials to finish: phone message layout (use the old CSS, not the base renderers), profile effects and
cosmetic packs, Home setup steps and friends' activity, soundboard editing and room boards, voice-move UI,
audit log role changes, tagged gallery sends, GIF favourites from received messages, text/PDF preview
completeness, spellcheck, developer tools. Core-call work (`watchRoomEvents` follow-ups, `fetchPublic`,
`addRequiredState`, `stateEventsWithSender`) goes in as needed.

## Phase 5: Android and iOS (the new native layout stays, Mudrix's features and looks come in)

Decision (user, after seeing the Android app on the emulator): the native Android layout is better than the old
Tauri mobile app's. Keep the native layouts and navigation on Android and iOS. "Parity" on mobile therefore means
bringing Mudrix's features, theme colours, cosmetics, sounds, cards and copy into the native layouts, not
redrawing the layouts like the old app. The old app is only a reference for features and for colours, type and icons.

- Android, already running on the emulator (as `chat.mudrix.mobile.test`; the old Mudrix apps sit beside it for
  comparison). First fixes from the first screenshot: WizardChat logo and tagline still on the login screen
  ("Simple, Secure, Magical"; the old Mudrix tagline is "Simple, Secure, Muddy"), and "Couldn't reach this
  server" shown for matrix.org although the emulator has network. Then a screenshot tour of every screen, a
  feature-by-feature check against `docs/MISSING.md` (the Android column), and the partial rows. Each mirrored
  feature gets looked at for the first time here, since so far Android code is only compile-checked.
- iOS, using the user's 2015 MacBook (OpenCore Legacy Patcher, newest macOS an Intel Mac can run):
  - Check first: macOS version, Xcode version it can run, RAM, free disk. The project targets iOS 18.0
    (`apps/ios/project.yml`), so it needs an Xcode with the iOS 18 SDK or newer, which needs a recent macOS; an
    unsupported-Mac macOS may not be enough, so verify before planning around it. The Rust core build for iOS
    is heavy (tens of GB of build cache, slow on a 2015 machine); build the simulator and device libraries
    one target at a time.
  - Get the repo onto the Mac without GitHub if needed: `git bundle` over USB or the local network, or a
    private GitHub repo once decided.
  - Install on the Mac: Xcode (and command line tools), Rust via rustup with the iOS targets, Node 22+,
    `xcodegen`, then `npm install`, `npm run ios`.
  - First pass is a compile-fix round: every iOS file is "written, not compiled". Fix errors in the order in
    the riskiest-files lists in `docs/PORT.md`, run the XCTests, run on the simulator, then a screenshot tour.
  - A real iPhone needs an Apple ID (free signing expires after 7 days); the old SideStore route (the
    unsigned IPA) stays available for installing.
  - Fallback if the old Mac cannot run a new enough Xcode: a GitHub macOS runner (needs the repo).
- Measure performance, since mobile speed was the original complaint: scroll jank in the timeline and room
  list, cold start, memory. Compare with the old Tauri mobile app on the same emulator.

## Phase 6: desktop shell parity

Tray, toasts (sender avatar), badge, themed app icon, pop-out call window, screen-share bar, accent colour,
activity detection, manual update check and pre-release switch, window state, deep links. Then a signed
release build and an upgrade test from the old installed app (same app id `chat.mudrix.desktop`).

## Verification and sign-off

- The pixel-diff report is the source of truth for looks; the user signs off screens they care about.
- Every phase ends with `tsc`, ESLint, `npm run i18n`, unit tests, and a fresh screenshot tour.
- Android: emulator run. iOS: macOS CI compile plus a device run. Desktop: launch and click-through.
- Translations: the 9 machine-translated languages need a human or a second-pass review before release.

## Cost control (usage is low)

- Phase 0 and the grep parts of phase 1 are cheap and scripted; do them first and let the report decide scope.
- Use one agent at a time at medium effort. Use Haiku for grep sweeps and mechanical renames.
- Do not let agents "look around" in a browser; run the screenshot script and give them only the worst diffs.
- Do web and desktop (phases 2 and 3) before native, because they share the UI and show the most.
- Estimated size (rough, relative): phase 0 small, phase 1 small, phase 2 large, phase 3 large, phase 4
  medium, phase 5 large (needs a Mac for iOS), phase 6 small to medium.

## Open questions for the user

1. Option A or B in the key decision above? (Applies to web and desktop only.)
2. Answered: Android and iOS keep their native layouts; Mudrix's features and looks are ported into them.
3. Which screens matter most, so phase 3 starts there?
   4a. For iOS: what macOS and Xcode version does the MacBook run, how much RAM and free disk?
4. Which artwork should be used for the macOS and iOS icons, the Android launcher and the in-app logos?
5. A private or public GitHub repo, so CI (the WizardChat-string gate, macOS compile, release builds) can run?
