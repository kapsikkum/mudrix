# Branding and artwork

## Licence situation

Mudrix is a fork of [WizardChat](https://gitlab.com/wizardchat/wizardchat) (AGPL-3.0, see [LICENSE](../LICENSE)).
Upstream licenses its logo and app icons separately: **CC BY-SA 4.0, (c) WizardChat**, and asks forks to use their own
name and logo. The code licence does not cover the WizardChat name or artwork.

The Mudrix logo (the brown mud mound) is original Mudrix artwork from the earlier Mudrix repositories
(`mudrix-web`, `mudrix-desktop`, `mudrix-mobile`) and is not derived from the WizardChat hat. Any WizardChat artwork
that is still in this repository is listed below and has to be replaced; until then it stays under CC BY-SA 4.0 with
attribution to WizardChat.

Other asset credits are unchanged: see `packages/sounds/LICENSES.md`, `apps/web/public/assets/homeservers/LICENSES.md`
and the emoji and icon package notices.

## Already replaced with Mudrix artwork

| Path                                                                                                           | What                                                                                                      | Source                            |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `apps/web/public/assets/images/logo*.svg`, `logo-notification*.svg`, `logo-outline.svg` (19 files)             | web logo, favicon, per-theme and notification variants                                                    | `mudrix-web/public/assets/images` |
| `apps/desktop/src-tauri/icons/128x128.png`, `128x128@2x.png`, `32x32.png`, `icon.png`, `icon.ico`, `icon.icns` | desktop app icon                                                                                          | `mudrix-desktop/src-tauri/icons`  |
| `apps/desktop/src-tauri/icons/tray/*.png`                                                                      | tray icons                                                                                                | already the Mudrix ones           |
| `apps/web/src/app/components/Avatar/WizardMark.tsx`, `apps/web/src/theme/mudMoundGeometry.ts`                  | logo drawn inline as the avatar placeholder and read-receipt mark (the component keeps its upstream name) | `mudrix-web/src`                  |

## Branding assets still to replace

| Path                                                                                                                                | What it is                                                       | Replacement source                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/src-tauri/icons/icon.icon/` and `Assets.car`                                                                          | macOS layered (Liquid Glass) app icon, WizardChat hat            | no Mudrix equivalent existed. Rebuild `icon.icon` from the Mudrix logo in Icon Composer on macOS, then recompile `Assets.car`                                                     |
| `apps/ios/WizardChat/Resources/AppIcon.icon/Assets/logo.png`, `AppIcon-Parrot.icon/...`, `AppIcon-Hallow.icon/...`                  | iOS app icon layers (400x400), WizardChat hat                    | `mudrix-mobile/app-icon.png` (1024x1024 flat) and `mudrix-mobile/src-tauri/icons/ios/` are flat icons, the old shell had no layered `.icon`; render `logo.svg` to a 400x400 layer |
| `apps/android/app/src/main/res/drawable/ic_launcher_foreground.xml` (and the launcher background colour)                            | Android adaptive icon foreground, WizardChat hat as a vector     | `mudrix-mobile/src-tauri/icons/android/mipmap-*` are PNG mipmaps; convert `logo.svg` into a vector drawable inside the adaptive icon safe zone                                    |
| `apps/web/src/app/components/AppLoading/LogoLoader.tsx`, `LogoHover.tsx` (+ `.css.ts`)                                              | animated loading logo and the About hover logo, six hat polygons | `mudrix-web/src/app/components/AppLoading` (they use `mudMoundGeometry.ts` and the per-theme logo tone tokens)                                                                    |
| `packages/design-tokens/src/themes/*.json` (the `logo` colours of each theme) and `apps/web/src/theme/vars.css.ts`                  | per-theme logo colours (purple)                                  | `mudrix-web/src/theme/themeTokens.ts` (`BASE_LOGO`, per-theme `logo`)                                                                                                             |
| `apps/android/app/src/main/kotlin/org/wizardchat/android/ui/Components.kt` (`WizardMark`, `WizardLogo`)                             | in-app logo drawn in Compose                                     | redraw from `mudMoundGeometry.ts`                                                                                                                                                 |
| `apps/ios/WizardChat/Views/Components.swift` (`WizardLogo`, `WizardMark`), `apps/ios/Shared/CallActivity.swift` (`WizardLogoShape`) | in-app logo drawn in SwiftUI                                     | redraw from `mudMoundGeometry.ts`                                                                                                                                                 |

The WizardChat notification sound pack (`wizardchat` in `packages/sounds`) is a sound, not a logo; its credit stays.
