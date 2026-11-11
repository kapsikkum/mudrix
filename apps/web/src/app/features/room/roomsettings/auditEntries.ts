import type { TimelineEntry } from '@wizardchat/core';
import { formatUserId } from '@/util/matrix';
import { mudrixKey, typeAndLegacy } from '@/util/namespace';
import type { StateEntry } from '@/app/features/space/mudrixStateEntries';

/**
 * A readable "who changed what" list built from a room's timeline: the core hands over members
 * joining and leaving, power levels, names, topics, rules and (for a space) its rooms as events.
 * Mudrix's own state (roles) is not in the timeline: role changes come from the state store.
 */

export type AuditCategory = 'members' | 'permissions' | 'settings' | 'rooms' | 'roles';

export const AUDIT_CATEGORIES: AuditCategory[] = [
  'members',
  'permissions',
  'settings',
  'rooms',
  'roles',
];

/** What happened, as a translation key under `room.settings.auditLog.action` plus its values. */
export interface AuditEntry {
  id: string;
  ts: number;
  category: AuditCategory;
  actor: string;
  /** Key below `room.settings.auditLog.action.` */
  action: string;
  values: Record<string, string>;
}

type Part = Omit<AuditEntry, 'id' | 'ts' | 'actor'>;
type Content = Record<string, unknown>;

type Event = Extract<TimelineEntry, { kind: 'event' }>;

const asRecord = (v: unknown): Content =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Content) : {};

/** "Admin", "Moderator", "Member" as a key suffix, or just the number. */
export function levelValue(level: number): { key: string | null; level: string } {
  if (level >= 100) return { key: 'admin', level: String(level) };
  if (level >= 50) return { key: 'moderator', level: String(level) };
  if (level <= 0) return { key: 'member', level: String(level) };
  return { key: null, level: String(level) };
}

/** The membership change codes of the core, as audit actions. */
const MEMBERSHIP_ACTIONS: Record<string, string> = {
  Joined: 'joined',
  InvitationAccepted: 'joined',
  Left: 'left',
  Invited: 'invited',
  KnockAccepted: 'invited',
  Banned: 'banned',
  KickedAndBanned: 'banned',
  Unbanned: 'unbanned',
  Kicked: 'kicked',
  InvitationRejected: 'inviteDeclined',
  InvitationRevoked: 'inviteRevoked',
  Knocked: 'knocked',
  KnockRetracted: 'knockCancelled',
  KnockDenied: 'knockDenied',
};

function powerParts(content: Content, prev: Content | null, nameOf: (id: string) => string) {
  const out: Part[] = [];
  if (!prev) return [{ category: 'permissions', action: 'permissionsChanged', values: {} } as Part];
  const now = asRecord(content.users);
  const before = asRecord(prev.users);
  for (const userId of new Set([...Object.keys(now), ...Object.keys(before)])) {
    const from = typeof before[userId] === 'number' ? (before[userId] as number) : 0;
    const to = typeof now[userId] === 'number' ? (now[userId] as number) : 0;
    if (from === to) continue;
    out.push({
      category: 'permissions',
      action: 'powerChanged',
      values: { target: nameOf(userId), from: String(from), to: String(to) },
    });
  }
  // Something other than a person's level changed (who may do what).
  const rest = (c: Content) => {
    const others = { ...c };
    delete others.users;
    return JSON.stringify(others);
  };
  if (rest(content) !== rest(prev)) {
    out.push({ category: 'permissions', action: 'permissionsChanged', values: {} });
  }
  return out;
}

function stateParts(
  event: Event & { content: { type: 'state' } },
  nameOf: (id: string) => string,
  roomName: (id: string) => string
): Part[] {
  const { eventType, stateKey } = event.content;
  const content = asRecord(event.content.content);
  const prevRaw = event.content.prevContent;
  const prev = prevRaw && typeof prevRaw === 'object' ? asRecord(prevRaw) : null;
  const single = (category: AuditCategory, action: string, values: Record<string, string> = {}) => [
    { category, action, values },
  ];
  switch (eventType) {
    case 'm.room.power_levels':
      return powerParts(content, prev, nameOf);
    case 'm.room.name':
      return content.name
        ? single('settings', 'renamed', { name: String(content.name) })
        : single('settings', 'nameRemoved');
    case 'm.room.topic':
      return single('settings', 'topicChanged');
    case 'm.room.avatar':
      return single('settings', content.url ? 'avatarChanged' : 'avatarRemoved');
    case 'm.room.join_rules':
      return content.join_rule !== prev?.join_rule
        ? single('settings', 'joinRulesChanged', { rule: String(content.join_rule ?? '') })
        : [];
    case 'm.room.history_visibility':
      return content.history_visibility !== prev?.history_visibility
        ? single('settings', 'historyChanged')
        : [];
    case 'm.room.encryption':
      return single('settings', 'encryptionOn');
    case 'm.room.canonical_alias':
      return single('settings', 'aliasChanged');
    case 'm.room.tombstone':
      return single('settings', 'upgraded');
    case 'm.space.child': {
      const added = Array.isArray(content.via) && content.via.length > 0;
      const wasThere = prev ? Array.isArray(prev.via) && prev.via.length > 0 : null;
      // A suggested or order tweak is not worth a line
      if (wasThere === added) return [];
      return single('rooms', added ? 'roomAdded' : 'roomRemoved', { room: roomName(stateKey) });
    }
    default:
      return [];
  }
}

/** The entries one timeline event stands for (none for events that aren't worth listing). */
export function auditEntriesFor(event: Event, roomName: (roomId: string) => string): AuditEntry[] {
  const actor = event.senderName || formatUserId(event.sender) || event.sender;
  const nameOf = (userId: string) => formatUserId(userId) || userId;
  let parts: Part[] = [];
  const { content } = event;
  if (content.type === 'membership') {
    const action = content.change ? MEMBERSHIP_ACTIONS[content.change] : undefined;
    if (action) {
      const target = content.displayName || nameOf(content.userId);
      parts = [{ category: 'members', action, values: { target } }];
    }
  } else if (content.type === 'state') {
    parts = stateParts(event as Event & { content: { type: 'state' } }, nameOf, roomName);
  }
  return parts.map((p, i) => ({
    ...p,
    actor,
    id: `${event.id}:${i}`,
    ts: event.timestamp,
  }));
}

/** Every entry in the timeline, newest first. */
export function buildAuditLog(
  entries: readonly TimelineEntry[],
  roomName: (roomId: string) => string
): AuditEntry[] {
  return entries
    .flatMap((e) => (e.kind === 'event' ? auditEntriesFor(e, roomName) : []))
    .sort((a, b) => b.ts - a.ts);
}

const ROLES_TYPES = new Set(typeAndLegacy(mudrixKey('space_roles')));
const MEMBER_ROLES_TYPES = new Set(typeAndLegacy(mudrixKey('space_member_roles')));

/** The entries for role changes seen by the state store (changes of the list, or of a person's roles). */
export function roleAuditEntries(changes: readonly StateEntry[]): AuditEntry[] {
  const out: AuditEntry[] = [];
  for (const change of changes) {
    if (!change.eventId) continue;
    const actor = formatUserId(change.sender) || change.sender;
    const base = { category: 'roles' as const, actor, id: change.eventId, ts: change.ts };
    if (ROLES_TYPES.has(change.type)) {
      out.push({ ...base, action: 'rolesChanged', values: {} });
    } else if (MEMBER_ROLES_TYPES.has(change.type) && change.stateKey) {
      const target = `@${change.stateKey}`;
      out.push({
        ...base,
        action: 'memberRolesChanged',
        values: { target: formatUserId(target) || target },
      });
    }
  }
  return out;
}
