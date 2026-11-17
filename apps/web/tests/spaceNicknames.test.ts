import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  joinedRoomsOfSpace,
  nicknameTargets,
  parseSpaceNicknames,
  targetsKey,
  withSpaceNickname,
} from '../src/util/spaceNicknames.ts';

const node = (spaceId: string, ...children: string[]) =>
  ({ spaceId, children: children.map((roomId) => ({ roomId })), canonicalParent: null }) as never;

// !top -> !a, !sub -> !b ; !sub -> !c
const graph = [node('!top', '!a', '!sub'), node('!sub', '!b', '!c')];
const joined = new Set(['!top', '!sub', '!a', '!b']);

test('account data is read from the current name, then the legacy one', () => {
  assert.deepEqual(parseSpaceNicknames({ '!s': 'Neo' }, { '!s': 'Old' }), { '!s': 'Neo' });
  assert.deepEqual(parseSpaceNicknames(null, { '!s': 'Old' }), { '!s': 'Old' });
  assert.deepEqual(parseSpaceNicknames({ '!s': '  ', '!t': 3 as never, '!u': 'x' }), { '!u': 'x' });
});

test('setting and clearing one space leaves the others alone', () => {
  const base = { '!a': 'A', '!b': 'B' };
  assert.deepEqual(withSpaceNickname(base, '!a', ' Z '), { '!a': 'Z', '!b': 'B' });
  assert.deepEqual(withSpaceNickname(base, '!a', ''), { '!b': 'B' });
  assert.deepEqual(withSpaceNickname(base, '!b', null), { '!a': 'A' });
  assert.deepEqual(base, { '!a': 'A', '!b': 'B' });
});

test('only joined rooms are listed, sub-spaces included', () => {
  assert.deepEqual(joinedRoomsOfSpace(graph, joined, '!top'), ['!top', '!a', '!sub', '!b']);
  assert.deepEqual(joinedRoomsOfSpace(graph, joined, '!sub'), ['!sub', '!b']);
});

test('a nickname reaches every joined room below its space', () => {
  const t = nicknameTargets(graph, joined, { '!top': 'Top' });
  assert.deepEqual([...t.keys()].sort(), ['!a', '!b', '!sub', '!top']);
  assert.ok([...t.values()].every((v) => v === 'Top'));
});

test('a sub-space nickname wins in its own rooms', () => {
  const t = nicknameTargets(graph, joined, { '!top': 'Top', '!sub': 'Sub' });
  assert.equal(t.get('!a'), 'Top');
  assert.equal(t.get('!b'), 'Sub');
  assert.equal(t.get('!sub'), 'Sub');
});

test('a nickname for a space you left is ignored', () => {
  assert.equal(nicknameTargets(graph, joined, { '!gone': 'X' }).size, 0);
});

test('the key changes only when the targets do', () => {
  const a = nicknameTargets(graph, joined, { '!top': 'Top' });
  const b = nicknameTargets(graph, joined, { '!top': 'Top' });
  assert.equal(targetsKey(a), targetsKey(b));
  assert.notEqual(targetsKey(a), targetsKey(nicknameTargets(graph, joined, { '!top': 'Other' })));
});
