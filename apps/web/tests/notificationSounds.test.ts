import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import {
  DEFAULT_SOUND_PACK,
  SOUND_KINDS,
  SOUND_PACKS,
  getSoundUrl,
  resolveSoundPack,
} from '../src/util/notificationSounds.ts';

const rawDir = new URL('../../../packages/sounds/raw/', import.meta.url);

test('every sound a pack names is in packages/sounds/raw with an Android-safe name', () => {
  for (const pack of SOUND_PACKS) {
    for (const file of Object.values(pack.files)) {
      assert.match(file, /^[a-z0-9_]+\.(wav|mp3|ogg)$/, `${pack.id}: ${file}`);
      assert.ok(existsSync(new URL(file, rawDir)), `${pack.id}: ${file} is missing`);
    }
  }
});

test('the default pack has every sound, and call sounds fall back to it', () => {
  const fallback = SOUND_PACKS.find((p) => p.id === DEFAULT_SOUND_PACK);
  assert.ok(fallback);
  for (const kind of SOUND_KINDS) assert.ok(fallback.files[kind], `default pack lacks ${kind}`);
  assert.equal(getSoundUrl('cinny', 'ring'), getSoundUrl(DEFAULT_SOUND_PACK, 'ring'));
  assert.equal(getSoundUrl('cinny', 'mention'), '/assets/sounds/snd_cinny_mention.ogg');
  assert.equal(getSoundUrl('commet', 'mention'), '/assets/sounds/snd_commet_message.ogg');
  assert.equal(getSoundUrl('element', 'mute'), '/assets/sounds/mute.wav');
});

test('an override picks the pack, off silences, an unknown pack reads as the main one', () => {
  assert.equal(resolveSoundPack('mention', 'bloop', { mention: 'glass' }), 'glass');
  assert.equal(resolveSoundPack('mention', 'bloop', { mention: 'off' }), null);
  assert.equal(resolveSoundPack('mention', 'bloop', { mention: 'gone' }), 'bloop');
  assert.equal(resolveSoundPack('message', 'gone', {}), DEFAULT_SOUND_PACK);
});
