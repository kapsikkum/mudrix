/**
 * Fixtures for the manifest validator, the permission rules and the matching. `runManifestExamples()`
 * returns the names of any fixture that does not behave as labelled (empty array = all good); the
 * test file next to it runs them.
 */
import {
  MAX_MANIFEST_BYTES,
  hasCapability,
  parseManifestText,
  validateManifest,
  type Permissions,
} from '../src/app/features/integrations/manifest.ts';
import { previewApiRequest } from '../src/app/features/integrations/api.ts';
import {
  getApiActions,
  getCommands,
  matchLinkCard,
  renderInsert,
} from '../src/app/features/integrations/matching.ts';
import { permissionsWidened } from '../src/app/features/integrations/permissions.ts';
import { parseRepoUrl } from '../src/app/features/integrations/repository.ts';
import type { InstalledIntegration } from '../src/app/features/integrations/types.ts';

const integration = (over: Record<string, unknown> = {}, perms: unknown = undefined) => ({
  id: 'altersend',
  name: 'AlterSend',
  description: 'Sample',
  version: '1.0.0',
  permissions: perms ?? {
    linkCards: [{ hosts: ['altersend.example'], pathPrefix: '/pay', title: 'Pay' }],
    composerActions: [
      {
        id: 'send',
        label: 'Send',
        icon: 'send',
        insert: 'https://altersend.example/s?room={room}',
      },
    ],
  },
  ...over,
});
const repo = (integrations: unknown[] = [integration()], over: Record<string, unknown> = {}) => ({
  schema: 1,
  key: 'BBCkDWX+I1E0LatjaZwEUWCdjQG+roO4/udFi4AhyvM=',
  serial: 1,
  name: 'Sample',
  integrations,
  ...over,
});
const withPerms = (p: unknown) => repo([integration({}, p)]);
const act = (over: Record<string, unknown> = {}) => ({
  id: 'push',
  label: 'Send to Example',
  path: '/v1/push',
  body: { room: '{room}', text: '{text}' },
  insertResultLink: 'url',
  ...over,
});
const api = (actions: unknown[] = [act()], host: unknown = 'api.example.com') => ({
  host,
  actions,
});
const cmd = (over: Record<string, unknown> = {}) => ({
  name: 'send',
  description: 'Send a note',
  usage: '/send <note>',
  insert: 'https://x.example/s?room={room}&q={args}',
  ...over,
});
const wid = (over: Record<string, unknown> = {}) => ({
  url: 'https://app.example.com/mudrix',
  name: 'AlterSend',
  capabilities: ['send.message', 'read.messages'],
  parameters: ['room_id'],
  ...over,
});
const lookup = (over: Record<string, unknown> = {}) => ({
  id: 'repo',
  path: '/repos/{owner}/{repo}',
  title: 'full_name',
  description: 'description',
  facts: [
    { label: 'Stars', field: 'stargazers_count', format: 'count' },
    { label: 'Owner', field: 'owner.login' },
  ],
  ...over,
});
const patternCard = (over: Record<string, unknown> = {}) => ({
  hosts: ['github.com'],
  pathPattern: '/{owner}/{repo}',
  title: '{owner}/{repo}',
  subtitle: 'GitHub',
  details: 'repo',
  ...over,
});
const details = (lookups: unknown[] = [lookup()], host: unknown = 'api.github.com') => ({
  host,
  lookups,
});
const withDetails = (cardOver: Record<string, unknown> = {}, d: unknown = details()) =>
  withPerms({ linkCards: [patternCard(cardOver)], linkDetails: d });
const SETTINGS = [
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
/** One integration that uses every kind of setting reference the format allows. */
const withSettings = (perms: Record<string, unknown> = {}, settings: unknown = SETTINGS) =>
  repo([
    integration(
      { settings },
      {
        linkCards: [
          patternCard({
            title: '{setting.prefix} {owner}/{repo}',
            subtitle: 'GitHub ({setting.mode})',
            pathExclude: ['/orgs', '/settings'],
          }),
        ],
        linkDetails: details([
          lookup({
            descriptionIf: 'showDescription',
            facts: [
              { label: 'Stars', field: 'stargazers_count', format: 'count', if: 'showStars' },
              { label: 'Owner', field: 'owner.login' },
            ],
          }),
        ]),
        composerActions: [{ id: 'a', label: 'A', insert: '{setting.prefix} {room}' }],
        commands: [cmd({ insert: '{setting.prefix}: {args}' }), apiCmd()],
        api: api([act({ body: { room: '{room}', mode: '{setting.mode}' } })]),
        ...perms,
      }
    ),
  ]);
const setting = (over: Record<string, unknown>) => withSettings({}, [{ ...SETTINGS[0], ...over }]);
const widCmd = (over: Record<string, unknown> = {}) =>
  cmd({ name: 'open', usage: undefined, insert: undefined, widget: true, ...over });
const apiCmd = () => cmd({ name: 'push', usage: undefined, insert: undefined, api: 'push' });

/** Entries that ask for a widget: known, but this app does not run code, so they are set aside. */
export const WIDGET_MANIFESTS: Record<string, unknown> = {
  widgetFull: withPerms({ widget: wid(), commands: [widCmd()] }),
  widgetDisplayOnly: withPerms({ widget: { url: 'https://app.example.com/', capabilities: [] } }),
  widgetQueryKept: withPerms({ widget: wid({ url: 'https://app.example.com/w?mode=a' }) }),
  widgetOneEvent: withPerms({ widget: wid({ events: ['com.example.fileshare.sent'] }) }),
  widgetThreeEvents: withPerms({
    widget: wid({
      events: ['com.example.fileshare.sent', 'com.example.fileshare.ack', 'app.example.x-1.y_2'],
    }),
  }),
  widgetEventMaxLength: withPerms({
    widget: wid({ events: [`com.example.${'a'.repeat(68)}`] }),
  }),
  widgetEventsEmptyList: withPerms({ widget: wid({ events: [] }) }),
  widgetFromLinksViewer: withPerms({
    widget: wid({ capabilities: [], fromLinks: true, linkLabel: 'Download', saveFiles: true }),
  }),
  widgetFromLinksNoLabel: withPerms({ widget: wid({ capabilities: [], fromLinks: true }) }),
  widgetSaveFilesOnly: withPerms({ widget: wid({ saveFiles: true }) }),
  widgetEventsNoOtherCapability: withPerms({
    widget: wid({ capabilities: [], events: ['com.example.fileshare.sent'] }),
  }),
};

export const GOOD_MANIFESTS: Record<string, unknown> = {
  full: repo(),
  empty: repo([]),
  noPermissions: repo([integration({}, {})]),
  httpsIcon: repo([integration({ icon: 'https://cdn.example/i.png' })]),
  apiAndCommands: withPerms({ api: api(), commands: [cmd(), apiCmd()] }),
  apiNoBody: withPerms({ api: api([act({ body: undefined, insertResultLink: undefined })]) }),
  commandInsertOnly: withPerms({ commands: [cmd()] }),
  linkDetailsFull: withDetails(),
  linkDetailsFactsOnly: withDetails(
    {},
    details([lookup({ title: undefined, description: undefined })])
  ),
  linkDetailsTitleOnly: withDetails({}, details([lookup({ description: undefined, facts: [] })])),
  linkDetailsDateFormat: withDetails(
    {},
    details([lookup({ facts: [{ label: 'Updated', field: 'pushed_at', format: 'date' }] })])
  ),
  linkDetailsTwoRules: withPerms({
    linkCards: [
      patternCard({
        pathPattern: '/{owner}/{repo}/issues/{number}',
        title: 'Issue {number}',
        details: 'issue',
      }),
      patternCard(),
    ],
    linkDetails: details([
      lookup(),
      lookup({ id: 'issue', path: '/repos/{owner}/{repo}/issues/{number}', title: 'title' }),
    ]),
  }),
  linkDetailsPartialSegment: withDetails(
    {},
    details([lookup({ path: '/v1/{owner}-{repo}.json' })])
  ),
  patternWithoutDetails: withPerms({
    linkCards: [patternCard({ details: undefined, title: '{owner}', subtitle: undefined })],
  }),
  patternLiteralSegments: withPerms({
    linkCards: [
      patternCard({ details: undefined, pathPattern: '/u/{name}/v1.0', title: 'User {name}' }),
    ],
  }),
  plainTitleKeepsBraces: withPerms({ linkCards: [{ hosts: ['a.example'], title: 'Set {x}' }] }),
  settingsEveryKind: withSettings(),
  settingsEmptyList: repo([integration({ settings: [] })]),
  settingsUnused: repo([integration({ settings: SETTINGS })]),
  settingTextNoMaxLength: repo([
    integration({ settings: [{ id: 'note', label: 'Note', type: 'text', default: '' }] }),
  ]),
  settingDescription: repo([
    integration({ settings: [{ ...SETTINGS[0], description: 'Shows the star count' }] }),
  ]),
  plainTitleWithSetting: repo([
    integration(
      { settings: SETTINGS },
      { linkCards: [{ hosts: ['a.example'], title: '{setting.prefix} {x}' }] }
    ),
  ]),
  pathExcludeAlone: withPerms({
    linkCards: [{ hosts: ['a.example'], title: 'x', pathExclude: ['/orgs', '/a/b.c'] }],
  }),
  sixFacts: withDetails(
    {},
    details([
      lookup({ facts: Array.from({ length: 6 }, (_, i) => ({ label: `F${i}`, field: 'x' })) }),
    ])
  ),
  ruleIconStillAccepted: withPerms({
    linkCards: [{ hosts: ['a.example'], title: 'x', icon: 'https://cdn.example/i.png' }],
  }),
};

export const BAD_MANIFESTS: Record<string, unknown> = {
  settingBadId: setting({ id: 'Show-stars' }),
  settingIdTooLong: setting({ id: `a${'b'.repeat(24)}` }),
  settingUnknownType: setting({ type: 'slider' }),
  settingUnknownKey: setting({ secret: true }),
  settingToggleStringDefault: setting({ default: 'true' }),
  settingToggleWithOptions: setting({ options: [] }),
  settingTextTooLong: setting({ type: 'text', default: '', maxLength: 201 }),
  settingTextDefaultTooLong: setting({ type: 'text', default: 'abcd', maxLength: 3 }),
  settingTextBidiDefault: setting({ type: 'text', default: 'a\u202eb' }),
  settingChoiceOneOption: setting({
    type: 'choice',
    default: 'a',
    options: [{ value: 'a', label: 'A' }],
  }),
  settingChoiceBadDefault: setting({
    type: 'choice',
    default: 'c',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  }),
  settingChoiceBadValue: setting({
    type: 'choice',
    default: 'a',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b c', label: 'B' },
    ],
  }),
  settingChoiceDuplicate: setting({
    type: 'choice',
    default: 'a',
    options: [
      { value: 'a', label: 'A' },
      { value: 'a', label: 'B' },
    ],
  }),
  settingDuplicateId: repo([integration({ settings: [SETTINGS[0], SETTINGS[0]] })]),
  tooManySettings: repo([
    integration({
      settings: Array.from({ length: 9 }, (_, i) => ({ ...SETTINGS[0], id: `s${i}` })),
    }),
  ]),
  settingsNotAList: repo([integration({ settings: {} })]),
  undeclaredSettingInTitle: withPerms({
    linkCards: [patternCard({ title: '{setting.prefix} {owner}' })],
  }),
  undeclaredSettingInPlainTitle: withPerms({
    linkCards: [{ hosts: ['a.example'], title: '{setting.prefix}' }],
  }),
  toggleSettingInTemplate: withSettings({
    composerActions: [{ id: 'a', label: 'A', insert: '{setting.showStars}' }],
  }),
  textSettingInApiBody: withSettings({
    api: api([act({ body: { note: '{setting.prefix}' } })]),
  }),
  settingInApiPath: withSettings({ api: api([act({ path: '/v1/{setting.mode}' })]) }),
  settingInLookupPath: withSettings({
    linkDetails: details([lookup({ path: '/repos/{owner}/{setting.mode}' })]),
  }),
  factIfUnknown: withSettings({
    linkDetails: details([lookup({ facts: [{ label: 'S', field: 'x', if: 'nope' }] })]),
  }),
  factIfNotToggle: withSettings({
    linkDetails: details([lookup({ facts: [{ label: 'S', field: 'x', if: 'mode' }] })]),
  }),
  descriptionIfWithoutDescription: withSettings({
    linkDetails: details([lookup({ description: undefined, descriptionIf: 'showDescription' })]),
  }),
  pathExcludeEmpty: withPerms({
    linkCards: [{ hosts: ['a.example'], title: 'x', pathExclude: [] }],
  }),
  pathExcludeRoot: withPerms({
    linkCards: [{ hosts: ['a.example'], title: 'x', pathExclude: ['/'] }],
  }),
  pathExcludeRelative: withPerms({
    linkCards: [{ hosts: ['a.example'], title: 'x', pathExclude: ['orgs'] }],
  }),
  pathExcludeQuery: withPerms({
    linkCards: [{ hosts: ['a.example'], title: 'x', pathExclude: ['/a?b'] }],
  }),
  pathExcludeDuplicate: withPerms({
    linkCards: [{ hosts: ['a.example'], title: 'x', pathExclude: ['/orgs', '/ORGS'] }],
  }),
  pathExcludeTooMany: withPerms({
    linkCards: [
      {
        hosts: ['a.example'],
        title: 'x',
        pathExclude: Array.from({ length: 31 }, (_, i) => `/p${i}`),
      },
    ],
  }),
  unknownTopKey: repo([integration()], { extra: 1 }),
  unknownIntegrationKey: repo([integration({ homepage: 'x' })]),
  unknownPermission: withPerms({ network: [] }),
  httpIcon: repo([integration({ icon: 'http://cdn.example/i.png' })]),
  userinfoIcon: repo([integration({ icon: 'https://u:p@cdn.example/i.png' })]),
  bidiInName: repo([integration({ name: 'Alter‮Send' })]),
  zeroWidthInTitle: withPerms({ linkCards: [{ hosts: ['a.example'], title: 'Pa​y' }] }),
  newlineInInsert: withPerms({ composerActions: [{ id: 'a', label: 'A', insert: 'x\ny' }] }),
  badPlaceholder: withPerms({ composerActions: [{ id: 'a', label: 'A', insert: 'x?u={user}' }] }),
  wildcardHost: withPerms({ linkCards: [{ hosts: ['*.example.com'], title: 'x' }] }),
  ipHost: withPerms({ linkCards: [{ hosts: ['10.0.0.1'], title: 'x' }] }),
  uppercaseHost: withPerms({ linkCards: [{ hosts: ['Example.com'], title: 'x' }] }),
  badPathPrefix: withPerms({
    linkCards: [{ hosts: ['a.example'], pathPrefix: 'pay', title: 'x' }],
  }),
  badIcon: withPerms({ composerActions: [{ id: 'a', label: 'A', icon: 'rocket', insert: 'x' }] }),
  duplicateIntegrationId: repo([integration(), integration()]),
  duplicateActionId: withPerms({
    composerActions: [
      { id: 'a', label: 'A', insert: 'x' },
      { id: 'a', label: 'B', insert: 'y' },
    ],
  }),
  apiUnknownKey: withPerms({ api: { ...api(), headers: {} } }),
  apiActionUnknownKey: withPerms({ api: api([act({ method: 'GET' })]) }),
  apiHeaderField: withPerms({ api: api([act({ headers: { A: 'b' } })]) }),
  apiQueryInPath: withPerms({ api: api([act({ path: '/v1/push?x=1' })]) }),
  apiPercentInPath: withPerms({ api: api([act({ path: '/v1/%2e%2e' })]) }),
  apiDotDotPath: withPerms({ api: api([act({ path: '/v1/../x' })]) }),
  apiRelativePath: withPerms({ api: api([act({ path: 'v1/push' })]) }),
  apiWildcardHost: withPerms({ api: api([act()], '*.example.com') }),
  apiHostPort: withPerms({ api: api([act()], 'api.example.com:8443') }),
  apiHostUppercase: withPerms({ api: api([act()], 'API.example.com') }),
  apiHostIp: withPerms({ api: api([act()], '10.0.0.1') }),
  apiHostWithScheme: withPerms({ api: api([act()], 'https://api.example.com') }),
  apiNoActions: withPerms({ api: api([]) }),
  apiTooManyActions: withPerms({
    api: api(Array.from({ length: 5 }, (_, i) => act({ id: `a${i}` }))),
  }),
  apiDuplicateActionId: withPerms({ api: api([act(), act()]) }),
  apiBadPlaceholder: withPerms({ api: api([act({ body: { u: '{user}' } })]) }),
  apiNestedBrace: withPerms({ api: api([act({ body: { u: '{{room}' } })]) }),
  apiBodyNonString: withPerms({ api: api([act({ body: { n: 1 } })]) }),
  apiBodyNested: withPerms({ api: api([act({ body: { n: { a: 'b' } } })]) }),
  apiBodyBadKey: withPerms({ api: api([act({ body: { 'a b': 'x' } })]) }),
  apiBodyProtoKey: withPerms({ api: api([act({ body: JSON.parse('{"__proto__":"x"}') })]) }),
  apiBodyLongValue: withPerms({ api: api([act({ body: { a: 'x'.repeat(201) } })]) }),
  apiBodyTooManyKeys: withPerms({
    api: api([
      act({ body: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, 'x'])) }),
    ]),
  }),
  apiBadResultField: withPerms({ api: api([act({ insertResultLink: 'a.b' })]) }),
  apiLongLabel: withPerms({ api: api([act({ label: 'x'.repeat(25) })]) }),
  commandBothInsertAndApi: withPerms({ api: api(), commands: [cmd({ api: 'push' })] }),
  commandNeither: withPerms({ commands: [cmd({ insert: undefined })] }),
  commandApiTargetMissing: withPerms({
    api: api(),
    commands: [cmd({ insert: undefined, api: 'nope' })],
  }),
  commandApiWithoutApiPermission: withPerms({
    commands: [cmd({ insert: undefined, api: 'push' })],
  }),
  commandDuplicateNames: withPerms({ commands: [cmd(), cmd()] }),
  commandBadName: withPerms({ commands: [cmd({ name: 'Send', usage: undefined })] }),
  commandNameWithSlash: withPerms({ commands: [cmd({ name: '/send', usage: undefined })] }),
  commandShortName: withPerms({ commands: [cmd({ name: 'a', usage: undefined })] }),
  commandBadPlaceholder: withPerms({ commands: [cmd({ insert: 'x {text}' })] }),
  commandUsageMismatch: withPerms({ commands: [cmd({ usage: '/other <x>' })] }),
  commandUsageNoSlash: withPerms({ commands: [cmd({ usage: 'send <x>' })] }),
  commandLongDescription: withPerms({ commands: [cmd({ description: 'x'.repeat(81) })] }),
  commandUnknownKey: withPerms({ commands: [cmd({ icon: 'send' })] }),
  commandNewlineInInsert: withPerms({ commands: [cmd({ insert: 'a\nb' })] }),
  widgetUnknownKey: withPerms({ widget: wid({ allow: 'camera' }) }),
  widgetUnknownCapability: withPerms({ widget: wid({ capabilities: ['send.event'] }) }),
  widgetRawCapabilityString: withPerms({
    widget: wid({ capabilities: ['org.matrix.msc2762.send.event:m.room.message'] }),
  }),
  widgetDuplicateCapability: withPerms({
    widget: wid({ capabilities: ['send.message', 'send.message'] }),
  }),
  widgetCapabilitiesMissing: withPerms({ widget: { url: 'https://app.example.com/' } }),
  widgetBadParameter: withPerms({ widget: wid({ parameters: ['access_token'] }) }),
  widgetDuplicateParameter: withPerms({ widget: wid({ parameters: ['room_id', 'room_id'] }) }),
  widgetTemplateVariable: withPerms({
    widget: wid({ url: 'https://app.example.com/w?u=$matrix_user_id' }),
  }),
  widgetHttpUrl: withPerms({ widget: wid({ url: 'http://app.example.com/w' }) }),
  widgetCredentialsUrl: withPerms({ widget: wid({ url: 'https://u:p@app.example.com/w' }) }),
  widgetFragmentUrl: withPerms({ widget: wid({ url: 'https://app.example.com/w#x' }) }),
  widgetThemeInQuery: withPerms({ widget: wid({ url: 'https://app.example.com/w?theme=dark' }) }),
  widgetLangInQuery: withPerms({ widget: wid({ url: 'https://app.example.com/w?lang=en' }) }),
  widgetIpUrl: withPerms({ widget: wid({ url: 'https://10.0.0.1/w' }) }),
  widgetLongName: withPerms({ widget: wid({ name: 'x'.repeat(41) }) }),
  widgetFourEvents: withPerms({
    widget: wid({
      events: [
        'com.example.a.one',
        'com.example.a.two',
        'com.example.a.three',
        'com.example.a.four',
      ],
    }),
  }),
  widgetDuplicateEvents: withPerms({
    widget: wid({ events: ['com.example.a.one', 'com.example.a.one'] }),
  }),
  widgetEventMNamespace: withPerms({ widget: wid({ events: ['m.foo.bar'] }) }),
  widgetEventOrgMatrix: withPerms({ widget: wid({ events: ['org.matrix.x.y'] }) }),
  widgetEventImVector: withPerms({ widget: wid({ events: ['im.vector.a.b'] }) }),
  widgetEventIoElement: withPerms({ widget: wid({ events: ['io.element.a.b'] }) }),
  widgetEventTwoSegments: withPerms({ widget: wid({ events: ['com.example'] }) }),
  widgetEventUppercase: withPerms({ widget: wid({ events: ['com.Example.app.sent'] }) }),
  widgetEventTooLong: withPerms({ widget: wid({ events: [`com.example.${'a'.repeat(69)}`] }) }),
  widgetFromLinksFalse: withPerms({ widget: wid({ fromLinks: false }) }),
  widgetFromLinksString: withPerms({ widget: wid({ fromLinks: 'yes' }) }),
  widgetSaveFilesFalse: withPerms({ widget: wid({ saveFiles: false }) }),
  widgetLinkLabelAlone: withPerms({ widget: wid({ linkLabel: 'Download' }) }),
  widgetLinkLabelTooLong: withPerms({
    widget: wid({ fromLinks: true, linkLabel: 'x'.repeat(25) }),
  }),
  widgetEventEmptyString: withPerms({ widget: wid({ events: [''] }) }),
  widgetEventNonString: withPerms({ widget: wid({ events: [42] }) }),
  widgetEventNull: withPerms({ widget: wid({ events: [null] }) }),
  widgetEventLeadingDot: withPerms({ widget: wid({ events: ['.com.example.app'] }) }),
  widgetEventEmptySegment: withPerms({ widget: wid({ events: ['a..b.c'] }) }),
  widgetEventTrailingDot: withPerms({ widget: wid({ events: ['com.example.app.'] }) }),
  widgetEventSegmentStartsWithDash: withPerms({ widget: wid({ events: ['com.-example.app'] }) }),
  widgetEventSpace: withPerms({ widget: wid({ events: ['com.example.a b'] }) }),
  widgetEventWildcard: withPerms({ widget: wid({ events: ['com.example.*'] }) }),
  widgetEventsNotArray: withPerms({ widget: wid({ events: 'com.example.app.sent' }) }),
  widgetCommandWithoutPermission: withPerms({ commands: [widCmd()] }),
  widgetCommandFalse: withPerms({ widget: wid(), commands: [widCmd({ widget: false })] }),
  widgetCommandAndInsert: withPerms({ widget: wid(), commands: [widCmd({ insert: 'x' })] }),
  widgetCommandAndApi: withPerms({
    widget: wid(),
    api: api(),
    commands: [widCmd({ api: 'push' })],
  }),
  tooManyCommands: withPerms({
    commands: Array.from({ length: 7 }, (_, i) => cmd({ name: `cmd-${i}`, usage: undefined })),
  }),
  patternAndPrefix: withPerms({
    linkCards: [patternCard({ details: undefined, pathPrefix: '/x' })],
  }),
  patternNoSlash: withPerms({
    linkCards: [patternCard({ details: undefined, pathPattern: '{a}' })],
  }),
  patternDuplicateName: withPerms({
    linkCards: [
      patternCard({ details: undefined, pathPattern: '/{a}/{a}', title: 'x', subtitle: undefined }),
    ],
  }),
  patternPartialPlaceholder: withPerms({
    linkCards: [
      patternCard({ details: undefined, pathPattern: '/x-{a}', title: 'x', subtitle: undefined }),
    ],
  }),
  patternUppercaseName: withPerms({
    linkCards: [
      patternCard({ details: undefined, pathPattern: '/{Owner}', title: 'x', subtitle: undefined }),
    ],
  }),
  patternDotDot: withPerms({
    linkCards: [patternCard({ details: undefined, pathPattern: '/../{a}' })],
  }),
  patternQuery: withPerms({
    linkCards: [patternCard({ details: undefined, pathPattern: '/{a}?x' })],
  }),
  patternTooManySegments: withPerms({
    linkCards: [patternCard({ details: undefined, pathPattern: '/a/b/c/d/e/f/g/h/i' })],
  }),
  patternUnknownPlaceholderInTitle: withPerms({
    linkCards: [patternCard({ details: undefined, title: '{owner}/{name}' })],
  }),
  patternUnknownPlaceholderInSubtitle: withPerms({
    linkCards: [patternCard({ details: undefined, subtitle: '{room}' })],
  }),
  detailsWithoutPattern: withPerms({
    linkCards: [{ hosts: ['github.com'], title: 'x', details: 'repo' }],
    linkDetails: details(),
  }),
  detailsUnknownLookup: withDetails({ details: 'nope' }),
  detailsWithoutPermission: withPerms({ linkCards: [patternCard()] }),
  detailsUncapturedName: withDetails({ pathPattern: '/{owner}', title: '{owner}' }),
  lookupUnused: withPerms({
    linkCards: [patternCard({ details: undefined })],
    linkDetails: details(),
  }),
  lookupShowsNothing: withDetails(
    {},
    details([lookup({ title: undefined, description: undefined, facts: undefined })])
  ),
  lookupUnknownKey: withDetails({}, details([lookup({ headers: {} })])),
  lookupDetailsUnknownKey: withDetails({}, { ...details(), method: 'POST' }),
  lookupNoLookups: withDetails({}, details([])),
  lookupTooMany: withDetails(
    {},
    details(Array.from({ length: 5 }, (_, i) => lookup({ id: i === 0 ? 'repo' : `l${i}` })))
  ),
  lookupDuplicateId: withDetails({}, details([lookup(), lookup()])),
  lookupQueryInPath: withDetails({}, details([lookup({ path: '/repos/{owner}/{repo}?x=1' })])),
  lookupDotDotPath: withDetails({}, details([lookup({ path: '/repos/../{owner}/{repo}' })])),
  lookupRelativePath: withDetails({}, details([lookup({ path: 'repos/{owner}/{repo}' })])),
  lookupBadPlaceholder: withDetails({}, details([lookup({ path: '/repos/{Owner}/{repo}' })])),
  lookupHostWithScheme: withDetails({}, details([lookup()], 'https://api.github.com')),
  lookupHostWildcard: withDetails({}, details([lookup()], '*.github.com')),
  lookupHostIp: withDetails({}, details([lookup()], '10.0.0.1')),
  lookupHostPort: withDetails({}, details([lookup()], 'api.github.com:8443')),
  lookupBadField: withDetails({}, details([lookup({ title: 'full name' })])),
  lookupProtoField: withDetails({}, details([lookup({ title: 'owner.__proto__' })])),
  lookupDeepField: withDetails({}, details([lookup({ title: 'a.b.c.d.e' })])),
  lookupBadFormat: withDetails(
    {},
    details([lookup({ facts: [{ label: 'Stars', field: 'stargazers_count', format: 'html' }] })])
  ),
  lookupTooManyFacts: withDetails(
    {},
    details([
      lookup({ facts: Array.from({ length: 7 }, (_, i) => ({ label: `F${i}`, field: 'x' })) }),
    ])
  ),
  lookupLongFactLabel: withDetails(
    {},
    details([lookup({ facts: [{ label: 'x'.repeat(25), field: 'x' }] })])
  ),
  lookupFactUnknownKey: withDetails(
    {},
    details([lookup({ facts: [{ label: 'x', field: 'x', link: true }] })])
  ),
  wrongType: repo([integration({ version: 1 })]),
  badSchema: repo([], { schema: 2 }),
  missingKey: repo([], { key: undefined }),
  shortKey: repo([], { key: 'AAAA' }),
  garbageKey: repo([], { key: '!'.repeat(44) }),
  missingSerial: repo([], { serial: undefined }),
  zeroSerial: repo([], { serial: 0 }),
  hugeSerial: repo([], { serial: 2147483648 }),
  fractionalSerial: repo([], { serial: 1.5 }),
  badId: repo([integration({ id: 'Bad Id' })]),
  tooLongName: repo([integration({ name: 'x'.repeat(41) })]),
  tooManyActions: withPerms({
    composerActions: Array.from({ length: 7 }, (_, i) => ({
      id: `a${i}`,
      label: 'A',
      insert: 'x',
    })),
  }),
};

/** Valid, with every entry usable (an unusable entry is set aside, not an error of the file). */
const usable = (v: unknown): boolean => {
  const r = validateManifest(v);
  return r.ok && r.value.rejected.length === 0;
};

export function runManifestExamples(): string[] {
  const problems: string[] = [];
  // Good: valid, and every entry usable. Bad: the file is refused, or the entry is set aside.
  Object.entries(GOOD_MANIFESTS).forEach(([k, v]) => {
    const r = validateManifest(v);
    if (!r.ok || r.value.rejected.length > 0) problems.push(`good:${k}`);
  });
  Object.entries(BAD_MANIFESTS).forEach(([k, v]) => {
    const r = validateManifest(v);
    if (r.ok && r.value.rejected.length === 0) problems.push(`bad:${k}`);
  });
  const oversize = JSON.stringify(repo([], { name: 'x'.repeat(MAX_MANIFEST_BYTES) }));
  if (parseManifestText(oversize).ok) problems.push('bad:oversize');
  if (parseManifestText('{not json').ok) problems.push('bad:notJson');

  const urls: Array<[string, boolean]> = [
    ['https://example.com/repo.json', true],
    ['https://github.com/o/r', true],
    ['https://github.com/o/r/tree/main', true],
    ['http://example.com/repo.json', false],
    ['https://user:pw@example.com/repo.json', false],
    ['https://192.168.1.2/repo.json', false],
    // Local hosts, ports and IP addresses are never accepted.
    ['https://localhost/repo.json', false],
    ['https://example.com:8443/repo.json', false],
    ['https://[::1]/repo.json', false],
    ['ftp://example.com/x', false],
  ];
  urls.forEach(([u, expected]) => {
    if (parseRepoUrl(u).ok !== expected) problems.push(`url:${u}`);
  });

  const parsed = validateManifest(repo());
  if (parsed.ok) {
    const p = parsed.value.integrations[0].permissions;
    const widerHost = {
      linkCards: [{ ...p.linkCards![0], hosts: ['altersend.example', 'b.example'] }],
    };
    if (permissionsWidened(p, p)) problems.push('widened:same');
    if (!permissionsWidened({}, p)) problems.push('widened:newCapability');
    if (!permissionsWidened(p, { ...p, ...widerHost })) problems.push('widened:newHost');
    if (permissionsWidened(p, { linkCards: p.linkCards })) problems.push('widened:narrower');

    const installed: InstalledIntegration[] = [
      {
        id: 'altersend',
        repoUrl: 'x',
        name: 'AlterSend',
        description: '',
        version: '1',
        permissions: p,
        enabled: true,
        approvedAt: 0,
      },
    ];
    const on = { altersend: { linkCards: true } };
    if (!matchLinkCard('https://altersend.example/pay/1', installed, on))
      problems.push('match:hit');
    if (matchLinkCard('https://altersend.example/other', installed, on))
      problems.push('match:path');
    if (matchLinkCard('http://altersend.example/pay', installed, on)) problems.push('match:http');
    if (matchLinkCard('https://evil.altersend.example/pay', installed, on))
      problems.push('match:subdomain');
    if (
      matchLinkCard('https://altersend.example/pay', installed, { altersend: { linkCards: false } })
    )
      problems.push('match:revoked');
    if (matchLinkCard('https://altersend.example/pay', [{ ...installed[0], enabled: false }], on))
      problems.push('match:disabled');
  } else problems.push('setup');

  // Local api hosts, ports and addresses are never valid.
  [
    'localhost',
    'localhost:8080',
    '127.0.0.1:3000',
    'localhost:99999',
    'api.example.com:8443',
  ].forEach((h) => {
    if (usable(withPerms({ api: api([act()], h) }))) problems.push(`apiHost:${h}`);
  });

  // Widgets are set aside with a clear reason, never installed, never an error of the file.
  Object.entries(WIDGET_MANIFESTS).forEach(([k, v]) => {
    const r = validateManifest(v);
    if (!r.ok || r.value.integrations.length !== 0 || r.value.rejected[0]?.reason !== 'unsupported')
      problems.push(`widget:${k}`);
  });

  checkApiAndCommands(problems);
  checkLinkDetails(problems);
  checkPerEntry(problems);
  return problems;
}

/** One unusable entry never takes the rest of the repository down with it. */
function checkPerEntry(problems: string[]) {
  const mixed = validateManifest(
    repo([
      integration(),
      integration({ id: 'newer', name: 'Newer', permissions: { teleport: [] } }),
      integration({ id: 'broken', name: 'Broken', version: 1 }),
      integration({ id: 'newtype', settings: [{ ...SETTINGS[0], type: 'slider' }] }),
      integration({ name: 'Second AlterSend' }),
      'not an object',
    ])
  );
  if (!mixed.ok) {
    problems.push('perEntry:setup');
    return;
  }
  const { integrations, rejected } = mixed.value;
  const reason = (id: string) => rejected.find((r) => r.id === id)?.reason;
  if (integrations.length !== 1 || integrations[0].name !== 'AlterSend')
    problems.push('perEntry:firstKept');
  if (rejected.length !== 5) problems.push('perEntry:count');
  if (reason('newer') !== 'unsupported') problems.push('perEntry:unknownCapability');
  if (reason('newtype') !== 'unsupported') problems.push('perEntry:unknownSettingType');
  if (reason('broken') !== 'invalid') problems.push('perEntry:invalid');
  if (rejected.find((r) => r.index === 4)?.error.includes('duplicate') !== true)
    problems.push('perEntry:duplicate');
  const notObject = rejected.find((r) => r.index === 5);
  if (!notObject || notObject.id !== undefined || notObject.name !== undefined)
    problems.push('perEntry:notObject');
  // The repository itself is still all or nothing.
  if (validateManifest(repo([integration()], { extra: 1 })).ok) problems.push('perEntry:repoKey');
  // An empty settings list is dropped, so the stored shape is canonical.
  const empty = validateManifest(GOOD_MANIFESTS.settingsEmptyList);
  if (!empty.ok || empty.value.integrations[0].settings !== undefined)
    problems.push('perEntry:emptySettings');
}

function checkLinkDetails(problems: string[]) {
  const parsed = validateManifest(withDetails());
  if (!parsed.ok) {
    problems.push('details:setup');
    return;
  }
  const p = parsed.value.integrations[0].permissions;
  const d = p.linkDetails!;
  const l0 = d.lookups[0];
  const r0 = p.linkCards![0];
  const widened = (n: Permissions) => permissionsWidened(p, n);
  const withLookup = (over: Record<string, unknown>): Permissions => ({
    ...p,
    linkDetails: { ...d, lookups: [{ ...l0, ...over }] },
  });
  if (!hasCapability(p, 'linkDetails') || hasCapability({}, 'linkDetails'))
    problems.push('details:has');
  if (widened(p)) problems.push('details:widenedSame');
  if (!permissionsWidened({ linkCards: p.linkCards }, p)) problems.push('details:widenedNew');
  if (!widened({ ...p, linkDetails: { ...d, host: 'evil.example.com' } }))
    problems.push('details:widenedHost');
  if (!widened(withLookup({ path: '/users/{owner}' }))) problems.push('details:widenedPath');
  if (!widened(withLookup({ description: 'owner.email' }))) problems.push('details:widenedField');
  if (!widened(withLookup({ facts: [...(l0.facts ?? []), { label: 'X', field: 'x' }] })))
    problems.push('details:widenedFact');
  if (!widened({ ...p, linkCards: [{ ...r0, pathPattern: '/{owner}/{repo}/{x}' }] }))
    problems.push('details:widenedPattern');
  if (!widened({ ...p, linkCards: [{ ...r0, details: 'other' }] }))
    problems.push('details:widenedRuleLookup');
  if (widened({ ...p, linkDetails: undefined, linkCards: [{ ...r0, details: undefined }] }))
    problems.push('details:removalIsNarrowing');
}

type Perms = Permissions;

const installedOf = (id: string, permissions: Perms, enabled = true): InstalledIntegration => ({
  id,
  repoUrl: 'x',
  name: id,
  description: '',
  version: '1',
  permissions,
  enabled,
  approvedAt: 0,
});

function checkWidening(p: Perms, problems: string[]) {
  const a0 = p.api!.actions[0];
  const cmds = p.commands!;
  const withActions = (actions: NonNullable<Perms['api']>['actions']) => ({
    ...p,
    api: { ...p.api!, actions },
  });
  const widened = (n: Perms) => permissionsWidened(p, n);
  if (widened(p)) problems.push('api:widenedSame');
  if (!permissionsWidened({ ...p, api: undefined }, p)) problems.push('api:widenedNew');
  if (!widened({ ...p, api: { ...p.api!, host: 'other.example.com' } }))
    problems.push('api:widenedHost');
  if (!widened(withActions([...p.api!.actions, { ...a0, id: 'two' }])))
    problems.push('api:widenedAction');
  if (!widened(withActions([{ ...a0, path: '/v2/push' }]))) problems.push('api:widenedPath');
  if (!widened(withActions([{ ...a0, body: { room: '{room}' } }])))
    problems.push('api:widenedBody');
  if (!widened(withActions([{ ...a0, body: undefined }]))) problems.push('api:widenedBodyDropped');
  if (!widened(withActions([{ ...a0, insertResultLink: 'link' }])))
    problems.push('api:widenedLinkField');
  if (!widened(withActions([{ ...a0, label: 'Other' }]))) problems.push('api:widenedLabel');
  if (widened(withActions([{ ...a0, body: { text: '{text}', room: '{room}' } }])))
    problems.push('api:widenedKeyOrder');
  if (widened({ ...p, api: undefined })) problems.push('api:removalIsNarrowing');
  if (!widened({ ...p, commands: [...cmds, { name: 'more', description: 'm', insert: 'x' }] }))
    problems.push('commands:widenedNew');
  if (!widened({ ...p, commands: [{ ...cmds[0], description: 'Changed' }, ...cmds.slice(1)] }))
    problems.push('commands:widenedDescription');
  if (
    !widened({
      ...p,
      commands: [{ ...cmds[0], insert: 'https://evil.example/{args}' }, ...cmds.slice(1)],
    })
  )
    problems.push('commands:widenedInsert');
  if (!widened({ ...p, commands: [{ ...cmds[0], usage: '/send changed' }, ...cmds.slice(1)] }))
    problems.push('commands:widenedUsage');
  if (!widened({ ...p, commands: [cmds[0], { ...cmds[1], api: 'other' }] }))
    problems.push('commands:widenedApiTarget');
  if (widened({ ...p, commands: cmds.slice(0, 1) })) problems.push('commands:removalIsNarrowing');
  if (!permissionsWidened({ linkCards: p.linkCards }, p)) problems.push('commands:widenedFromNone');
}

function checkApiAndCommands(problems: string[]) {
  const parsed = validateManifest(
    withPerms({
      api: api(),
      linkCards: [{ hosts: ['api.example.com'], title: 'T' }],
      commands: [cmd(), apiCmd(), cmd({ name: 'kick', usage: undefined })],
    })
  );
  if (!parsed.ok) {
    problems.push('api:setup');
    return;
  }
  const p = parsed.value.integrations[0].permissions;
  const a0 = p.api!.actions[0];
  const inst = [installedOf('one', p)];
  const all = { one: { api: true, commands: true } };
  checkWidening({ ...p, commands: p.commands!.slice(0, 2) }, problems);

  // matching
  const apiActions = getApiActions(inst, all);
  if (apiActions.length !== 1 || apiActions[0].host !== 'api.example.com')
    problems.push('getApiActions:hit');
  if (getApiActions(inst, { one: { api: false } }).length) problems.push('getApiActions:revoked');
  if (getApiActions([installedOf('one', p, false)], all).length)
    problems.push('getApiActions:disabled');
  if (getApiActions(inst, { one: { commands: true } }).length)
    problems.push('getApiActions:noGrant');

  const reserved = new Set(['kick', 'ban']);
  const found = getCommands(inst, all, reserved);
  if (found.map((c) => c.name).join() !== 'send,push') problems.push('getCommands:reservedDropped');
  if (found.map((c) => c.kind).join() !== 'insert,api') problems.push('getCommands:kinds');
  if (
    getCommands(inst, { one: { commands: true } }, reserved)
      .map((c) => c.name)
      .join() !== 'send'
  )
    problems.push('getCommands:apiNeedsApiGrant');
  if (getCommands(inst, { one: { api: true } }, reserved).length)
    problems.push('getCommands:noGrant');
  const grants2 = { ...all, two: all.one };
  const dup = getCommands([installedOf('one', p), installedOf('two', p)], grants2, reserved);
  if (dup.length !== 2 || dup.some((c) => c.integrationId !== 'one'))
    problems.push('getCommands:firstWins');
  const skip = getCommands(
    [installedOf('one', p, false), installedOf('two', p)],
    grants2,
    reserved
  );
  if (skip.length !== 2 || skip.some((c) => c.integrationId !== 'two'))
    problems.push('getCommands:disabledDoesNotShadow');

  // renderInsert
  const tpl = 'https://x.example/s?room={room}&q={args}';
  if (renderInsert(tpl, '!a:b.c', 'hi there') !== 'https://x.example/s?room=!a%3Ab.c&q=hi there')
    problems.push('render:basic');
  if (renderInsert('{args}', 'r', 'a\nb‮c') !== 'abc') problems.push('render:stripped');
  if (renderInsert('{args}', 'r', 'x'.repeat(600)).length !== 500) problems.push('render:capped');
  if (renderInsert('{args}', 'r', '{room}') !== '{room}') problems.push('render:noReexpand');

  // previewApiRequest
  const ctx = { roomId: '!r:x.org', text: '', args: '' };
  const nasty = 'say "hi"\nline2 \\ {room} {"a":1}';
  const prev = previewApiRequest({ permissions: p }, a0, { ...ctx, text: nasty });
  if (!prev.ok) problems.push('preview:ok');
  else {
    const body = JSON.parse(prev.body ?? 'null') as Record<string, string>;
    if (body.text !== nasty || body.room !== '!r:x.org') problems.push('preview:roundTrip');
    if (Object.keys(body).length !== 2) problems.push('preview:keys');
    if (prev.body?.includes('\n')) problems.push('preview:rawNewline');
    if (prev.url !== 'https://api.example.com/v1/push' || prev.host !== 'api.example.com')
      problems.push('preview:url');
    if (prev.path !== '/v1/push') problems.push('preview:path');
  }
  if (previewApiRequest({ permissions: p }, a0, { ...ctx, text: 'x'.repeat(9000) }).ok)
    problems.push('preview:tooBig');
  const nobody = previewApiRequest({ permissions: p }, { ...a0, body: undefined }, ctx);
  if (!nobody.ok || nobody.body !== null) problems.push('preview:noBody');
  if (previewApiRequest({ permissions: {} }, a0, ctx).ok) problems.push('preview:noApi');
}
