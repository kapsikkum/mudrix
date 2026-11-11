import { useMemo } from 'react';
import type { RoomSettings, SpaceNode, WizardClient } from '@wizardchat/core';
import { useSpaceGraph, useUserId } from '@/app/data';
import { getRoomCreators } from '@/app/features/room/memberRoles';
import { findParentSpaceId } from '@/util/matrix';
import { mudrixKey } from '@/util/namespace';
import { setMudrixRoomState, useMudrixRoomStates, type MudrixRoomState } from './mudrixRoomState';
import type { StateEntry } from './mudrixStateEntries';
import { mayChangeSpace } from './rolesTrust';
import { rootSpaceOf, styleOf } from './spaceListStyle';
import { useLocalRoomSettings } from './useStatePermissions';

/**
 * Space roles: names, colours and badges for people in a space. They are cosmetic. The server only
 * knows power levels, so a role never grants anything; it is a label other members see.
 *
 * - `SPACE_ROLES_STATE_TYPE` (state key ''): the list of roles, in display order.
 * - `SPACE_MEMBER_ROLES_STATE_TYPE` (state key = user id without the `@`): the role ids that person
 *   holds.
 *
 * Roles are part of the Modern room list style: a Matrix style space shows none of them.
 *
 * Both come from untrusted senders, so everything read is validated, and an event only counts when
 * its sender may change the space's state (`rolesTrust.ts`): its creators, or people at the level
 * the space asks for that event type and at least 50.
 */
export const SPACE_ROLES_STATE_TYPE = mudrixKey('space_roles');
export const SPACE_MEMBER_ROLES_STATE_TYPE = mudrixKey('space_member_roles');

/**
 * A person's assignment is stored under their user id without the leading `@`: servers refuse
 * state keys that look like another user's id.
 */
export const memberStateKey = (userId: string) => userId.replace(/^@/, '');

export const MAX_ROLES = 50;
export const MAX_ROLES_PER_MEMBER = 20;
export const MAX_ROLE_NAME = 32;

export interface SpaceRole {
  id: string;
  name: string;
  /** `#rrggbb`, already validated. */
  color?: string;
  /** Members with this role are listed under their own heading. */
  hoist?: boolean;
}

/** The roles every Matrix room already has, by power level. They cannot be removed or moved. */
export const BUILTIN_ROLE_KEYS = ['founder', '100', '50', '0'] as const;
export type BuiltinRoleKey = (typeof BUILTIN_ROLE_KEYS)[number];

/** A look given to a built-in role: its name and colour, both optional. */
export interface BuiltinRoleLook {
  name?: string;
  color?: string;
}

export type BuiltinRoleLooks = Partial<Record<BuiltinRoleKey, BuiltinRoleLook>>;

export interface SpaceRoles {
  builtin: BuiltinRoleLooks;
  roles: SpaceRole[];
  /** Roles per person, in the order of `roles`. */
  byUser: Map<string, SpaceRole[]>;
}

export const NO_ROLES: SpaceRoles = { builtin: {}, roles: [], byUser: new Map() };

const ID_PATTERN = /^[a-z0-9_-]{1,24}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
// Control characters and the invisible direction overrides that can make a name read differently.
/* eslint-disable no-control-regex */
const UNSAFE_CHARS = new RegExp(
  '[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]',
  'g'
);
/* eslint-enable no-control-regex */

export function cleanRoleName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, MAX_ROLE_NAME);
}

export function isValidRoleColor(value: unknown): value is string {
  return typeof value === 'string' && COLOR_PATTERN.test(value);
}

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 12;
const ID_UNBIASED_LIMIT = 256 - (256 % ID_CHARS.length);

/** A fresh role id (fits `ID_PATTERN`), from the browser's secure random source. */
export function newRoleId(): string {
  let id = '';
  while (id.length < ID_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(ID_LENGTH * 2))) {
      if (byte >= ID_UNBIASED_LIMIT) continue;
      id += ID_CHARS[byte % ID_CHARS.length];
      if (id.length === ID_LENGTH) break;
    }
  }
  return id;
}

/** One role from untrusted content, or null when it is not usable. */
function sanitizeRole(raw: unknown): SpaceRole | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID_PATTERN.test(r.id)) return null;
  const name = cleanRoleName(r.name);
  if (!name) return null;
  const role: SpaceRole = { id: r.id, name };
  if (isValidRoleColor(r.color)) role.color = r.color.toLowerCase();
  if (r.hoist === true) role.hoist = true;
  return role;
}

/** Whether the sender of a role event could change the space's state, going by its power levels now. */
function trusted(
  settings: RoomSettings | undefined,
  entry: StateEntry | undefined
): entry is StateEntry {
  return (
    !!entry &&
    !!settings &&
    mayChangeSpace(settings.powerLevels, getRoomCreators(settings), entry.sender, entry.type)
  );
}
function readRoles(state: MudrixRoomState, settings: RoomSettings | undefined): SpaceRoles {
  const rolesEntry = state.entry(SPACE_ROLES_STATE_TYPE);
  if (!trusted(settings, rolesEntry)) return NO_ROLES;
  const content = rolesEntry.content as Record<string, unknown>;
  const list = content?.['roles'];
  const roles: SpaceRole[] = [];
  const seen = new Set<string>();
  if (Array.isArray(list)) {
    for (const raw of list) {
      const role = sanitizeRole(raw);
      if (!role || seen.has(role.id)) continue;
      seen.add(role.id);
      roles.push(role);
      if (roles.length >= MAX_ROLES) break;
    }
  }

  const builtin: BuiltinRoleLooks = {};
  const rawBuiltin = content?.['builtin'];
  if (rawBuiltin && typeof rawBuiltin === 'object') {
    for (const key of BUILTIN_ROLE_KEYS) {
      const entry = (rawBuiltin as Record<string, unknown>)[key];
      if (!entry || typeof entry !== 'object') continue;
      const { name, color } = entry as Record<string, unknown>;
      const look: BuiltinRoleLook = {};
      const clean = cleanRoleName(name);
      if (clean) look.name = clean;
      if (isValidRoleColor(color)) look.color = color.toLowerCase();
      if (look.name || look.color) builtin[key] = look;
    }
  }

  const byUser = new Map<string, SpaceRole[]>();
  if (roles.length > 0) {
    const order = new Map(roles.map((role, i) => [role.id, i]));
    for (const member of state.allEntries(SPACE_MEMBER_ROLES_STATE_TYPE)) {
      const key = member.stateKey;
      const assigned = member.content as Record<string, unknown>;
      if (!key || !trusted(settings, member)) continue;
      const ids = assigned['roles'];
      if (!Array.isArray(ids)) continue;
      const held = new Set<number>();
      for (const id of ids.slice(0, MAX_ROLES_PER_MEMBER)) {
        const at = typeof id === 'string' ? order.get(id) : undefined;
        if (at !== undefined) held.add(at);
      }
      if (held.size > 0) {
        byUser.set(
          `@${key}`,
          [...held].sort((a, b) => a - b).map((i) => roles[i])
        );
      }
    }
  }
  return { builtin, roles, byUser };
}

/** The spaces from `roomId` upward (itself when it is a space), nearest first; at most six deep. */
export function rolesChainOf(graph: SpaceNode[], roomId: string | null | undefined): string[] {
  if (!roomId) return [];
  const chain: string[] = [];
  let at: string | null = graph.some((s) => s.spaceId === roomId)
    ? roomId
    : findParentSpaceId(roomId, graph);
  while (at && chain.length < 6 && !chain.includes(at)) {
    chain.push(at);
    at = findParentSpaceId(at, graph);
  }
  return chain;
}

/**
 * The roles in effect for a room: the nearest space around it (itself, its category, the space
 * above that) that has roles set up. A room in a category uses the roles of the space the category
 * is in. A space that is not Modern has none.
 */
export function useRoomRoles(roomId: string | null | undefined): SpaceRoles {
  const graph = useSpaceGraph();
  const chain = useMemo(() => rolesChainOf(graph, roomId), [graph, roomId]);
  const root = chain.length > 0 ? rootSpaceOf(graph, chain[0]) : null;
  const states = useMudrixRoomStates(root ? [root, ...chain] : []);
  const settings = useLocalRoomSettings(chain);
  const modern = styleOf(root ? states.get(root) : null) === 'modern';
  return useMemo(() => {
    if (!modern) return NO_ROLES;
    for (const spaceId of chain) {
      const state = states.get(spaceId);
      if (!state) continue;
      const found = readRoles(state, settings.get(spaceId));
      if (found.roles.length > 0 || Object.keys(found.builtin).length > 0) return found;
    }
    return NO_ROLES;
  }, [modern, chain, states, settings]);
}

/** The roles a space itself defines (what the Roles tab edits), kept current. */
export function useSpaceMemberRoles(spaceId: string | null | undefined): SpaceRoles {
  const graph = useSpaceGraph();
  const root = spaceId ? rootSpaceOf(graph, spaceId) : null;
  const ids = useMemo(() => (spaceId ? [spaceId] : []), [spaceId]);
  const states = useMudrixRoomStates(root && spaceId ? [...new Set([root, spaceId])] : []);
  const settings = useLocalRoomSettings(ids);
  return useMemo(() => {
    const state = spaceId ? states.get(spaceId) : undefined;
    if (!spaceId || !state) return NO_ROLES;
    return readRoles(state, settings.get(spaceId));
  }, [spaceId, states, settings]);
}

/** Which built-in role someone is in this room, from their power level. */
export function builtinKeyOf(
  settings: RoomSettings | null | undefined,
  userId: string,
  powerLevel: number
): BuiltinRoleKey {
  if (getRoomCreators(settings).has(userId)) return 'founder';
  if (powerLevel >= 100) return '100';
  return powerLevel >= 50 ? '50' : '0';
}

/**
 * The colour to show for someone: their Admin/Moderator look first, then their own roles from the
 * top of the list, then the plain Member look. Founders fall back to the Admin look.
 */
export function roleColorOf(
  roles: SpaceRoles,
  userId: string,
  builtinKey: BuiltinRoleKey = '0'
): string | undefined {
  let high: string | undefined;
  if (builtinKey === 'founder') high = roles.builtin.founder?.color ?? roles.builtin['100']?.color;
  else if (builtinKey !== '0') high = roles.builtin[builtinKey]?.color;
  return (
    high ?? roles.byUser.get(userId)?.find((role) => role.color)?.color ?? roles.builtin['0']?.color
  );
}

// --- writing ----------------------------------------------------------------------------------

export function saveSpaceRoles(
  client: WizardClient,
  spaceId: string,
  roles: SpaceRole[],
  builtin: BuiltinRoleLooks
): Promise<void> {
  return setMudrixRoomState(client, spaceId, SPACE_ROLES_STATE_TYPE, {
    roles: roles.slice(0, MAX_ROLES),
    builtin,
  });
}

export function saveMemberRoles(
  client: WizardClient,
  spaceId: string,
  userId: string,
  roleIds: string[]
): Promise<void> {
  return setMudrixRoomState(
    client,
    spaceId,
    SPACE_MEMBER_ROLES_STATE_TYPE,
    { roles: roleIds.slice(0, MAX_ROLES_PER_MEMBER) },
    memberStateKey(userId)
  );
}

/** Member updates sent at once when a role is deleted: enough to be quick, not a flood. */
const DELETE_PARALLEL = 4;

/** Thrown when the role is gone but some people's assignments could not be updated. */
export class RoleCleanupError extends Error {
  readonly failed: string[];
  readonly total: number;
  readonly firstError: unknown;

  constructor(failed: string[], total: number, firstError: unknown) {
    super(`${failed.length} of ${total} member updates failed`);
    this.name = 'RoleCleanupError';
    this.failed = failed;
    this.total = total;
    this.firstError = firstError;
  }
}

/**
 * Removes a role and takes it off everyone who held it. The role list goes first: once the role is
 * gone, a leftover assignment refers to nothing and is ignored, so failures there are only untidy.
 */
export async function deleteSpaceRole(
  client: WizardClient,
  spaceId: string,
  current: SpaceRoles,
  roleId: string
): Promise<void> {
  await saveSpaceRoles(
    client,
    spaceId,
    current.roles.filter((role) => role.id !== roleId),
    current.builtin
  );
  const queue = [...current.byUser].filter(([, held]) => held.some((role) => role.id === roleId));
  const total = queue.length;
  const failed: string[] = [];
  let firstError: unknown;
  await Promise.all(
    Array.from({ length: Math.min(DELETE_PARALLEL, total) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [userId, held] = next;
        try {
          await saveMemberRoles(
            client,
            spaceId,
            userId,
            held.filter((role) => role.id !== roleId).map((role) => role.id)
          );
        } catch (err) {
          failed.push(userId);
          firstError ??= err;
        }
      }
    })
  );
  if (failed.length > 0) throw new RoleCleanupError(failed, total, firstError);
}

/**
 * Whether you may create and assign roles in this space: you must be someone whose roles would
 * count (both kinds of state, at level 50 or up).
 */
export function useCanManageRoles(spaceId: string | null | undefined): boolean {
  const userId = useUserId();
  const ids = useMemo(() => (spaceId ? [spaceId] : []), [spaceId]);
  const settings = useLocalRoomSettings(ids).get(spaceId ?? '');
  if (!settings) return false;
  const creators = getRoomCreators(settings);
  return (
    mayChangeSpace(settings.powerLevels, creators, userId, SPACE_ROLES_STATE_TYPE) &&
    mayChangeSpace(settings.powerLevels, creators, userId, SPACE_MEMBER_ROLES_STATE_TYPE)
  );
}
