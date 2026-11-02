// Builds dist/emoji.json from emojibase: every emoji with its group, shortcodes and per-language
// names and keywords, in display order, for the iOS and Android pickers (the web reads emojibase-data
// directly).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGUAGES = ['en', 'de'];
const SKIN_COMPONENT_GROUP = 2;

const data = Object.fromEntries(
  LANGUAGES.map((lang) => [lang, require(`emojibase-data/${lang}/data.json`)])
);
const messages = Object.fromEntries(
  LANGUAGES.map((lang) => [lang, require(`emojibase-data/${lang}/messages.json`)])
);
const shortcodes = require('emojibase-data/en/shortcodes/emojibase.json');

const byHex = (list) => new Map(list.map((e) => [e.hexcode, e]));
const localized = Object.fromEntries(LANGUAGES.map((lang) => [lang, byHex(data[lang])]));

const groups = messages.en.groups
  .filter((g) => g.order !== SKIN_COMPONENT_GROUP)
  .map((g) => ({
    id: g.order,
    key: g.key,
    name: Object.fromEntries(
      LANGUAGES.map((lang) => [
        lang,
        messages[lang].groups.find((x) => x.order === g.order)?.message ?? g.message,
      ])
    ),
  }));

const emoji = data.en
  .filter((e) => e.group !== undefined && e.group !== SKIN_COMPONENT_GROUP)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map((e) => {
    const codes = shortcodes[e.hexcode];
    return {
      e: e.emoji,
      g: e.group,
      s: codes ? (Array.isArray(codes) ? codes : [codes]) : [],
      n: Object.fromEntries(
        LANGUAGES.map((lang) => [lang, localized[lang].get(e.hexcode)?.label ?? e.label])
      ),
      k: Object.fromEntries(
        LANGUAGES.map((lang) => [lang, localized[lang].get(e.hexcode)?.tags ?? []])
      ),
    };
  });

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(
  join(root, 'dist', 'emoji.json'),
  JSON.stringify({ languages: LANGUAGES, groups, emoji })
);
const size = readFileSync(join(root, 'dist', 'emoji.json')).length;
console.log(
  `emoji: ${emoji.length} emoji in ${groups.length} groups, ${LANGUAGES.join(', ')} (${Math.round(size / 1024)} kB)`
);
