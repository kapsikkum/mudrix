import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  MAX_REDIRECTS,
  MAX_RESPONSE_BYTES,
  checkRequestUrl,
  fetchIntegration,
  isForbiddenHost,
  setPassiveFetchBlocker,
  validEtag,
  type IntegrationRequest,
} from '../src/util/integrationFetch.ts';

afterEach(() => setPassiveFetchBlocker(null));

type Call = { url: string; init: RequestInit };

/** A fetch that answers from a script and remembers what it was asked. */
function scripted(answers: Array<Response | (() => Response) | Error>) {
  const calls: Call[] = [];
  const impl = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(typeof next === 'function' ? next() : next);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, type = 'application/json', init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': type, ...(init.headers ?? {}) },
  });

const redirect = (location: string | null, status = 302) =>
  new Response(null, { status, headers: location ? { location } : {} });

const req = (over: Partial<IntegrationRequest> = {}): IntegrationRequest => ({
  url: 'https://api.example.com/v1/things',
  allow: ['api.example.com'],
  expect: 'json',
  ...over,
});

test('only https addresses on an allowed host and the default port are requested', () => {
  const allow = ['api.example.com'];
  assert.equal(checkRequestUrl('https://api.example.com/x', allow).ok, true);
  assert.equal(checkRequestUrl('https://API.Example.com/x', allow).ok, true);
  for (const bad of [
    'http://api.example.com/x',
    'ftp://api.example.com/x',
    'javascript:alert(1)',
    'data:application/json,{}',
    'blob:https://api.example.com/1',
    'wss://api.example.com/x',
    '//api.example.com/x',
    'api.example.com/x',
    'https://user@api.example.com/x',
    'https://user:pw@api.example.com/x',
    'https://api.example.com:8443/x',
    'https://api.example.com:443/x'.replace(':443', ':444'),
    'https://other.example.com/x',
    'https://api.example.com.evil.test/x',
    'https://evil.test/https://api.example.com/x',
    'https://api.example.com./x',
    'https://127.0.0.1/x',
    'https://[::1]/x',
    'https://localhost/x',
    'https://2130706433/x',
  ]) {
    assert.equal(checkRequestUrl(bad, allow).ok, false, bad);
  }
  assert.equal(checkRequestUrl('https://api.example.com/x', []).ok, false);
  assert.equal(checkRequestUrl('x'.repeat(3000), allow).ok, false);
});

test('local and private looking hosts are never allowed, even when listed', () => {
  for (const host of [
    'localhost',
    'nas.local',
    'router.lan',
    'intranet',
    '10.0.0.1',
    '192.168.1.1',
    '169.254.1.1',
    '[::1]',
    '1.2.3.4',
    'a.b.internal',
    '',
  ])
    assert.equal(isForbiddenHost(host), true, host);
  assert.equal(isForbiddenHost('api.example.com'), false);
  assert.equal(checkRequestUrl('https://10.0.0.1/x', ['10.0.0.1']).ok, false);
  assert.equal(checkRequestUrl('https://nas.local/x', ['nas.local']).ok, false);
});

test('a refused address never reaches the network', async () => {
  const { impl, calls } = scripted([json({})]);
  const res = await fetchIntegration(req({ url: 'http://api.example.com/x' }), impl);
  assert.equal(res.ok, false);
  assert.equal(!res.ok && res.reason, 'forbidden');
  const other = await fetchIntegration(req({ url: 'https://evil.example.net/x' }), impl);
  assert.equal(!other.ok && other.reason, 'forbidden');
  assert.equal(calls.length, 0);
});

test('the request carries no cookies, referrer, cache or extra headers', async () => {
  const { impl, calls } = scripted([json({ a: 1 })]);
  const res = await fetchIntegration(req(), impl);
  assert.equal(res.ok, true);
  const init = calls[0].init;
  assert.equal(init.method, 'GET');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.redirect, 'manual');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.body, undefined);
  assert.deepEqual(Object.keys(init.headers as Record<string, string>), ['Accept']);
});

test('a confirmed POST sends exactly its JSON body, and nothing else', async () => {
  const { impl, calls } = scripted([json({ url: 'https://x.example.com/' })]);
  const res = await fetchIntegration(req({ post: true, jsonBody: '{"room":"!r:hs"}' }), impl);
  assert.equal(res.ok, true);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, '{"room":"!r:hs"}');
  assert.deepEqual(Object.keys(calls[0].init.headers as Record<string, string>).sort(), [
    'Accept',
    'Content-Type',
  ]);
  const bare = scripted([json({})]);
  await fetchIntegration(req({ post: true }), bare.impl);
  assert.equal(bare.calls[0].init.method, 'POST');
  assert.equal(bare.calls[0].init.body, undefined);
  assert.deepEqual(Object.keys(bare.calls[0].init.headers as Record<string, string>), ['Accept']);
  const huge = await fetchIntegration(req({ post: true, jsonBody: 'x'.repeat(70_000) }), impl);
  assert.equal(huge.ok, false);
});

test('only a well-formed entity tag is sent, and only on a GET', async () => {
  assert.equal(validEtag('"abc"'), '"abc"');
  assert.equal(validEtag('W/"abc"'), 'W/"abc"');
  assert.equal(validEtag('abc'), undefined);
  assert.equal(validEtag('"a\r\nX: y"'), undefined);
  const get = scripted([json({})]);
  await fetchIntegration(req({ ifNoneMatch: '"v1"' }), get.impl);
  assert.equal((get.calls[0].init.headers as Record<string, string>)['If-None-Match'], '"v1"');
  const bad = scripted([json({})]);
  await fetchIntegration(req({ ifNoneMatch: 'v1\r\nX: y' }), bad.impl);
  assert.equal('If-None-Match' in (bad.calls[0].init.headers as object), false);
  const post = scripted([json({})]);
  await fetchIntegration(req({ post: true, ifNoneMatch: '"v1"' }), post.impl);
  assert.equal('If-None-Match' in (post.calls[0].init.headers as object), false);
});

test('a redirect inside the allow-list is followed, one outside it is refused', async () => {
  const ok = scripted([redirect('/v2/things'), json({ moved: true })]);
  const followed = await fetchIntegration(req(), ok.impl);
  assert.equal(followed.ok, true);
  assert.equal(ok.calls[1].url, 'https://api.example.com/v2/things');
  assert.equal(followed.ok && followed.url, 'https://api.example.com/v2/things');

  const sameAllowed = scripted([redirect('https://cdn.example.com/x'), json({ cdn: true })]);
  const two = await fetchIntegration(
    req({ allow: ['api.example.com', 'cdn.example.com'] }),
    sameAllowed.impl
  );
  assert.equal(two.ok, true);

  const away = scripted([redirect('https://evil.example.net/steal'), json({})]);
  const refused = await fetchIntegration(req(), away.impl);
  assert.equal(refused.ok, false);
  assert.equal(!refused.ok && refused.reason, 'redirect');
  assert.equal(away.calls.length, 1);
});

test('a redirect to http, to another port, with credentials or to an address is refused', async () => {
  for (const target of [
    'http://api.example.com/x',
    'https://api.example.com:8443/x',
    'https://user:pw@api.example.com/x',
    'https://127.0.0.1/x',
    'javascript:alert(1)',
    'data:application/json,{}',
  ]) {
    const s = scripted([redirect(target), json({})]);
    const res = await fetchIntegration(req(), s.impl);
    assert.equal(!res.ok && res.reason, 'redirect', target);
    assert.equal(s.calls.length, 1, target);
  }
});

test('a redirect the browser hides, a missing Location, a POST redirect and a redirect loop are refused', async () => {
  const opaque = {
    type: 'opaqueredirect',
    status: 0,
    ok: false,
    headers: new Headers(),
    body: null,
  } as unknown as Response;
  const hidden = await fetchIntegration(req(), scripted([opaque]).impl);
  assert.equal(!hidden.ok && hidden.reason, 'redirect');
  const noLocation = await fetchIntegration(req(), scripted([redirect(null)]).impl);
  assert.equal(!noLocation.ok && noLocation.reason, 'redirect');
  const post = scripted([redirect('/elsewhere', 307), json({})]);
  const posted = await fetchIntegration(req({ post: true, jsonBody: '{}' }), post.impl);
  assert.equal(!posted.ok && posted.reason, 'redirect');
  assert.equal(post.calls.length, 1);
  const loop = scripted([() => redirect('/again')]);
  const looped = await fetchIntegration(req(), loop.impl);
  assert.equal(!looped.ok && looped.reason, 'redirect');
  assert.equal(loop.calls.length, MAX_REDIRECTS + 1);
});

test('an answer over the cap is refused by its declared length and while streaming', async () => {
  const declared = await fetchIntegration(
    req({ maxBytes: 100 }),
    scripted([json({ a: 'x' }, 'application/json', { headers: { 'content-length': '5000' } })]).impl
  );
  assert.equal(!declared.ok && declared.reason, 'too-large');

  const big = json({ pad: 'x'.repeat(2000) });
  const streamed = await fetchIntegration(req({ maxBytes: 100 }), scripted([big]).impl);
  assert.equal(!streamed.ok && streamed.reason, 'too-large');

  const exact = await fetchIntegration(req({ maxBytes: 100 }), scripted([json({ a: 1 })]).impl);
  assert.equal(exact.ok, true);
});

test('nothing above 1 MB is accepted, whatever the caller asks for', async () => {
  const body = JSON.stringify({ pad: 'x'.repeat(MAX_RESPONSE_BYTES + 10) });
  const res = await fetchIntegration(
    req({ maxBytes: MAX_RESPONSE_BYTES * 10 }),
    scripted([new Response(body, { headers: { 'content-type': 'application/json' } })]).impl
  );
  assert.equal(!res.ok && res.reason, 'too-large');
});

test('the answer must be JSON, unless the caller asked for a repository file or a signature', async () => {
  const ok = await fetchIntegration(req(), scripted([json({ a: 1 })]).impl);
  assert.deepEqual(ok.ok && ok.json, { a: 1 });
  const vendor = await fetchIntegration(
    req(),
    scripted([json({ a: 1 }, 'application/vnd.api+json; charset=utf-8')]).impl
  );
  assert.equal(vendor.ok, true);
  for (const type of ['text/html', 'text/plain', 'application/javascript', 'image/png', '']) {
    const res = await fetchIntegration(req(), scripted([json({ a: 1 }, type)]).impl);
    assert.equal(!res.ok && res.reason, 'type', type || '(none)');
  }
  const file = await fetchIntegration(
    req({ expect: 'jsonFile' }),
    scripted([json({ a: 1 }, 'text/plain; charset=utf-8')]).impl
  );
  assert.deepEqual(file.ok && file.json, { a: 1 });
  const html = await fetchIntegration(
    req({ expect: 'jsonFile' }),
    scripted([json({ a: 1 }, 'text/html')]).impl
  );
  assert.equal(!html.ok && html.reason, 'type');
  const sig = await fetchIntegration(
    req({ expect: 'signature' }),
    scripted([new Response('c2ln', { headers: { 'content-type': 'text/plain' } })]).impl
  );
  assert.equal(sig.ok && sig.text, 'c2ln');
  const sigJson = await fetchIntegration(
    req({ expect: 'signature' }),
    scripted([json({ a: 1 })]).impl
  );
  assert.equal(!sigJson.ok && sigJson.reason, 'type');
});

test('a JSON answer that does not parse, or is not UTF-8, is refused', async () => {
  const broken = await fetchIntegration(
    req(),
    scripted([new Response('{"a":', { headers: { 'content-type': 'application/json' } })]).impl
  );
  assert.equal(!broken.ok && broken.reason, 'invalid');
  const html = await fetchIntegration(
    req(),
    scripted([
      new Response('<script>alert(1)</script>', {
        headers: { 'content-type': 'application/json' },
      }),
    ]).impl
  );
  assert.equal(!html.ok && html.reason, 'invalid');
  const latin1 = await fetchIntegration(
    req(),
    scripted([
      new Response(new Uint8Array([0x7b, 0x22, 0xe9, 0x22, 0x3a, 0x31, 0x7d]), {
        headers: { 'content-type': 'application/json' },
      }),
    ]).impl
  );
  assert.equal(!latin1.ok && latin1.reason, 'invalid');
});

test('an HTTP error reports its status and a 304 is passed on', async () => {
  const missing = await fetchIntegration(
    req(),
    scripted([new Response('nope', { status: 404 })]).impl
  );
  assert.equal(!missing.ok && missing.status, 404);
  assert.match(!missing.ok ? missing.error : '', /api\.example\.com answered 404/);
  const same = await fetchIntegration(
    req({ ifNoneMatch: '"v1"' }),
    scripted([new Response(null, { status: 304 })]).impl
  );
  assert.equal(!same.ok && same.status, 304);
});

test('a request that never answers times out; a network error says so', async () => {
  const hang = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      if (init?.signal?.aborted) reject(new Error('aborted'));
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as typeof fetch;
  const slow = await fetchIntegration(req({ timeoutMs: 20 }), hang);
  assert.equal(!slow.ok && slow.reason, 'timeout');
  const down = await fetchIntegration(req(), scripted([new TypeError('Failed to fetch')]).impl);
  assert.equal(!down.ok && down.network, true);
  assert.equal(!down.ok && down.reason, 'network');
  const caller = new AbortController();
  caller.abort();
  const stopped = await fetchIntegration(req({ signal: caller.signal }), hang);
  assert.equal(stopped.ok, false);
});

test('requests nobody asked for are refused while the blocker is on, asked ones are not', async () => {
  const { impl, calls } = scripted([() => json({ a: 1 })]);
  setPassiveFetchBlocker(() => true);
  const blocked = await fetchIntegration(req({ passive: true }), impl);
  assert.equal(!blocked.ok && blocked.reason, 'blocked');
  assert.equal(calls.length, 0);
  const asked = await fetchIntegration(req(), impl);
  assert.equal(asked.ok, true);
  setPassiveFetchBlocker(() => {
    throw new Error('boom');
  });
  const unsure = await fetchIntegration(req({ passive: true }), impl);
  assert.equal(!unsure.ok && unsure.reason, 'blocked');
  setPassiveFetchBlocker(() => false);
  const open = await fetchIntegration(req({ passive: true }), impl);
  assert.equal(open.ok, true);
});
