import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roleColorOf, type RoleColors } from '../src/app/features/space/roleColors.ts';

const roles = (over: Partial<RoleColors> = {}): RoleColors => ({
  builtin: {},
  byUser: new Map(),
  ...over,
});

test('with no roles set up nobody gets a colour', () => {
  assert.equal(roleColorOf(roles(), '@alice:x', '0'), undefined);
});

test('the member look colours everyone without a higher role colour', () => {
  const palette = roles({ builtin: { '0': { color: '#111111' } } });
  assert.equal(roleColorOf(palette, '@alice:x', '0'), '#111111');
});

test('the admin look colours admins and outranks their own roles', () => {
  const palette = roles({
    builtin: { '100': { color: '#aa0000' }, '0': { color: '#111111' } },
    byUser: new Map([['@alice:x', [{ color: '#00aa00' }]]]),
  });
  assert.equal(roleColorOf(palette, '@alice:x', '100'), '#aa0000');
});

test('founders fall back to the admin look when they have no founder look', () => {
  const palette = roles({ builtin: { '100': { color: '#aa0000' } } });
  assert.equal(roleColorOf(palette, '@alice:x', 'founder'), '#aa0000');
});

test('the founder look wins over the admin look when both are set', () => {
  const palette = roles({
    builtin: { founder: { color: '#ff8800' }, '100': { color: '#aa0000' } },
  });
  assert.equal(roleColorOf(palette, '@alice:x', 'founder'), '#ff8800');
});

test('the first own role with a colour is the one shown', () => {
  const palette = roles({
    byUser: new Map([
      ['@alice:x', [{ color: undefined }, { color: '#00aa00' }, { color: '#0000aa' }]],
    ]),
  });
  assert.equal(roleColorOf(palette, '@alice:x', '0'), '#00aa00');
});

test('someone else’s roles never colour another name', () => {
  const palette = roles({ byUser: new Map([['@bob:x', [{ color: '#00aa00' }]]]) });
  assert.equal(roleColorOf(palette, '@alice:x', '0'), undefined);
});
