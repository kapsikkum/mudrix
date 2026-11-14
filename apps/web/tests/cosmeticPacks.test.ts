import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COSMETIC_KINDS,
  cosmeticKindOf,
  cosmeticValueOf,
  isPackCosmetic,
  isSubscribed,
  mergeSubscriptions,
  packItemsOfKind,
  parseCosmeticPack,
  parseCosmeticPacks,
  resolveCosmetic,
  subscribedRefs,
  subscriptionRooms,
  withSubscription,
  type CosmeticPackItem,
} from '../src/util/cosmeticPacks.ts';

const mxc = (id: string) => `mxc://example.org/${id}`;

const nameplatePack = () => ({
  pack: { display_name: 'Plates', usage: ['nameplate'] },
  images: {
    sunset: { url: mxc('sunset'), body: 'Sunset', info: { palette: 'berry' } },
    aurora: { url: mxc('aurora') },
  },
});

test('an emoji pack has no cosmetic items', () => {
  const pack = parseCosmeticPack('!r:example.org', 'p', [
    {
      pack: { display_name: 'Emoji', usage: ['emoticon', 'sticker'] },
      images: { a: { url: mxc('a') } },
    },
  ]);
  assert.equal(pack, null);
});

test('items take their usage from the image, else from the pack', () => {
  const pack = parseCosmeticPack('!r:example.org', 'p', [
    {
      pack: { display_name: 'Mixed', usage: ['nameplate'] },
      images: {
        plate: { url: mxc('plate') },
        deco: { url: mxc('deco'), usage: ['avatar_decoration'], body: 'Halo' },
        emote: { url: mxc('emote'), usage: ['emoticon'] },
      },
    },
  ]);
  assert.ok(pack);
  assert.equal(pack.displayName, 'Mixed');
  const kinds = pack.items.map((i) => `${i.shortcode}:${i.kind}`).sort();
  assert.deepEqual(kinds, ['deco:decoration', 'plate:nameplate']);
  assert.deepEqual(
    packItemsOfKind(pack, 'decoration').map((i) => i.name),
    ['Halo']
  );
});

test('nameplate palettes and frame pieces are kept, unknown positions dropped', () => {
  const pack = parseCosmeticPack(null, 'p', [
    {
      pack: { display_name: 'Frames', usage: ['profile_frame'] },
      images: {
        frame: {
          url: mxc('frame'),
          info: {
            pieces: [
              { pos: 'top', url: mxc('top'), layer: 'back' },
              { pos: 'side', url: mxc('side') },
              { pos: 'bottom', url: 'https://example.org/x.png' },
            ],
          },
        },
      },
    },
  ]);
  assert.ok(pack);
  const [frame] = pack.items;
  assert.equal(frame.kind, 'profile_frame');
  assert.deepEqual(frame.pieces, [{ pos: 'top', url: mxc('top'), layer: 'back' }]);
});

test('only mxc images become items', () => {
  const pack = parseCosmeticPack(null, 'p', [
    {
      pack: { display_name: 'Bad', usage: ['nameplate'] },
      images: { remote: { url: 'https://example.org/a.png' }, local: { url: mxc('local') } },
    },
  ]);
  assert.ok(pack);
  assert.deepEqual(
    pack.items.map((i) => i.shortcode),
    ['local']
  );
});

test('packs are parsed per state key and empty ones skipped', () => {
  const packs = parseCosmeticPacks(
    '!r:example.org',
    new Map<string, Record<string, unknown>[]>([
      ['plate', [nameplatePack() as Record<string, unknown>]],
      ['empty', [{ pack: { usage: ['nameplate'] }, images: {} }]],
    ])
  );
  assert.equal(packs.length, 1);
  assert.equal(packs[0].roomId, '!r:example.org');
  assert.equal(packs[0].items.length, 2);
});

test('pack usages map onto the four kinds', () => {
  assert.equal(cosmeticKindOf(['avatar_decoration']), 'decoration');
  assert.equal(cosmeticKindOf(['avatar_frame']), 'decoration');
  assert.equal(cosmeticKindOf(['profile_effect']), 'effect');
  assert.equal(cosmeticKindOf(['nameplate']), 'nameplate');
  assert.equal(cosmeticKindOf(['profile_frame']), 'profile_frame');
  assert.equal(cosmeticKindOf(['emoticon', 'sticker']), null);
  assert.deepEqual(COSMETIC_KINDS, ['decoration', 'effect', 'nameplate', 'profile_frame']);
});

test('the stored value of an item matches what the profile parsers read', () => {
  const item = (patch: Partial<CosmeticPackItem>): CosmeticPackItem => ({
    shortcode: 'x',
    name: 'X',
    url: mxc('x'),
    kind: 'decoration',
    ...patch,
  });
  assert.equal(cosmeticValueOf(item({})), mxc('x'));
  assert.deepEqual(cosmeticValueOf(item({ kind: 'nameplate', palette: 'berry' })), {
    url: mxc('x'),
    palette: 'berry',
  });
  assert.equal(cosmeticValueOf(item({ kind: 'nameplate' })), mxc('x'));
  const pieces = [{ pos: 'top', url: mxc('top') }];
  assert.deepEqual(cosmeticValueOf(item({ kind: 'profile_frame', pieces })), {
    url: mxc('x'),
    pieces,
  });
});

test('pack cosmetics are recognised in every stored shape', () => {
  assert.equal(isPackCosmetic(mxc('a')), true);
  assert.equal(isPackCosmetic({ url: mxc('a'), palette: 'sky' }), true);
  assert.equal(isPackCosmetic({ url: '', pieces: [{ pos: 'top', url: mxc('a') }] }), true);
  assert.equal(isPackCosmetic('crown'), false);
  assert.equal(isPackCosmetic({ url: '', pieces: [] }), false);
  assert.equal(isPackCosmetic(null), false);
});

test('built-in cosmetics stay drawn with packs off, pack items do not', () => {
  const plate = { url: mxc('plate'), palette: 'berry' };
  assert.equal(resolveCosmetic('crown', false), 'crown');
  assert.equal(resolveCosmetic('claude-terminal', false), 'claude-terminal');
  assert.equal(resolveCosmetic(mxc('deco'), false), null);
  assert.equal(resolveCosmetic(plate, false), null);
  assert.equal(resolveCosmetic({ url: '', pieces: [{ pos: 'top', url: mxc('a') }] }, false), null);
  assert.equal(resolveCosmetic(null, false), null);
  assert.equal(resolveCosmetic(mxc('deco'), true), mxc('deco'));
  assert.deepEqual(resolveCosmetic(plate, true), plate);
  assert.equal(resolveCosmetic('crown', true), 'crown');
});

test('subscriptions merge the stable and unstable account data', () => {
  const merged = mergeSubscriptions(
    { rooms: { '!a:example.org': { one: {} } } },
    { rooms: { '!a:example.org': { two: {} }, '!b:example.org': { three: {} } } }
  );
  assert.deepEqual(merged, {
    '!a:example.org': { one: {}, two: {} },
    '!b:example.org': { three: {} },
  });
  assert.deepEqual(mergeSubscriptions(null, undefined), {});
});

test('one pack can be subscribed and unsubscribed', () => {
  let rooms = withSubscription({}, '!a:example.org', 'pack', true);
  assert.equal(isSubscribed(rooms, '!a:example.org', 'pack'), true);
  rooms = withSubscription(rooms, '!a:example.org', 'pack', false);
  assert.equal(isSubscribed(rooms, '!a:example.org', 'pack'), false);
  assert.deepEqual(rooms, {});
});

test('saving keeps packs of rooms this client cannot read', () => {
  const existing = {
    '!gone:example.org': { pack: {} },
    '!here:example.org': { old: {}, keep: {} },
  };
  const rooms = subscriptionRooms(
    existing,
    [{ roomId: '!here:example.org', stateKey: 'new' }],
    (roomId) => roomId === '!gone:example.org'
  );
  assert.deepEqual(rooms, {
    '!gone:example.org': { pack: {} },
    '!here:example.org': { new: {} },
  });
  assert.equal(subscriptionRooms({}, [], () => true)['!gone:example.org'], undefined);
});

test('every subscribed pack can be listed back', () => {
  const refs = subscribedRefs({
    '!a:example.org': { one: {}, two: {} },
    '!b:example.org': { three: {} },
  });
  assert.deepEqual(refs.map((r) => `${r.roomId}/${r.stateKey}`).sort(), [
    '!a:example.org/one',
    '!a:example.org/two',
    '!b:example.org/three',
  ]);
});
