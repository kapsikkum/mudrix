import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_LOG,
  MudrixRoomState,
  logEntry,
  putEntry,
  type StateEntry,
} from '../src/app/features/space/mudrixStateEntries.ts';
import { mayChangeSpace } from '../src/app/features/space/rolesTrust.ts';

const NS = 'io.github.kapsikkum.mudrix';
const entry = (over: Partial<StateEntry> = {}): StateEntry => ({
  type: `${NS}.space_roles`,
  stateKey: '',
  content: { roles: [] },
  sender: '@a:x',
  ts: 1,
  eventId: '$1',
  ...over,
});

test('the current name wins, the legacy name fills in, and the sender is kept', () => {
  const state = new MudrixRoomState([
    entry({ type: 'chat.mudrix.space_roles', sender: '@old:x', content: { v: 'old' } }),
    entry({ sender: '@new:x', content: { v: 'new' } }),
  ]);
  assert.equal(state.get(`${NS}.space_roles`)?.v, 'new');
  assert.equal(state.entry(`${NS}.space_roles`)?.sender, '@new:x');
  const legacyOnly = new MudrixRoomState([
    entry({ type: 'chat.mudrix.space_roles', sender: '@old:x' }),
  ]);
  assert.equal(legacyOnly.entry(`${NS}.space_roles`)?.sender, '@old:x');
  assert.equal(legacyOnly.get(`${NS}.nothing`), undefined);
});

test('a state key set under both names counts once', () => {
  const type = `${NS}.space_member_roles`;
  const state = new MudrixRoomState([
    entry({ type, stateKey: 'b:x', content: { n: 1 } }),
    entry({ type: 'chat.mudrix.space_member_roles', stateKey: 'b:x', content: { n: 2 } }),
    entry({ type: 'chat.mudrix.space_member_roles', stateKey: 'c:x', content: { n: 3 } }),
  ]);
  assert.deepEqual(
    state.all(type).map(([key, c]) => [key, c.n]),
    [
      ['b:x', 1],
      ['c:x', 3],
    ]
  );
});

test('a live event replaces what is there; a device read only fills gaps', () => {
  const map = new Map<string, StateEntry>();
  assert.equal(putEntry(map, entry({ content: { v: 1 } }), true), true);
  assert.equal(putEntry(map, entry({ content: { v: 2 }, eventId: '$2' }), true), false);
  assert.equal(putEntry(map, entry({ content: { v: 2 }, eventId: '$2' })), true);
  assert.equal(putEntry(map, entry({ content: { v: 2 }, eventId: '$2' })), false);
  assert.equal(
    [...map.values()][0].content && ([...map.values()][0].content as { v: number }).v,
    2
  );
});

test('the history keeps each event once, oldest first, and stays bounded', () => {
  const log: StateEntry[] = [];
  assert.equal(logEntry(log, entry({ eventId: '$b', ts: 20 })), true);
  assert.equal(logEntry(log, entry({ eventId: '$a', ts: 10 })), true);
  assert.equal(logEntry(log, entry({ eventId: '$a', ts: 10 })), false);
  assert.equal(logEntry(log, entry({ eventId: null })), false);
  assert.deepEqual(
    log.map((e) => e.eventId),
    ['$a', '$b']
  );
  for (let i = 0; i < MAX_LOG + 20; i += 1)
    logEntry(log, entry({ eventId: `$x${i}`, ts: 100 + i }));
  assert.equal(log.length, MAX_LOG);
  assert.equal(log[log.length - 1].eventId, `$x${MAX_LOG + 19}`);
});

const levels = (over: Record<string, unknown> = {}) => ({
  users: { '@admin:x': 100, '@mod:x': 50, '@low:x': 10 },
  users_default: 0,
  state_default: 50,
  ...over,
});
const type = `${NS}.space_roles`;

test('only senders who could change the space count', () => {
  assert.equal(mayChangeSpace(levels(), [], '@admin:x', type), true);
  assert.equal(mayChangeSpace(levels(), [], '@mod:x', type), true);
  assert.equal(mayChangeSpace(levels(), [], '@low:x', type), false);
  assert.equal(mayChangeSpace(levels(), [], '@nobody:x', type), false);
  assert.equal(mayChangeSpace(levels(), [], undefined, type), false);
});

test('a room that lets anyone set state does not make a role from anyone count', () => {
  const open = levels({ state_default: 0, events: { [type]: 0 } });
  assert.equal(mayChangeSpace(open, [], '@low:x', type), false);
  assert.equal(mayChangeSpace(open, [], '@mod:x', type), true);
});

test('a higher requirement for the event type is respected', () => {
  const strict = levels({ events: { [type]: 100 } });
  assert.equal(mayChangeSpace(strict, [], '@mod:x', type), false);
  assert.equal(mayChangeSpace(strict, [], '@admin:x', type), true);
});

test('creators always count; without power levels nobody else does', () => {
  assert.equal(mayChangeSpace(undefined, new Set(['@c:x']), '@c:x', type), true);
  assert.equal(mayChangeSpace(undefined, ['@c:x'], '@c:x', type), true);
  assert.equal(mayChangeSpace(undefined, [], '@mod:x', type), false);
});
