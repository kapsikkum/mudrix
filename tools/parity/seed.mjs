#!/usr/bin/env node
/**
 * Parity test seed script.
 * Ensures the local test homeserver has:
 * - text message
 * - reply
 * - reaction
 * - image
 * - video
 * - file
 * - thread
 * - voice room
 * - space with categories
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = 'E:/code/web/mudrix-web/dev/test-server/.generated/env.json';
const seedPath = 'E:/code/web/mudrix-web/dev/test-server/.generated/seed.json';

const env = JSON.parse(readFileSync(envPath, 'utf8'));
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
const HS = env.homeserver;
const PASSWORD = seed.password;

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
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path}: ${res.status} ${text}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function login(user) {
  const res = await api(null, 'POST', '/_matrix/client/v3/login', {
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user },
    password: PASSWORD,
  });
  return { user, id: res.user_id, token: res.access_token };
}

let txn = 0;
const enc = encodeURIComponent;
const send = (u, roomId, content, type = 'm.room.message') =>
  api(
    u.token,
    'PUT',
    `/_matrix/client/v3/rooms/${enc(roomId)}/send/${type}/parity_${Date.now()}_${(txn += 1)}`,
    content
  );

// Minimal valid 1x1 PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// Minimal valid MP4 (ftyp + moov)
const TINY_MP4 = Buffer.from(
  '0000001c6674797069736f6d0000020069736f6d69736f32617663316d7034310000000866726565000000086d646174',
  'hex'
);

const SAMPLE_TXT = Buffer.from(
  'Hello from Mudrix Parity Test Suite!\nThis is a sample text file.',
  'utf8'
);

async function upload(u, filename, data, contentType) {
  const res = await api(
    u.token,
    'POST',
    `/_matrix/media/v3/upload?filename=${enc(filename)}`,
    data,
    { raw: true, contentType }
  );
  return res.content_uri;
}

export async function runSeed() {
  console.log('Logging in seed users...');
  const ash = await login('ash');
  const juno = await login('juno');
  const general = seed.rooms.general;
  const art = seed.rooms.art;
  const voice = seed.rooms.voice;
  const space = seed.rooms.space;

  console.log('Seeding space categories...');
  // Create or find Text Channels category sub-space
  let catTextId;
  let catVoiceId;

  const spaceState = await api(ash.token, 'GET', `/_matrix/client/v3/rooms/${enc(space)}/state`);
  const existingCategories = spaceState
    .filter((e) => e.type === 'm.space.child')
    .map((e) => e.state_key);

  // Check if categories already created
  for (const childId of existingCategories) {
    try {
      const roomNameEvent = await api(
        ash.token,
        'GET',
        `/_matrix/client/v3/rooms/${enc(childId)}/state/m.room.name`
      );
      if (roomNameEvent.name === 'Text Channels') catTextId = childId;
      if (roomNameEvent.name === 'Voice Channels') catVoiceId = childId;
    } catch {
      // not found or not space
    }
  }

  if (!catTextId) {
    const res = await api(ash.token, 'POST', '/_matrix/client/v3/createRoom', {
      preset: 'public_chat',
      name: 'Text Channels',
      creation_content: { type: 'm.space' },
    });
    catTextId = res.room_id;
    await api(juno.token, 'POST', `/_matrix/client/v3/join/${enc(catTextId)}`, {});
    // Add as child to space
    await api(
      ash.token,
      'PUT',
      `/_matrix/client/v3/rooms/${enc(space)}/state/m.space.child/${enc(catTextId)}`,
      {
        via: [env.serverName],
        suggested: true,
        order: '0',
      }
    );
    // Add general and art to catTextId
    for (const [idx, child] of [general, art].entries()) {
      await api(
        ash.token,
        'PUT',
        `/_matrix/client/v3/rooms/${enc(catTextId)}/state/m.space.child/${enc(child)}`,
        {
          via: [env.serverName],
          suggested: true,
          order: String(idx),
        }
      );
    }
  }

  if (!catVoiceId) {
    const res = await api(ash.token, 'POST', '/_matrix/client/v3/createRoom', {
      preset: 'public_chat',
      name: 'Voice Channels',
      creation_content: { type: 'm.space' },
    });
    catVoiceId = res.room_id;
    await api(juno.token, 'POST', `/_matrix/client/v3/join/${enc(catVoiceId)}`, {});
    // Add as child to space
    await api(
      ash.token,
      'PUT',
      `/_matrix/client/v3/rooms/${enc(space)}/state/m.space.child/${enc(catVoiceId)}`,
      {
        via: [env.serverName],
        suggested: true,
        order: '1',
      }
    );
    // Add voice to catVoiceId
    await api(
      ash.token,
      'PUT',
      `/_matrix/client/v3/rooms/${enc(catVoiceId)}/state/m.space.child/${enc(voice)}`,
      {
        via: [env.serverName],
        suggested: true,
        order: '0',
      }
    );
  }

  console.log('Seeding rich timeline events into general...');
  // 1. Text message
  const rootMsg = await send(ash, general, {
    msgtype: 'm.text',
    body: 'Parity testing message: welcome to Mudrix test room! 🚀',
  });

  // 2. Reply
  const replyMsg = await send(juno, general, {
    msgtype: 'm.text',
    body: 'Replying to your parity test message!',
    'm.relates_to': {
      'm.in_reply_to': {
        event_id: rootMsg.event_id,
      },
    },
  });

  // 3. Reaction
  await send(
    ash,
    general,
    {
      'm.relates_to': {
        rel_type: 'm.annotation',
        event_id: replyMsg.event_id,
        key: '🔥',
      },
    },
    'm.reaction'
  );

  // 4. Image
  console.log('Uploading sample image...');
  const imageMxc = await upload(ash, 'sample_image.png', TINY_PNG, 'image/png');
  const imageMsg = await send(ash, general, {
    msgtype: 'm.image',
    body: 'sample_image.png',
    url: imageMxc,
    info: {
      mimetype: 'image/png',
      w: 128,
      h: 128,
      size: TINY_PNG.length,
    },
  });

  // 5. Video
  console.log('Uploading sample video...');
  const videoMxc = await upload(ash, 'sample_video.mp4', TINY_MP4, 'video/mp4');
  await send(juno, general, {
    msgtype: 'm.video',
    body: 'sample_video.mp4',
    url: videoMxc,
    info: {
      mimetype: 'video/mp4',
      size: TINY_MP4.length,
    },
  });

  // 6. File
  console.log('Uploading sample file...');
  const fileMxc = await upload(ash, 'notes.txt', SAMPLE_TXT, 'text/plain');
  await send(ash, general, {
    msgtype: 'm.file',
    body: 'notes.txt',
    url: fileMxc,
    info: {
      mimetype: 'text/plain',
      size: SAMPLE_TXT.length,
    },
  });

  // 7. Thread
  console.log('Sending threaded messages...');
  await send(juno, general, {
    msgtype: 'm.text',
    body: 'First message in the thread!',
    'm.relates_to': {
      rel_type: 'm.thread',
      event_id: rootMsg.event_id,
      is_falling_back: true,
      'm.in_reply_to': {
        event_id: rootMsg.event_id,
      },
    },
  });

  await send(ash, general, {
    msgtype: 'm.text',
    body: 'Second message in the thread answering Juno.',
    'm.relates_to': {
      rel_type: 'm.thread',
      event_id: rootMsg.event_id,
      is_falling_back: false,
    },
  });

  console.log('Seeding complete!');
  const fullSeed = {
    ...seed,
    categories: {
      catText: catTextId,
      catVoice: catVoiceId,
    },
    sampleEvents: {
      rootMsg: rootMsg.event_id,
      replyMsg: replyMsg.event_id,
      imageMsg: imageMsg.event_id,
    },
  };
  writeFileSync(join(here, 'seed-data.json'), JSON.stringify(fullSeed, null, 2));
  return fullSeed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeed().catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}
