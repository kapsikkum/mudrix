/**
 * Fixtures for the pure rules around updates, link matching and link details.
 * `runBehaviourExamples()` returns the names of the cases that failed (an empty list means all
 * passed); the test file next to it runs them.
 */
import type { Integration, IntegrationSetting } from '../src/app/features/integrations/manifest.ts';
import { previewApiRequest } from '../src/app/features/integrations/api.ts';
import {
  lookupShowsAnything,
  renderTemplate,
  resolveSettings,
  settingsWidened,
} from '../src/app/features/integrations/settings.ts';
import {
  buildLookupUrl,
  extractDetails,
  formatValue,
} from '../src/app/features/integrations/details.ts';
import {
  fillCaptures,
  findLinkLookup,
  matchLinkCard,
  getApiActions,
  getCommands,
  getComposerActions,
  matchPathPattern,
  renderInsert,
} from '../src/app/features/integrations/matching.ts';
import { reconcile } from '../src/app/features/integrations/store.ts';
import type { GrantMap, InstalledIntegration } from '../src/app/features/integrations/types.ts';

const card = (hosts: string[], pathPrefix?: string) => ({
  hosts,
  title: 'Card',
  ...(pathPrefix ? { pathPrefix } : {}),
});

const offered = (version: string, permissions: Integration['permissions']): Integration => ({
  id: 'one',
  name: 'One',
  description: 'Test integration',
  version,
  permissions,
});

const installed = (
  version: string,
  permissions: InstalledIntegration['permissions'],
  extra: Partial<InstalledIntegration> = {}
): InstalledIntegration => ({
  id: 'one',
  repoUrl: 'https://repo.example.com/repo.json',
  name: 'One',
  description: 'Test integration',
  version,
  permissions,
  enabled: true,
  approvedAt: 0,
  publisherFingerprint: 'aaaa',
  ...extra,
});

const grants: GrantMap = { one: { linkCards: true } };

export function runBehaviourExamples(): string[] {
  const failures: string[] = [];
  const check = (name: string, ok: boolean) => {
    if (!ok) failures.push(name);
  };
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  // Narrowing never needs a newer version string.
  const wide = installed('1.0.0', {
    linkCards: [card(['a.example.com']), card(['b.example.com'])],
  });
  const narrowSameVersion = reconcile(
    wide,
    offered('1.0.0', { linkCards: [card(['a.example.com'])] })
  );
  check(
    'narrower update, same version, is taken',
    narrowSameVersion.permissions.linkCards?.length === 1
  );
  const narrowLowerVersion = reconcile(
    wide,
    offered('0.9.0', { linkCards: [card(['a.example.com'])] })
  );
  check(
    'narrower update, lower version, is taken',
    narrowLowerVersion.permissions.linkCards?.length === 1
  );

  // Widening waits for approval and leaves the approved permissions in force.
  const narrow = installed('1.0.0', { linkCards: [card(['a.example.com'])] });
  const widened = reconcile(
    narrow,
    offered('1.1.0', { linkCards: [card(['a.example.com']), card(['b.example.com'])] })
  );
  check('widening becomes a pending update', widened.pendingUpdate !== undefined);
  check('widening keeps the approved permissions', same(widened.permissions, narrow.permissions));
  const widenedSameVersion = reconcile(
    narrow,
    offered('1.0.0', { linkCards: [card(['a.example.com']), card(['b.example.com'])] })
  );
  check(
    'widening with the same version is still pending',
    widenedSameVersion.pendingUpdate !== undefined
  );

  // Nothing changed: the very same object comes back (no needless writes).
  const plain = installed('1.0.0', { linkCards: [card(['a.example.com'])] });
  check(
    'unchanged keeps the same object',
    reconcile(plain, offered('1.0.0', { linkCards: [card(['a.example.com'])] })) === plain
  );

  // Withdrawn by its repository: flagged, still installed, comes back when offered again.
  const gone = reconcile(plain, undefined);
  check('withdrawn integration is flagged', gone.sourceGone === true);
  const back = reconcile(gone, offered('1.0.0', { linkCards: [card(['a.example.com'])] }));
  check('a returning integration is not flagged', back.sourceGone === undefined);

  // Link matching: exact host, default port, path boundary.
  const withPath = [installed('1.0.0', { linkCards: [card(['app.example.com'], '/s')] })];
  const match = (url: string) => matchLinkCard(url, withPath, grants) !== null;
  check('link: exact path', match('https://app.example.com/s'));
  check('link: below the prefix', match('https://app.example.com/s/abc'));
  check('link: not a longer segment', !match('https://app.example.com/sx'));
  check('link: not outside the prefix', !match('https://app.example.com/other'));
  check('link: not another port', !match('https://app.example.com:8443/s/abc'));
  check('link: not http', !match('http://app.example.com/s/abc'));
  check('link: not userinfo', !match('https://user:pw@app.example.com/s/abc'));
  check('link: not a look-alike host', !match('https://app.example.com.evil.example/s/abc'));
  const rootCard = [installed('1.0.0', { linkCards: [card(['app.example.com'])] })];
  check(
    'link: no prefix covers the whole host',
    matchLinkCard('https://app.example.com/anything', rootCard, grants) !== null
  );

  checkLinkDetails(check);
  checkSettings(check);
  return failures;
}

const SETTINGS: IntegrationSetting[] = [
  { id: 'showStars', label: 'Show stars', type: 'toggle', default: true },
  { id: 'showDescription', label: 'Show description', type: 'toggle', default: false },
  { id: 'prefix', label: 'Prefix', type: 'text', default: 'GH', maxLength: 10 },
  {
    id: 'mode',
    label: 'Mode',
    type: 'choice',
    default: 'short',
    options: [
      { value: 'short', label: 'Short' },
      { value: 'long', label: 'Long' },
    ],
  },
];

function checkSettings(check: (name: string, ok: boolean) => void) {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const defaults = { showStars: true, showDescription: false, prefix: 'GH', mode: 'short' };

  // Stored values are re-checked on every read; anything that does not fit is the default.
  check('settings: none stored', same(resolveSettings(SETTINGS, undefined), defaults));
  check('settings: not an object', same(resolveSettings(SETTINGS, ['x']), defaults));
  check(
    'settings: valid values kept',
    same(resolveSettings(SETTINGS, { showStars: false, prefix: 'x', mode: 'long' }), {
      ...defaults,
      showStars: false,
      prefix: 'x',
      mode: 'long',
    })
  );
  check(
    'settings: tampered values fall back',
    same(
      resolveSettings(SETTINGS, {
        showStars: 'yes',
        showDescription: 1,
        prefix: 'x'.repeat(11),
        mode: 'evil',
        removed: 'value',
      }),
      defaults
    )
  );
  check(
    'settings: hidden characters refused',
    resolveSettings(SETTINGS, { prefix: 'a\u202eb' }).prefix === 'GH'
  );
  check(
    'settings: retyped setting degrades',
    resolveSettings([{ ...SETTINGS[0], type: 'text', default: '', maxLength: 5 }], {
      showStars: false,
    }).showStars === ''
  );
  const proto = JSON.parse('{"__proto__":{"prefix":"evil"}}') as unknown;
  check('settings: prototype key ignored', resolveSettings(SETTINGS, proto).prefix === 'GH');
  check('settings: none declared', same(resolveSettings(undefined, { a: 1 }), {}));

  // Templates: one pass, values never expanded again, unknown names kept.
  const vals = resolveSettings(SETTINGS, { prefix: '{owner}' });
  check(
    'template: setting and capture',
    renderTemplate('{setting.prefix} {owner}', { owner: 'octo' }, vals) === '{owner} octo'
  );
  check(
    'template: undeclared setting is empty',
    renderTemplate('[{setting.nope}]', {}, vals) === '[]'
  );
  check('template: toggle is empty', renderTemplate('[{setting.showStars}]', {}, vals) === '[]');
  check('template: unknown name kept', renderTemplate('{zz}', {}, vals) === '{zz}');

  // An installed integration that uses settings everywhere it may.
  const lookup = {
    id: 'repo',
    path: '/repos/{owner}/{repo}',
    title: 'full_name',
    description: 'description',
    descriptionIf: 'showDescription',
    facts: [
      { label: 'Stars', field: 'stargazers_count', format: 'count' as const, if: 'showStars' },
      { label: 'Owner', field: 'owner.login' },
    ],
  };
  const gh = installed(
    '1.0.0',
    {
      linkCards: [
        {
          hosts: ['github.com'],
          pathPattern: '/{owner}/{repo}',
          pathExclude: ['/orgs', '/settings'],
          title: '{setting.prefix} {owner}/{repo}',
          details: 'repo',
        },
      ],
      linkDetails: { host: 'api.github.com', lookups: [lookup] },
      composerActions: [{ id: 'a', label: 'A', insert: '{setting.prefix} {room}' }],
      commands: [{ name: 'gh', description: 'x', insert: '{setting.mode}: {args}' }],
      api: {
        host: 'api.example.com',
        actions: [{ id: 'push', label: 'Push', path: '/v1/push', body: { m: '{setting.mode}' } }],
      },
    },
    { settings: SETTINGS }
  );
  const all: GrantMap = {
    one: { linkCards: true, linkDetails: true, composerActions: true, commands: true, api: true },
  };
  const stored = { one: { prefix: 'Repo', mode: 'long', showStars: false } };
  const m = matchLinkCard('https://github.com/octo/hello', [gh], all, stored);
  check('card: setting in title', m?.title === 'Repo octo/hello');
  check(
    'card: defaults without stored',
    matchLinkCard('https://github.com/octo/hello', [gh], all)?.title === 'GH octo/hello'
  );
  check('card: excluded path', matchLinkCard('https://github.com/orgs/acme', [gh], all) === null);
  check(
    'card: excluded any case',
    matchLinkCard('https://github.com/ORGS/acme', [gh], all) === null
  );
  check(
    'card: excluded deeper',
    matchLinkCard('https://github.com/settings/keys', [gh], all) === null
  );
  check(
    'card: exclusion is whole segments',
    matchLinkCard('https://github.com/orgsx/acme', [gh], all) !== null
  );
  check(
    'card: other settings kept apart',
    matchLinkCard('https://github.com/a/b', [gh], all, { other: { prefix: 'X' } })?.title ===
      'GH a/b'
  );

  const action = getComposerActions([gh], all, stored)[0];
  check(
    'composer: setting filled',
    !!action && renderInsert(action.insert, '!r:x', '', action.settings) === 'Repo !r%3Ax'
  );
  const command = getCommands([gh], all, new Set<string>(), stored)[0];
  check(
    'command: setting filled',
    !!command && renderInsert(command.insert ?? '', '!r', 'hi', command.settings) === 'long: hi'
  );
  const apiAction = getApiActions([gh], all, stored)[0];
  const preview = apiAction
    ? previewApiRequest(gh, apiAction, {
        roomId: '!r',
        text: '',
        args: '',
        settings: apiAction.settings,
      })
    : null;
  check('api: choice setting in body', !!preview && preview.ok && preview.body === '{"m":"long"}');

  // Details: switched-off fields are not shown, and nothing is asked when nothing would show.
  const answer = {
    full_name: 'octo/hello',
    description: 'Hi',
    stargazers_count: 5,
    owner: { login: 'octo' },
  };
  const shownBy = (st: unknown) =>
    extractDetails(answer, lookup, 'en', resolveSettings(SETTINGS, st));
  check(
    'details: defaults',
    same(
      shownBy({}).facts.map((f) => f.label),
      ['Stars', 'Owner']
    ) && shownBy({}).description === undefined
  );
  check('details: fact off', !shownBy({ showStars: false }).facts.some((f) => f.label === 'Stars'));
  check('details: description on', shownBy({ showDescription: true }).description === 'Hi');
  const onlyToggled = {
    id: 'x',
    path: '/x/{a}',
    facts: [{ label: 'S', field: 's', if: 'showStars' }],
  };
  check(
    'details: asks when shown',
    lookupShowsAnything(onlyToggled, resolveSettings(SETTINGS, {}))
  );
  check(
    'details: no request when all off',
    !lookupShowsAnything(onlyToggled, resolveSettings(SETTINGS, { showStars: false }))
  );

  // Updates: settings travel with the permissions their templates were approved with.
  check('widened: same', !settingsWidened(SETTINGS, SETTINGS));
  check('widened: none to some', !settingsWidened(undefined, SETTINGS));
  check('widened: removed', !settingsWidened(SETTINGS, SETTINGS.slice(1)));
  check('widened: relabelled', !settingsWidened(SETTINGS, [{ ...SETTINGS[0], label: 'Stars' }]));
  check(
    'widened: new default',
    settingsWidened(SETTINGS, [
      { ...(SETTINGS[2] as Extract<IntegrationSetting, { type: 'text' }>), default: 'X' },
    ])
  );
  check(
    'widened: retyped',
    settingsWidened(SETTINGS, [
      {
        ...SETTINGS[2],
        type: 'choice',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        default: 'a',
      } as IntegrationSetting,
    ])
  );
  const mode = SETTINGS[3] as Extract<IntegrationSetting, { type: 'choice' }>;
  check(
    'widened: new choice value',
    settingsWidened(SETTINGS, [
      { ...mode, options: [...mode.options, { value: 'evil', label: 'E' }] },
    ])
  );
  check(
    'widened: choice value removed',
    !settingsWidened(SETTINGS, [{ ...mode, options: [mode.options[0]] }])
  );

  const plain = installed('1.0.0', {}, { settings: SETTINGS });
  const offeredWith = (settings?: IntegrationSetting[]): Integration => ({
    ...offered('1.0.0', {}),
    ...(settings ? { settings } : {}),
  });
  check('reconcile: unchanged settings', reconcile(plain, offeredWith(SETTINGS)) === plain);
  const relabelled = reconcile(plain, offeredWith([{ ...SETTINGS[0], label: 'Stars' }]));
  check(
    'reconcile: narrower settings taken',
    relabelled.pendingUpdate === undefined && relabelled.settings?.[0].label === 'Stars'
  );
  const dropped = reconcile(plain, offeredWith(undefined));
  check('reconcile: settings removed', dropped.settings === undefined && !dropped.pendingUpdate);
  const newDefault = reconcile(
    plain,
    offeredWith([
      { ...(SETTINGS[2] as Extract<IntegrationSetting, { type: 'text' }>), default: 'X' },
    ])
  );
  check(
    'reconcile: changed default waits',
    newDefault.settings === plain.settings &&
      same(newDefault.pendingUpdate?.settings, [
        { ...(SETTINGS[2] as Extract<IntegrationSetting, { type: 'text' }>), default: 'X' },
      ])
  );

  // An entry this Mudrix can not use keeps the installed version as it is.
  const blocked = reconcile(plain, undefined, {
    index: 0,
    id: 'one',
    error: 'x: unknown key',
    reason: 'unsupported',
  });
  check(
    'reconcile: rejected entry blocks, keeps working',
    blocked.blockedUpdate?.reason === 'unsupported' &&
      !blocked.sourceGone &&
      blocked.permissions === plain.permissions
  );
  const unblocked = reconcile(blocked, offeredWith(SETTINGS));
  check('reconcile: valid again clears the block', unblocked.blockedUpdate === undefined);
}

function checkLinkDetails(check: (name: string, ok: boolean) => void) {
  // Path patterns: whole segments, decoded captures, the link may continue below.
  const pat = '/{owner}/{repo}';
  const cap = (path: string) => JSON.stringify(matchPathPattern(path, pat));
  check('pattern: basic', cap('/octo/hello') === '{"owner":"octo","repo":"hello"}');
  check(
    'pattern: deeper path',
    cap('/octo/hello/tree/main/src') === '{"owner":"octo","repo":"hello"}'
  );
  check('pattern: trailing slash', cap('/octo/hello/') === '{"owner":"octo","repo":"hello"}');
  check('pattern: decoded', cap('/octo/h%C3%A9llo') === '{"owner":"octo","repo":"héllo"}');
  check('pattern: too short', matchPathPattern('/octo', pat) === null);
  check('pattern: empty segment', matchPathPattern('//hello', pat) === null);
  check('pattern: dot-dot', matchPathPattern('/octo/%2E%2E', pat) === null);
  check('pattern: bad escape', matchPathPattern('/octo/%E0%A4', pat) === null);
  check('pattern: bidi refused', matchPathPattern('/octo/a%E2%80%AEb', pat) === null);
  check('pattern: too long', matchPathPattern(`/octo/${'a'.repeat(101)}`, pat) === null);
  check('pattern: literal', matchPathPattern('/u/x/v1', '/u/{n}/v1') !== null);
  check('pattern: literal mismatch', matchPathPattern('/u/x/v2', '/u/{n}/v1') === null);
  check('pattern: literal case', matchPathPattern('/U/x', '/u/{n}') === null);
  check('fill: no re-expansion', fillCaptures('{a}/{b}', { a: '{b}', b: 'x' }) === '{b}/x');
  check('fill: unknown kept', fillCaptures('{z}', { a: '1' }) === '{z}');

  const lookup = {
    id: 'repo',
    path: '/repos/{owner}/{repo}',
    title: 'full_name',
    description: 'description',
    facts: [
      { label: 'Stars', field: 'stargazers_count', format: 'count' as const },
      { label: 'Language', field: 'language' },
      { label: 'Owner', field: 'owner.login' },
      { label: 'Updated', field: 'pushed_at', format: 'date' as const },
    ],
  };
  const gh = installed('1.0.0', {
    linkCards: [
      {
        hosts: ['github.com'],
        pathPattern: '/{owner}/{repo}',
        title: '{owner}/{repo}',
        subtitle: 'GitHub',
        details: 'repo',
      },
    ],
    linkDetails: { host: 'api.github.com', lookups: [lookup] },
  });
  const both: GrantMap = { one: { linkCards: true, linkDetails: true } };
  const m = matchLinkCard('https://github.com/octo/hello/issues', [gh], both);
  check('card: captures', m?.captures.owner === 'octo' && m?.captures.repo === 'hello');
  check('card: title filled', m?.title === 'octo/hello' && m?.subtitle === 'GitHub');
  check('card: pattern must fit', matchLinkCard('https://github.com/octo', [gh], both) === null);
  check('card: lookup with grant', !!m && findLinkLookup(m, [gh], both)?.host === 'api.github.com');
  check(
    'card: no lookup without the grant',
    !!m && findLinkLookup(m, [gh], { one: { linkCards: true, linkDetails: false } }) === null
  );
  check(
    'card: no lookup when disabled',
    !!m && findLinkLookup(m, [{ ...gh, enabled: false }], both) === null
  );

  // The request: exactly the approved host and path, values encoded.
  const url = (captures: Record<string, string>) => {
    const r = buildLookupUrl('api.github.com', lookup, captures);
    return r.ok ? r.url : `error:${r.error}`;
  };
  check(
    'url: basic',
    url({ owner: 'octo', repo: 'next.js' }) === 'https://api.github.com/repos/octo/next.js'
  );
  check(
    'url: encoded',
    url({ owner: 'a/b', repo: 'c?d#e' }) === 'https://api.github.com/repos/a%2Fb/c%3Fd%23e'
  );
  check('url: dot-dot refused', url({ owner: '..', repo: 'x' }).startsWith('error:'));
  check('url: missing capture', url({ owner: 'x' }).startsWith('error:'));
  const joined = { ...lookup, path: '/x/{a}{b}' };
  const j = buildLookupUrl('api.github.com', joined, { a: '.', b: '.' });
  check('url: joined dots refused', !j.ok);

  // Extraction: only the named fields, as clean plain text.
  const answer = JSON.parse(
    '{"full_name":"octo/hello","description":"Line one\\nline  two \\u202e evil","stargazers_count":12345,' +
      '"language":null,"owner":{"login":"octo"},"pushed_at":"2026-03-04T10:00:00Z","__proto__":{"x":1}}'
  ) as unknown;
  const d = extractDetails(answer, lookup, 'en');
  check('extract: title', d.title === 'octo/hello');
  check('extract: description cleaned', d.description === 'Line one line two evil');
  check('extract: count', d.facts.find((f) => f.label === 'Stars')?.value === '12.3K');
  check('extract: null left out', !d.facts.some((f) => f.label === 'Language'));
  check('extract: nested', d.facts.find((f) => f.label === 'Owner')?.value === 'octo');
  check('extract: date', d.facts.find((f) => f.label === 'Updated')?.value === 'Mar 4, 2026');
  check('extract: not an object', extractDetails([1, 2], lookup).facts.length === 0);
  check(
    'extract: wrong types',
    extractDetails({ full_name: 5, stargazers_count: 'many' }, lookup).title === undefined
  );
  check(
    'extract: long text capped',
    (extractDetails({ description: 'x'.repeat(1000) }, lookup).description ?? '').length === 300
  );
  check('format: object is not text', formatValue({ a: 1 }, 'text') === '');
  check('format: bad date', formatValue('yesterday', 'date') === '');
}
