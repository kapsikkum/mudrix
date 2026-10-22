import { EventType, JoinRule } from 'matrix-js-sdk';
import { EventTimeline } from 'matrix-js-sdk/lib/models/event-timeline';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';

export function getMemberDisplayName(
  userId: string,
  client: MatrixClient,
  roomId?: string
): string {
  if (roomId) {
    const room = client.getRoom(roomId);
    const member = room?.getMember(userId);
    if (member?.name) return member.name;
  }
  const user = client.getUser(userId);
  return user?.displayName || formatUserId(userId);
}

export function getDmPartnerId(room: Room, client: MatrixClient): string | null {
  const dmData = client.getAccountData(EventType.Direct)?.getContent<Record<string, string[]>>();
  if (dmData) {
    for (const [userId, roomIds] of Object.entries(dmData)) {
      if (roomIds.includes(room.roomId)) return userId;
    }
  }
  return room.getDMInviter() ?? null;
}

export function isDmRoom(room: Room, client: MatrixClient): boolean {
  return getDmPartnerId(room, client) !== null;
}

export function isSpace(room: Room): boolean {
  return room.isSpaceRoom();
}

function getViaServers(
  roomIdOrAlias: string | null | undefined,
  homeDomain: string | null | undefined
): string[] {
  if (!roomIdOrAlias) return [];
  if (!roomIdOrAlias.startsWith('!') && !roomIdOrAlias.startsWith('#')) return [];
  const server = roomIdOrAlias.split(':').slice(1).join(':').toLowerCase();
  return server && server !== homeDomain?.toLowerCase() ? [server] : [];
}

export function viaServersFor(
  roomIdOrAlias: string | null | undefined,
  homeDomain: string | null | undefined
) {
  return { viaServers: getViaServers(roomIdOrAlias, homeDomain) };
}

function parseMatrixPermalink(input: string): {
  roomIdOrAlias: string;
  viaServers: string[];
} | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let raw: string;
  if (trimmed.startsWith('matrix:')) {
    raw = trimmed.slice('matrix:'.length).replace(/^[^/]+\//, '');
  } else {
    let path: string;
    try {
      const url = new URL(trimmed);
      if (!/(^|\.)matrix\.to$/.test(url.hostname)) return null;
      path = url.hash.replace(/^#\/?/, '');
    } catch {
      if (!trimmed.startsWith('#/')) return null;
      path = trimmed.slice('#/'.length);
    }
    if (!path) return null;
    raw = path;
  }

  const queryIndex = raw.indexOf('?');
  const roomIdOrAlias = (queryIndex === -1 ? raw : raw.slice(0, queryIndex)).trim();
  if (!roomIdOrAlias.startsWith('!') && !roomIdOrAlias.startsWith('#')) return null;

  const viaServers =
    queryIndex === -1
      ? []
      : raw
          .slice(queryIndex + 1)
          .split('&')
          .map((p) => p.replace(/^via=/, '').trim())
          .filter((p) => p && p !== 'via');

  return { roomIdOrAlias, viaServers };
}

export function normalizeJoinTarget(input: string): {
  roomIdOrAlias: string;
  viaServers: string[];
} | null {
  const trimmed = input.trim();
  const permalink = parseMatrixPermalink(trimmed);
  if (permalink) return permalink;
  if (!trimmed.startsWith('!') && !trimmed.startsWith('#')) return null;
  return { roomIdOrAlias: trimmed, viaServers: [] };
}

export function isPrivateRoom(room: Room, client: MatrixClient): boolean {
  if (isSpace(room)) return false;
  if (isDmRoom(room, client)) return true;
  const joinRule = getStateEventContent(room, EventType.RoomJoinRules).join_rule;
  return joinRuleToAccess(typeof joinRule === 'string' ? joinRule : JoinRule.Invite) !== 'public';
}

export function makeRoomPermalink(room: Room): string {
  const alias = room.getCanonicalAlias();
  if (alias) return `https://matrix.to/#/${alias}`;
  const server = room.roomId.startsWith('!') ? room.roomId.split(':').slice(1).join(':') : '';
  return `https://matrix.to/#/${room.roomId}${server ? `?via=${server}` : ''}`;
}

export function makeUserPermalink(userId: string): string {
  return `https://matrix.to/#/${userId}`;
}

export function makeEventPermalink(roomId: string, eventId: string): string {
  const server = roomId.startsWith('!') ? roomId.split(':').slice(1).join(':') : '';
  return `https://matrix.to/#/${roomId}/${eventId}${server ? `?via=${server}` : ''}`;
}

const VOICE_ROOM_TYPES = new Set(['org.matrix.msc3401.call', 'org.matrix.msc3417.call']);
const VOICE_ROOM_STATE_TYPE = 'org.matrix.msc3401.call';

export function isVoiceRoom(room: Room | null | undefined): boolean {
  if (!room) return false;
  const type = room.getType?.();
  if (typeof type === 'string' && VOICE_ROOM_TYPES.has(type)) return true;
  return !!roomState(room).getStateEvents(VOICE_ROOM_STATE_TYPE, '');
}

export function formatUserId(userId: string | null | undefined): string {
  if (!userId) return '';
  return userId.split(':')[0].substring(1);
}

export function getStateEventContent(room: Room | null, type: string): Record<string, unknown> {
  return (
    room
      ?.getLiveTimeline()
      .getState(EventTimeline.FORWARDS)
      ?.getStateEvents(type, '')
      ?.getContent<Record<string, unknown>>() ?? {}
  );
}

export function roomState(room: Room) {
  return room.getLiveTimeline().getState(EventTimeline.FORWARDS)!;
}

export function roomStateMaybe(room: Room | null | undefined) {
  return room?.getLiveTimeline().getState(EventTimeline.FORWARDS);
}

export function getSingleStateEvent(room: Room, type: string): MatrixEvent | null {
  const events = roomStateMaybe(room)?.getStateEvents(type, '');
  if (!events) return null;
  if (Array.isArray(events)) return events[0] ?? null;
  return events;
}

export function getSpaceChildEvents(space: Room | null | undefined): MatrixEvent[] {
  const events = roomStateMaybe(space)?.getStateEvents('m.space.child') ?? [];
  return events.filter((event) => {
    const via = event.getContent()?.via;
    return Array.isArray(via) && via.length > 0;
  });
}

export function isChildOfSpace(roomId: string, spaceId: string, client: MatrixClient): boolean {
  const space = client.getRoom(spaceId);
  if (!space) return false;
  if (!isJoinedSpace(space)) return false;
  return getSpaceChildEvents(space).some((e) => e.getStateKey() === roomId) ?? false;
}

function isJoinedSpace(space: Room): boolean {
  return space.getMyMembership() === 'join';
}

export function findParentSpaceId(roomId: string, client: MatrixClient): string | null {
  for (const space of client.getRooms()) {
    if (!space.isSpaceRoom()) continue;
    if (!isJoinedSpace(space)) continue;
    const isChild = getSpaceChildEvents(space).some((e) => e.getStateKey() === roomId) ?? false;
    if (isChild) return space.roomId;
  }
  return null;
}

export function joinRuleToAccess(rule: string): 'invite' | 'restricted' | 'public' | 'knock' {
  if (rule === JoinRule.Public) return 'public';
  if (rule === 'restricted' || rule === 'knock_restricted') return 'restricted';
  if (rule === 'knock') return 'knock';
  return 'invite';
}
