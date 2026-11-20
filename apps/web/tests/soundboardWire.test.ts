import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SOUNDBOARD_EMOJI_KEY,
  SOUNDBOARD_TOPIC,
  legacyPlayFromPayload,
  legacySoundboardPayload,
  parseSoundboardPlay,
  soundboardEmoji,
  soundboardPayload,
} from '../src/call/soundboard.ts';

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

test('the standard press carries the url, shortcode and emoji under the standard key', () => {
  assert.equal(SOUNDBOARD_TOPIC, 'moe.crafty.soundboard');
  assert.equal(SOUNDBOARD_EMOJI_KEY, 'org.wizardchat.emoji');
  assert.deepEqual(soundboardPayload('mxc://example.org/abc', 'airhorn', '📯'), {
    url: 'mxc://example.org/abc',
    shortcode: 'airhorn',
    'org.wizardchat.emoji': '📯',
  });
  assert.deepEqual(soundboardPayload('mxc://example.org/abc', 'airhorn', ''), {
    url: 'mxc://example.org/abc',
    shortcode: 'airhorn',
  });
});

test('a standard press is parsed and malformed or unsafe presses are refused', () => {
  const play = parseSoundboardPlay(
    encode({ url: 'mxc://example.org/abc', shortcode: 'airhorn', 'org.wizardchat.emoji': '📯' })
  );
  assert.deepEqual(play, { url: 'mxc://example.org/abc', shortcode: 'airhorn', emoji: '📯' });

  assert.equal(parseSoundboardPlay(encode({ url: 'https://example.org/abc' })), null);
  assert.equal(parseSoundboardPlay(encode({ shortcode: 'airhorn' })), null);
  assert.equal(parseSoundboardPlay(encode(null)), null);
  assert.equal(parseSoundboardPlay(new TextEncoder().encode('not json')), null);
  assert.equal(
    parseSoundboardPlay(encode({ url: `mxc://example.org/${'a'.repeat(1024)}` })),
    null,
    'an oversized packet is dropped'
  );

  const longShortcode = parseSoundboardPlay(
    encode({ url: 'mxc://example.org/abc', shortcode: 'x'.repeat(101) })
  );
  assert.equal(longShortcode?.shortcode, undefined);
  const longEmoji = parseSoundboardPlay(
    encode({ url: 'mxc://example.org/abc', 'org.wizardchat.emoji': 'a'.repeat(33) })
  );
  assert.equal(longEmoji?.emoji, undefined);
});

test('the old press is a { sound } object with the fields 26.12.4 clients read', () => {
  const payload = legacySoundboardPayload({
    url: 'mxc://example.org/abc',
    shortcode: 'airhorn',
    name: 'Air Horn',
    emoji: '📯',
    mimetype: 'audio/mpeg',
    durationMs: 1610,
  });
  assert.deepEqual(payload, {
    sound: {
      id: 'airhorn',
      name: 'Air Horn',
      volume: 1,
      emoji: '📯',
      url: 'mxc://example.org/abc',
      mimetype: 'audio/mpeg',
      durationMs: 1610,
    },
  });

  const parsed = legacyPlayFromPayload(payload);
  assert.equal(parsed?.url, 'mxc://example.org/abc');
  assert.equal(parsed?.shortcode, 'airhorn');
  assert.equal(parsed?.durationMs, 1610);

  assert.equal(legacyPlayFromPayload({ sound: { id: 'x' } })?.url, undefined);
  assert.equal(legacyPlayFromPayload(null), null);
});

test('an emoji falls back to the built-in table and then to a speaker', () => {
  assert.equal(soundboardEmoji('airhorn'), '📯');
  assert.equal(soundboardEmoji('airhorn', '🎺'), '🎺');
  assert.equal(soundboardEmoji('unknown'), '🔊');
  assert.equal(soundboardEmoji(undefined), '🔊');
});
