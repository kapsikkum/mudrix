import type { WizardClient as MatrixClient } from '@wizardchat/core';

export type PushRuleKind = 'override' | 'underride' | 'content' | 'room' | 'sender';

export type PushRuleAction = string | { set_tweak: string; value?: unknown };

export interface PushRule {
  rule_id: string;
  enabled: boolean;
  default?: boolean;
  actions?: PushRuleAction[];
  pattern?: string;
}

/** The account's global push rules, as returned by `client.pushRules()` */
export type PushRules = Partial<Record<PushRuleKind, PushRule[]>>;

export type NotifRowLevel = 'off' | 'on' | 'noisy';

export interface ManagedRule {
  ruleId: string;
  kind: PushRuleKind;
}

const USER_MENTION_RULES: ManagedRule[] = [{ ruleId: '.m.rule.is_user_mention', kind: 'override' }];

const DISPLAY_NAME_RULES: ManagedRule[] = [
  { ruleId: '.m.rule.contains_display_name', kind: 'override' },
];

const ROOM_MENTION_RULES: ManagedRule[] = [{ ruleId: '.m.rule.is_room_mention', kind: 'override' }];

const ROOM_NOTIF_RULES: ManagedRule[] = [{ ruleId: '.m.rule.roomnotif', kind: 'override' }];

const CONTAINS_USER_NAME_RULES: ManagedRule[] = [
  { ruleId: '.m.rule.contains_user_name', kind: 'content' },
];

export const DM_RULES: ManagedRule[] = [
  { ruleId: '.m.rule.room_one_to_one', kind: 'underride' },
  { ruleId: '.m.rule.encrypted_room_one_to_one', kind: 'underride' },
];

export const ROOM_RULES: ManagedRule[] = [
  { ruleId: '.m.rule.message', kind: 'underride' },
  { ruleId: '.m.rule.encrypted', kind: 'underride' },
];

const rulesOfKind = (rules: PushRules, kind: PushRuleKind): PushRule[] => rules[kind] ?? [];

const findManagedRule = (rules: PushRules, managed: ManagedRule): PushRule | undefined =>
  rulesOfKind(rules, managed.kind).find((r) => r.rule_id === managed.ruleId);

function isMutedActions(actions: PushRuleAction[] | undefined): boolean {
  return !actions?.length || actions.includes('dont_notify');
}

function isSoundTweak(action: PushRuleAction): boolean {
  return typeof action === 'object' && action !== null && action.set_tweak === 'sound';
}

function hasSoundTweak(actions: PushRuleAction[] | undefined): boolean {
  return (actions ?? []).some(isSoundTweak);
}

export function deriveRowLevel(
  rules: PushRules | undefined,
  managed: ManagedRule[]
): NotifRowLevel {
  if (!rules) return 'on';

  const present = managed.map((m) => findManagedRule(rules, m)).filter((r): r is PushRule => !!r);

  const audible = present.filter((r) => r.enabled && !isMutedActions(r.actions));
  if (audible.length === 0) return 'off';

  const anySound = audible.some((r) => hasSoundTweak(r.actions));
  return anySound ? 'noisy' : 'on';
}

const CORE_LEVELS: Record<NotifRowLevel, string> = { off: 'off', on: 'silent', noisy: 'loud' };

export async function setRowLevel(
  client: MatrixClient,
  rules: PushRules,
  managed: ManagedRule[],
  level: NotifRowLevel
): Promise<void> {
  for (const m of managed) {
    if (!findManagedRule(rules, m)) continue;
    await client.setPushRuleLevel(m.kind, m.ruleId, CORE_LEVELS[level]);
  }
}

export function getUserMentionRules(rules: PushRules | undefined): ManagedRule[] {
  if (!rules) return [];
  return [...USER_MENTION_RULES, ...DISPLAY_NAME_RULES, ...CONTAINS_USER_NAME_RULES].filter((m) =>
    findManagedRule(rules, m)
  );
}

export function getRoomMentionRules(rules: PushRules | undefined): ManagedRule[] {
  if (!rules) return [];
  return [...ROOM_MENTION_RULES, ...ROOM_NOTIF_RULES].filter((m) => findManagedRule(rules, m));
}

export function listKeywordRules(rules: PushRules | undefined): PushRule[] {
  if (!rules) return [];
  return rulesOfKind(rules, 'content').filter((r) => !r.rule_id.startsWith('.'));
}

export const normalizeKeyword = (keyword: string): string => keyword.trim();

export async function addKeywordRule(client: MatrixClient, keyword: string): Promise<void> {
  await client.addNotificationKeyword(keyword);
}

export async function removeKeywordRule(client: MatrixClient, keyword: string): Promise<void> {
  await client.removeNotificationKeyword(keyword);
}
