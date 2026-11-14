import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_CUSTOM_EVENT_CONTENT,
  MAX_WIDGET_EVENTS,
  checkEventType,
  isDeclaredEventType,
  validateCustomEventContent,
} from '../src/app/features/integrations/customEvents.ts';
import {
  WIDGET_ALLOW,
  WIDGET_SANDBOX,
  assertViewerUrlAllowed,
  assertWidgetUrlAllowed,
  buildWidgetUrl,
  customEventCapabilities,
  hostOf,
  resolveCapabilities,
  widgetSandbox,
} from '../src/app/features/integrations/widget.ts';
import {
  WIDGET_CAPABILITY_CATALOGUE,
  WIDGET_CAPABILITY_IDS,
  WIDGET_PARAMETERS,
} from '../src/app/features/integrations/widgetCapabilities.ts';

const APP = 'https://chat.example.com';

test('a declared event type is reverse-DNS, lowercase and not Matrix-reserved', () => {
  assert.equal(checkEventType('com.example.fileshare.sent'), null);
  assert.equal(checkEventType('app.example.x-1.y_2'), null);
  for (const bad of [
    '',
    'com.example',
    'Com.Example.App',
    '.com.example.app',
    'a..b.c',
    'com.example.app.',
    'com.-example.app',
    'com.example.a b',
    'com.example.*',
    'm.foo.bar',
    'org.matrix.x.y',
    'im.vector.a.b',
    'io.element.a.b',
    `com.example.${'a'.repeat(69)}`,
  ])
    assert.notEqual(checkEventType(bad), null, bad);
  assert.notEqual(checkEventType(42), null);
});

test('only exactly declared event types count as declared', () => {
  const declared = ['com.example.fileshare.sent', 'm.foo.bar'];
  assert.ok(isDeclaredEventType('com.example.fileshare.sent', declared));
  assert.ok(!isDeclaredEventType('com.example.fileshare.other', declared));
  assert.ok(!isDeclaredEventType('m.foo.bar', declared));
});

test('custom event content is a small plain object without relations or mentions', () => {
  assert.equal(validateCustomEventContent({ a: 1 }), null);
  assert.notEqual(validateCustomEventContent([]), null);
  assert.notEqual(validateCustomEventContent('x'), null);
  assert.notEqual(validateCustomEventContent(null), null);
  assert.notEqual(validateCustomEventContent({ 'm.relates_to': {} }), null);
  assert.notEqual(validateCustomEventContent({ 'm.mentions': {} }), null);
  assert.notEqual(validateCustomEventContent({ a: 'x'.repeat(MAX_CUSTOM_EVENT_CONTENT) }), null);
});

test('the capability catalogue names the Widget API strings itself', () => {
  assert.equal(WIDGET_CAPABILITY_IDS.length, WIDGET_CAPABILITY_CATALOGUE.length);
  const send = WIDGET_CAPABILITY_CATALOGUE.find((c) => c.id === 'send.message')!;
  assert.ok(send.capabilities.includes('org.matrix.msc2762.send.event:m.room.message'));
  assert.equal(send.risk, 'high');
  assert.ok(WIDGET_CAPABILITY_CATALOGUE.find((c) => c.id === 'read.room')!.risk === 'low');
  assert.deepEqual([...WIDGET_PARAMETERS], ['room_id', 'user_id', 'display_name']);
});

test('only approved capabilities survive, and the timeline is one room only', () => {
  const send = WIDGET_CAPABILITY_CATALOGUE.find((c) => c.id === 'send.message')!.capabilities[0];
  const asked = [send, 'org.matrix.msc3819.send.to_device:m.x', 'm.sticker'];
  assert.deepEqual([...resolveCapabilities(asked, ['send.message'])], [send]);
  assert.equal(resolveCapabilities(asked, []).size, 0);
  assert.equal(resolveCapabilities(asked, ['nonsense']).size, 0);

  const tl = 'org.matrix.msc2762.timeline:!r:x.org';
  assert.equal(resolveCapabilities([tl], ['send.message']).size, 0);
  assert.ok(resolveCapabilities([tl], ['send.message'], '!r:x.org').has(tl));
  assert.equal(resolveCapabilities([tl], ['read.room'], '!r:x.org').size, 0);
});

test('a declared custom event type also grants the timeline for that room', () => {
  const type = 'com.example.fileshare.sent';
  const [send, receive] = customEventCapabilities(type);
  const tl = 'org.matrix.msc2762.timeline:!r:x.org';
  const got = resolveCapabilities([send, receive, tl], [], '!r:x.org', [type]);
  assert.ok(got.has(send) && got.has(receive));
  assert.ok(got.has(tl));

  // A malformed stored type never becomes a capability.
  const bad = customEventCapabilities('m.foo.bar');
  assert.equal(resolveCapabilities([...bad, tl], [], '!r:x.org', ['m.foo.bar']).size, 0);
});

test('widget addresses are https, credential-free and never the app itself', () => {
  assert.equal(assertWidgetUrlAllowed('https://app.example.com/w', APP).ok, true);
  assert.equal(assertWidgetUrlAllowed(`${APP}/w`, APP).ok, false);
  assert.equal(assertWidgetUrlAllowed(APP, APP).ok, false);
  assert.equal(assertWidgetUrlAllowed('http://app.example.com/w', APP).ok, false);
  assert.equal(assertWidgetUrlAllowed('https://u:p@app.example.com/w', APP).ok, false);
  assert.equal(assertWidgetUrlAllowed('not a url', APP).ok, false);
});

test('a card link opens only on exactly the approved origin', () => {
  const wUrl = 'https://app.example.com/';
  const ok = (link: string) => assertViewerUrlAllowed(wUrl, link, APP).ok;
  assert.ok(ok(`https://app.example.com/r#${'a'.repeat(64)}`));
  assert.ok(ok('https://app.example.com/s?x=1'));
  assert.ok(!ok('https://other.example.com/r#abc'));
  assert.ok(!ok('https://app.example.com.evil.example/r#abc'));
  assert.ok(!ok('https://app.example.com:8443/r#abc'));
  assert.ok(!ok('http://app.example.com/r#abc'));
  assert.ok(!ok('https://user:pw@app.example.com/r#abc'));
  assert.ok(!ok('https://app.example.com/a b'));
  assert.ok(!ok(`https://app.example.com/${'a'.repeat(1000)}`));
  assert.ok(!assertViewerUrlAllowed(`${APP}/`, `${APP}/x`, APP).ok);
});

test('the widget URL carries theme and language, and only the declared details', () => {
  const ctx = {
    roomId: '!r:x.org',
    userId: '@a b:x.org',
    displayName: 'Ünï & "co" ?x=1',
    theme: 'dark' as const,
    lang: 'en-GB',
  };
  const bare = new URL(buildWidgetUrl({ url: 'https://app.example.com/mudrix' }, ctx));
  assert.equal(bare.pathname, '/mudrix');
  assert.deepEqual([...bare.searchParams.keys()], ['theme', 'lang']);

  const some = new URL(
    buildWidgetUrl({ url: 'https://app.example.com/w', parameters: ['room_id'] }, ctx)
  );
  assert.equal(some.searchParams.get('room_id'), '!r:x.org');
  assert.equal(some.searchParams.has('user_id'), false);

  const all = new URL(
    buildWidgetUrl(
      {
        url: 'https://app.example.com/w?mode=a',
        parameters: ['room_id', 'user_id', 'display_name'],
      },
      ctx
    )
  );
  assert.equal(all.searchParams.get('display_name'), ctx.displayName);
  assert.equal(all.searchParams.get('user_id'), ctx.userId);
  assert.equal(all.searchParams.get('mode'), 'a');
  assert.equal(all.hash, '');
  assert.equal(all.host, 'app.example.com');
});

test('the sandbox only adds downloads for an approved widget', () => {
  assert.equal(WIDGET_ALLOW, '');
  assert.equal(widgetSandbox(), WIDGET_SANDBOX);
  assert.ok(!WIDGET_SANDBOX.includes('allow-top-navigation'));
  assert.ok(!WIDGET_SANDBOX.includes('allow-downloads'));
  assert.equal(widgetSandbox(true), `${WIDGET_SANDBOX} allow-downloads`);
});

test('hosts are read for display only', () => {
  assert.equal(hostOf('https://app.example.com/x'), 'app.example.com');
  assert.equal(hostOf('https://app.example.com:8443/x'), 'app.example.com:8443');
  assert.equal(hostOf('https://app.example.com/x', { hostnameOnly: true }), 'app.example.com');
  assert.equal(hostOf('nope'), '');
  assert.equal(hostOf('nope', { fallback: '?' }), '?');
  assert.equal(MAX_WIDGET_EVENTS, 3);
});
