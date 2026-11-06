# Emoji fonts

Mudrix renders emoji with a colour font placed in the font stack (the `--mudrix-emoji-font`
CSS variable, see `src/util/emojiStyle.ts`). Only the font of the selected "Emoji style" is
requested by the browser. Full licence texts sit next to each font file.

## Twemoji (default) - `twemoji/Twemoji.17.0.2.woff2`

- What: Twemoji rendered as a COLR/CPAL colour font ("Twemoji Mozilla"), the same file Element
  Web bundles by default (`apps/web/res/fonts/Twemoji_Mozilla/TwemojiMozilla-colr.woff2`, Twemoji
  17.0.2 artwork, so it covers every emoji up to Unicode Emoji 17). It is built from
  https://github.com/matrix-org/twemoji-colr, a fork of https://github.com/mozilla/twemoji-colr.
  The font's internal name table still says "Version 0.4.0".
- Why not the npm `twemoji-colr-font` 15.0.3 / mozilla v0.7.0 build: it stops at Emoji 15.0 and
  draws newer sequences (head shaking, etc.) as broken pieces.
- Artwork: Twemoji, Copyright Twitter, Inc and other contributors
  (https://github.com/jdecked/twemoji), licensed under CC-BY 4.0
  (https://creativecommons.org/licenses/by/4.0/). Attribution is required: this file is that
  attribution.
- Font build tooling: Copyright 2016-2018 Mozilla Foundation, Apache License 2.0
  (http://www.apache.org/licenses/LICENSE-2.0). Both licences are in `twemoji/LICENSE.md`
  (copied from the matrix-org/twemoji-colr repository).

## Noto Color Emoji - `noto/NotoColorEmoji.2.057.woff2`

- Source: npm package `@fontsource/noto-color-emoji` 5.3.2 (the full COLRv1 + OpenType-SVG file,
  not the per-script subsets, which only carry the SVG table and render blank in Chrome).
- Copyright 2021 Google Inc. All Rights Reserved. SIL Open Font License 1.1 (`noto/LICENSE.txt`).
- Note: about 5.5 MB; downloaded only when this style is selected.

## OpenMoji - `openmoji/OpenMoji-color.18.0.woff2`

- Source: https://github.com/hfg-gmuend/openmoji (`font/OpenMoji-color-glyf_colr_0`, v17).
- Copyright HfG Schwaebisch Gmuend. Artwork and font licensed under CC BY-SA 4.0
  (https://creativecommons.org/licenses/by-sa/4.0/, `openmoji/LICENSE.txt`). CC BY-SA 4.0 is
  one-way compatible with GPLv3/AGPLv3 and the font is shipped as a separate, unmodified asset;
  the share-alike condition applies to the font, not to Mudrix code.

## Not included

- Fluent Emoji (MIT): only distributed as SVG/PNG per emoji, no maintained colour font. Would
  need an image-based `<Emoji>` renderer, so it is skipped.
- Apple, Segoe UI Emoji, Google Blobmoji, JoyPixels, EmojiOne: proprietary, discontinued or
  non-free licences.
- "System emoji" uses whatever the OS provides and ships nothing.
