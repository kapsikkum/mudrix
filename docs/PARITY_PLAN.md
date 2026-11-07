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

Recommendation: B for web and desktop (they share the UI), and token-level A for Android and iOS (native, so
"identical" means same colours, radii, spacing, type, icons and motion, not the same code).

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

## Phase 5: Android and iOS look parity

- Same tokens, same type scale and icons, same motion. Compare with the old Tauri mobile app screenshots
  (phone widths) rather than the web.
- Android: run on the emulator for the first time (nothing has ever run on a device), then screenshot tour and
  compare. Fix what the emulator shows before polishing.
- iOS: first needs a macOS build (GitHub macOS runner or a Mac). Until then every iOS row stays "written, not
  compiled". Expect a first round of compile fixes before any visual work.
- Measure performance, since mobile speed was the original complaint: scroll jank in the timeline and room
  list, cold start, memory. Compare with the old Tauri mobile app.

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

1. Option A or B in the key decision above?
2. Is "identical" acceptable on Android and iOS at the token level, or does it mean the same layouts too?
3. Which screens matter most, so phase 3 starts there?
4. Which artwork should be used for the macOS and iOS icons, the Android launcher and the in-app logos?
5. A private or public GitHub repo, so CI (the WizardChat-string gate, macOS compile, release builds) can run?
