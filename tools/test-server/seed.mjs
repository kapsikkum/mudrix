#!/usr/bin/env node
/**
 * Fills the test homeserver (up.mjs) with accounts, profiles, cosmetics, rooms, history and the
 * fixtures the parity checks in README.md use. Run once on fresh data; `npm run test-server:reset`
 * starts over.
 *
 *   node tools/test-server/seed.mjs        (or `npm run test-server:seed`)
 *
 * Every account's password is PASSWORD below - an obvious test value, not a secret. Sign in to
 * Mudrix with the homeserver URL from `.generated/env.json` and e.g. `ash` / PASSWORD.
 * Room keys for participants.mjs and the fixtures are written to `.generated/seed.json`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join as joinPath } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const generated = joinPath(here, '.generated');
let env;
try {
  env = JSON.parse(readFileSync(joinPath(generated, 'env.json'), 'utf8'));
} catch {
  console.error('No .generated/env.json. Start the stack first: npm run test-server');
  process.exit(1);
}
// Deliberately obvious: this server is a throwaway that only listens on this machine.
const PASSWORD = 'mudrix-test-password';
const NS = 'io.github.kapsikkum.mudrix';
/** The name earlier Mudrix versions wrote; set too, so an old build of the app shows the same profile. */
const LEGACY_NS = 'chat.mudrix';
/** How many rooms the R10 space fixture gets (a big space must not feel slow to expand). */
const SPACE_ROOMS = Number(process.env.MUDRIX_SEED_SPACE_ROOMS ?? 40);
const HS = env.homeserver;

// ── tiny PNG writer, for generated avatars ──
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** A 256px avatar: a diagonal gradient between two colours with a soft glow in one corner. */
function avatarPng([r1, g1, b1], [r2, g2, b2], seed) {
  const size = 256;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const gx = 60 + ((seed * 53) % 140);
  const gy = 60 + ((seed * 97) % 140);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const t = (x + y) / (2 * size);
      const d = Math.hypot(x - gx, y - gy) / size;
      const glow = Math.max(0, 0.45 - d) * 1.6;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = Math.min(255, r1 + (r2 - r1) * t + 255 * glow * 0.5);
      raw[o + 1] = Math.min(255, g1 + (g2 - g1) * t + 255 * glow * 0.5);
      raw[o + 2] = Math.min(255, b1 + (b2 - b1) * t + 255 * glow * 0.5);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Matrix client-server helpers ──
async function api(token, method, path, body, { raw, contentType } = {}) {
  const res = await fetch(`${HS}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': contentType ?? 'application/json' } : {}),
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(`${method} ${path}: ${res.status} ${text}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function register(username) {
  try {
    const first = await api(null, 'POST', '/_matrix/client/v3/register', {
      username,
      password: PASSWORD,
      inhibit_login: false,
    }).catch((e) => {
      if (e.status === 401) return e.body;
      throw e;
    });
    if (first.access_token) return first;
    return await api(null, 'POST', '/_matrix/client/v3/register', {
      username,
      password: PASSWORD,
      auth: {
        type: 'm.login.registration_token',
        token: env.registrationToken,
        session: first.session,
      },
    });
  } catch (e) {
    if (e.body?.errcode !== 'M_USER_IN_USE') throw e;
    return api(null, 'POST', '/_matrix/client/v3/login', {
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: username },
      password: PASSWORD,
      initial_device_display_name: 'test seed',
    });
  }
}

let txn = 0;
const enc = encodeURIComponent;
const send = (u, roomId, content, type = 'm.room.message') =>
  api(
    u.token,
    'PUT',
    `/_matrix/client/v3/rooms/${enc(roomId)}/send/${type}/seed${Date.now()}${(txn += 1)}`,
    content
  );
const text = (u, roomId, body, html, mentions) =>
  send(u, roomId, {
    msgtype: 'm.text',
    body,
    ...(html ? { format: 'org.matrix.custom.html', formatted_body: html } : {}),
    ...(mentions ? { 'm.mentions': { user_ids: mentions } } : {}),
  });
const join = (u, roomId) => api(u.token, 'POST', `/_matrix/client/v3/join/${enc(roomId)}`, {});
const leave = (u, roomId) =>
  api(u.token, 'POST', `/_matrix/client/v3/rooms/${enc(roomId)}/leave`, {});

/** Moves the account's read receipt and read marker to `eventId`. */
async function readUpTo(u, roomId, eventId) {
  await api(u.token, 'POST', `/_matrix/client/v3/rooms/${enc(roomId)}/read_markers`, {
    'm.fully_read': eventId,
    'm.read': eventId,
  });
}

/**
 * Makes every message in a room notify, through a per-room push rule (an "all messages" room).
 * The N4 fixtures need a notification count that does not come from a mention; a plain message
 * in a public room does not notify on its own. Non-fatal: the run prints the counts it got.
 */
async function notifyEverything(u, roomId, ruleId) {
  await api(u.token, 'PUT', `/_matrix/client/v3/pushrules/global/override/${enc(ruleId)}`, {
    conditions: [{ kind: 'event_match', key: 'room_id', pattern: roomId }],
    actions: ['notify'],
    enabled: true,
  }).catch((e) => console.warn(`  ${u.user}: could not add push rule for ${roomId}: ${e.message}`));
}

async function profilePrefix() {
  const versions = await api(null, 'GET', '/_matrix/client/versions');
  const stable =
    versions.versions?.includes('v1.16') || versions.unstable_features?.['uk.tcpip.msc4133.stable'];
  return stable ? '/_matrix/client/v3' : '/_matrix/client/unstable/uk.tcpip.msc4133';
}

// ── the cast ──
const PEOPLE = [
  {
    user: 'ash',
    name: 'Ash',
    colours: [
      [94, 53, 177],
      [233, 30, 99],
    ],
    decoration: 'crown',
    nameplate: 'aurora',
    status: { emoji: '🎧', text: 'Listening to lo-fi' },
    bio: 'Testing Mudrix so you do not have to.',
    pronouns: 'they/them',
  },
  {
    user: 'juno',
    name: 'Juno',
    colours: [
      [0, 150, 136],
      [3, 169, 244],
    ],
    decoration: 'cat-ears',
    nameplate: 'sunset',
  },
  // No avatar: shows the mud mound placeholder.
  { user: 'theo', name: 'Theo', decoration: 'headphones' },
  {
    user: 'mira',
    name: 'Mira',
    colours: [
      [255, 152, 0],
      [244, 67, 54],
    ],
    decoration: 'halo',
    nameplate: 'ocean-waves',
  },
  {
    user: 'wren',
    name: 'Wren',
    colours: [
      [76, 175, 80],
      [205, 220, 57],
    ],
  },
  {
    user: 'sable',
    name: 'Sable',
    colours: [
      [33, 33, 33],
      [121, 85, 72],
    ],
    decoration: 'flame',
    nameplate: 'starry-night',
  },
];

const users = {};
const sessions = {};
const prefix = await profilePrefix();
for (const [i, p] of PEOPLE.entries()) {
  const login = await register(p.user);
  const u = { ...p, token: login.access_token, id: login.user_id };
  users[p.user] = u;
  sessions[p.user] = {
    user_id: login.user_id,
    access_token: login.access_token,
    device_id: login.device_id,
  };
  await api(u.token, 'PUT', `/_matrix/client/v3/profile/${enc(u.id)}/displayname`, {
    displayname: p.name,
  });
  if (p.colours) {
    const png = avatarPng(p.colours[0], p.colours[1], i + 1);
    const { content_uri: mxc } = await api(
      u.token,
      'POST',
      '/_matrix/media/v3/upload?filename=avatar.png',
      png,
      { raw: true, contentType: 'image/png' }
    );
    await api(u.token, 'PUT', `/_matrix/client/v3/profile/${enc(u.id)}/avatar_url`, {
      avatar_url: mxc,
    });
  }
  // Extended profile (MSC4133). Mudrix's own fields carry the current namespace and the one old
  // builds read; m.biography and m.pronouns are plain spec keys.
  const namespaced = {
    is_user: true,
    ...(p.decoration ? { avatar_decoration: p.decoration } : {}),
    ...(p.nameplate ? { nameplate: p.nameplate } : {}),
    ...(p.status ? { status: p.status } : {}),
  };
  const plain = {
    ...(p.bio ? { 'm.biography': [{ body: p.bio, mimetype: 'text/plain' }] } : {}),
    ...(p.pronouns ? { 'm.pronouns': [{ summary: p.pronouns, language: 'en' }] } : {}),
  };
  for (const [key, value] of Object.entries(namespaced)) {
    for (const ns of [NS, LEGACY_NS]) {
      await api(u.token, 'PUT', `${prefix}/profile/${enc(u.id)}/${enc(`${ns}.${key}`)}`, {
        [`${ns}.${key}`]: value,
      }).catch((e) => console.warn(`  ${p.user}: could not set ${ns}.${key}: ${e.message}`));
    }
  }
  for (const [key, value] of Object.entries(plain)) {
    await api(u.token, 'PUT', `${prefix}/profile/${enc(u.id)}/${enc(key)}`, {
      [key]: value,
    }).catch((e) => console.warn(`  ${p.user}: could not set ${key}: ${e.message}`));
  }
  console.log(`user ${u.id}`);
}

const { ash, juno, theo, mira, wren, sable } = users;
// Written before the rooms so the bots (and tools/parity) can sign in even if a later step fails.
writeFileSync(joinPath(generated, 'sessions.json'), `${JSON.stringify(sessions, null, 2)}\n`);
const marker = await api(
  ash.token,
  'GET',
  `/_matrix/client/v3/user/${enc(ash.id)}/account_data/${NS}.test.seeded`
).catch(() => null);
if (marker?.done) {
  console.log('Rooms were already seeded; run `npm run test-server:reset` to start over.');
  writeFileSync(joinPath(generated, 'sessions.json'), `${JSON.stringify(sessions, null, 2)}\n`);
  process.exit(0);
}

async function dm(a, b) {
  const { room_id: roomId } = await api(a.token, 'POST', '/_matrix/client/v3/createRoom', {
    preset: 'trusted_private_chat',
    is_direct: true,
    invite: [b.id],
  });
  await join(b, roomId);
  for (const [me, other] of [
    [a, b],
    [b, a],
  ]) {
    const current = await api(
      me.token,
      'GET',
      `/_matrix/client/v3/user/${enc(me.id)}/account_data/m.direct`
    ).catch(() => ({}));
    current[other.id] = [...(current[other.id] ?? []), roomId];
    await api(
      me.token,
      'PUT',
      `/_matrix/client/v3/user/${enc(me.id)}/account_data/m.direct`,
      current
    );
  }
  return roomId;
}

async function room(owner, name, members, extra = {}) {
  const { room_id: roomId } = await api(owner.token, 'POST', '/_matrix/client/v3/createRoom', {
    preset: 'public_chat',
    name,
    // Like Element: anyone in the room may join its calls.
    power_level_content_override: {
      events: { 'org.matrix.msc3401.call.member': 0, 'org.matrix.msc3401.call': 0 },
    },
    ...extra,
  });
  for (const m of members) if (m !== owner) await join(m, roomId);
  return roomId;
}

async function spaceChild(owner, spaceId, childId, order) {
  await api(
    owner.token,
    'PUT',
    `/_matrix/client/v3/rooms/${enc(spaceId)}/state/m.space.child/${enc(childId)}`,
    { via: [env.serverName], suggested: true, order: String(order) }
  );
}

// ── DMs and group rooms (README screenshots, calls, rich timeline) ──
const dmJuno = await dm(ash, juno);
await text(juno, dmJuno, 'are we still on for tonight?');
await text(ash, dmJuno, 'yes! bringing snacks 🍿');
const q = await text(juno, dmJuno, 'perfect, I will set up the call');
await send(
  ash,
  dmJuno,
  { 'm.relates_to': { rel_type: 'm.annotation', event_id: q.event_id, key: '💜' } },
  'm.reaction'
);

const dmTheo = await dm(ash, theo);
await text(theo, dmTheo, 'did you see the new sound packs?');
await text(ash, dmTheo, 'the NES one is so good');

const everyone = [juno, theo, mira, wren, sable];
const general = await room(ash, 'general', everyone, { topic: 'Say hi 👋' });
const art = await room(ash, 'art-dump', everyone, { topic: 'Show us what you made' });
const voice = await room(ash, 'Hangout', everyone, {
  creation_content: { type: 'org.matrix.msc3417.call' },
  initial_state: [{ type: 'org.matrix.msc3401.call', state_key: '', content: {} }],
});
const space = await room(ash, 'Mud Club', everyone, {
  creation_content: { type: 'm.space' },
  topic: 'A test space for Mudrix',
});
for (const [i, child] of [general, art, voice].entries()) {
  await spaceChild(ash, space, child, i);
}

const chat = [
  [mira, 'morning everyone ☀️'],
  [wren, 'morning! who is around for a call later?'],
  [sable, 'me, after 6'],
  [juno, 'same. testing the new call layout'],
  [theo, 'my avatar is still a mud blob 😅'],
  [ash, 'it suits you'],
  [
    mira,
    '```js\nconsole.log("hello from Mudrix");\n```',
    '<pre><code class="language-js">console.log("hello from Mudrix");\n</code></pre>',
  ],
  [wren, 'see you in Hangout at 6 then'],
];
let last;
for (const [who, body, html] of chat) last = await text(who, general, body, html);
for (const [who, key] of [
  [ash, '👍'],
  [juno, '👍'],
  [sable, '🎉'],
]) {
  await send(
    who,
    general,
    { 'm.relates_to': { rel_type: 'm.annotation', event_id: last.event_id, key } },
    'm.reaction'
  );
}
await text(sable, art, 'new wallpaper, thoughts?');
await text(mira, art, 'the colours 😍');

// ── R8: what counts as a direct message ──
/** A DM whose other member left: the m.direct entry stays, so it must still read as a DM. */
const dmLeft = await dm(ash, sable);
await text(sable, dmLeft, 'goodnight!');
await leave(sable, dmLeft);
/** A named two-person room that was never a DM: no is_direct, no m.direct entry. */
const pairNamed = await room(ash, 'Two people, not a DM', [juno]);
/** An unnamed two-person room: the old JavaScript client guessed "DM", the core does not. */
const { room_id: pairUnnamed } = await api(ash.token, 'POST', '/_matrix/client/v3/createRoom', {
  preset: 'public_chat',
});
await join(juno, pairUnnamed);

// ── N4: unread and mention counts ──
// Each fixture room starts with a message ash has already read, so the counts below are exactly
// the messages that follow it. "ash" is the viewer in the README scenarios.
const n4 = {};

const unread = await room(ash, 'n4 unread (3 messages)', [juno]);
await notifyEverything(ash, unread, 'mudrix-n4-unread');
let anchor = await text(ash, unread, 'read up to here');
await readUpTo(ash, unread, anchor.event_id);
for (const body of ['one', 'two', 'three']) await text(juno, unread, body);
n4.unread = unread;

const mention = await room(ash, 'n4 mention', [juno, wren]);
await notifyEverything(ash, mention, 'mudrix-n4-mention');
anchor = await text(ash, mention, 'read up to here');
await readUpTo(ash, mention, anchor.event_id);
await text(juno, mention, 'the build is green again');
await text(juno, mention, `${ash.id} can you look at the badge?`, undefined, [ash.id]);
await text(wren, mention, 'and at the spacing?');
n4.mention = mention;

const thread = await room(ash, 'n4 thread', [juno]);
await notifyEverything(ash, thread, 'mudrix-n4-thread');
anchor = await text(ash, thread, 'thread root');
await readUpTo(ash, thread, anchor.event_id);
await send(
  juno,
  thread,
  {
    msgtype: 'm.text',
    body: 'a reply in the thread',
    'm.relates_to': {
      rel_type: 'm.thread',
      event_id: anchor.event_id,
      is_falling_back: true,
      'm.in_reply_to': { event_id: anchor.event_id },
    },
  },
  'm.room.message'
);
await send(
  juno,
  thread,
  {
    msgtype: 'm.text',
    body: `${ash.id} and one that mentions you`,
    'm.mentions': { user_ids: [ash.id] },
    'm.relates_to': {
      rel_type: 'm.thread',
      event_id: anchor.event_id,
      is_falling_back: true,
      'm.in_reply_to': { event_id: anchor.event_id },
    },
  },
  'm.room.message'
);
n4.thread = thread;

/** Membership and call events after the read marker: none of them may count as unread. */
const quiet = await room(ash, 'n4 quiet (join/leave/call only)', [juno]);
await text(juno, quiet, 'nothing to see here');
const quietAnchor = await text(ash, quiet, 'read up to here');
await readUpTo(ash, quiet, quietAnchor.event_id);
await leave(juno, quiet);
await join(juno, quiet);
// The same state key shape the clients use for a call membership (MSC3401, legacy `_` prefix).
const callStateKey = `_${juno.id}_${sessions.juno.device_id}_m.call`;
await api(
  juno.token,
  'PUT',
  `/_matrix/client/v3/rooms/${enc(quiet)}/state/org.matrix.msc3401.call.member/${enc(callStateKey)}`,
  {
    application: 'm.call',
    call_id: '',
    scope: 'm.room',
    device_id: sessions.juno.device_id,
    foci_preferred: [],
    created_ts: Date.now(),
  }
);
await api(
  juno.token,
  'PUT',
  `/_matrix/client/v3/rooms/${enc(quiet)}/state/org.matrix.msc3401.call.member/${enc(callStateKey)}`,
  {}
);
n4.quiet = quiet;

/** Everything read: the "mark unread" half of the scenario starts from a zero badge here. */
const readDemo = await room(ash, 'n4 read (mark unread from here)', [juno]);
await notifyEverything(ash, readDemo, 'mudrix-n4-read');
const readAnchor = await text(juno, readDemo, 'all caught up');
await readUpTo(ash, readDemo, readAnchor.event_id);
n4.read = readDemo;

// ── R10: a space with many rooms, to time the hierarchy load ──
const bigSpace = await room(ash, 'Parity Space', [juno], {
  creation_content: { type: 'm.space' },
  topic: `A space with ${SPACE_ROOMS} rooms, for the space hierarchy check`,
});
const categories = [];
for (const [i, label] of [
  'Parity Category A',
  'Parity Category B',
  'Parity Category C',
].entries()) {
  const category = await room(ash, label, [], { creation_content: { type: 'm.space' } });
  await spaceChild(ash, bigSpace, category, i);
  categories.push(category);
}
console.log(`creating ${SPACE_ROOMS} rooms under Parity Space...`);
for (let i = 0; i < SPACE_ROOMS; i += 1) {
  const name = `parity-room-${String(i + 1).padStart(2, '0')}`;
  const child = await room(ash, name, []);
  await spaceChild(ash, categories[i % categories.length], child, i);
  if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${SPACE_ROOMS}`);
}

await api(
  ash.token,
  'PUT',
  `/_matrix/client/v3/user/${enc(ash.id)}/account_data/${NS}.test.seeded`,
  { done: true }
);

const summary = {
  password: PASSWORD,
  users: Object.fromEntries(Object.values(users).map((u) => [u.user, u.id])),
  rooms: {
    dmJuno,
    dmTheo,
    dmLeft,
    pairNamed,
    pairUnnamed,
    general,
    art,
    voice,
    space,
    unread,
    mention,
    thread,
    quiet,
    readDemo,
    bigSpace,
    ...Object.fromEntries(categories.map((id, i) => [`bigSpaceCategory${i + 1}`, id])),
  },
  fixtures: {
    n4: {
      viewer: ash.id,
      unread: { room: unread, expectedNotifications: 3, expectedMentions: 0 },
      mention: { room: mention, expectedNotifications: 3, expectedMentions: 1 },
      thread: { room: thread, expectedNotifications: 2, expectedMentions: 1 },
      quiet: { room: quiet, expectedNotifications: 0, expectedMentions: 0 },
      read: { room: readDemo, expectedNotifications: 0, expectedMentions: 0 },
    },
    r8: {
      viewer: ash.id,
      dms: [dmJuno, dmTheo, dmLeft],
      notDms: [pairNamed, pairUnnamed, general],
      partnerLeft: dmLeft,
    },
    r10: {
      viewer: ash.id,
      space: bigSpace,
      categories,
      roomCount: SPACE_ROOMS,
    },
  },
};
writeFileSync(joinPath(generated, 'seed.json'), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(joinPath(generated, 'sessions.json'), `${JSON.stringify(sessions, null, 2)}\n`);

// ── what the homeserver thinks the fixtures are, for the README's expected results ──
const sync = await api(ash.token, 'GET', '/_matrix/client/v3/sync?timeout=0');
const joined = sync.rooms?.join ?? {};
const counts = (roomId) => {
  const unreadNotifications = joined[roomId]?.unread_notifications;
  if (!unreadNotifications) return 'not in the sync response (0 unread)';
  return `${unreadNotifications.notification_count ?? 0} notification(s), ${unreadNotifications.highlight_count ?? 0} highlight(s)`;
};
console.log('\nFixture state as ash sees it after seeding (server-side notification counts):');
for (const [name, roomId] of Object.entries({
  unread,
  mention,
  thread,
  quiet,
  read: readDemo,
})) {
  console.log(`  ${name.padEnd(8)} ${counts(roomId)}`);
}
console.log(
  'Note: the app counts mentions itself from the loaded messages (m.mentions), so the server’s\n' +
    'highlight count is not what the mention marker shows.'
);
const direct = sync.account_data?.events?.find((e) => e.type === 'm.direct')?.content ?? {};
console.log(
  `R8: m.direct lists ${Object.keys(direct).length} user(s): ${Object.keys(direct).join(', ')}`
);
console.log(`R10: Parity Space has ${SPACE_ROOMS} rooms in ${categories.length} categories.`);
console.log(
  `\nSeeded. Sign in as ash / ${PASSWORD} with the server ${env.host}:6167\n` +
    `(web: http://localhost:5180/welcome/${env.host}:6167).`
);
