import type { RoomSettings, SpaceNode, WizardClient } from '@wizardchat/core';
import { canSendState } from '@/app/data';
import {
  getSpaceChildOrders,
  planSpaceReorder,
  saveSpaceChildOrders,
} from '@/app/features/room/roomOrder';

const SPACE_CHILD = 'm.space.child';

/** Whether the signed-in user may rearrange (send `m.space.child` in) this space. */
export function canOrderSpace(settings: RoomSettings | undefined, userId: string): boolean {
  return canSendState(settings, userId, SPACE_CHILD);
}

/** Writes the `order` the children of `space` need to read as `orderedIds`, after `movedId` moved. */
export function saveSpaceChildrenOrder(
  client: WizardClient,
  space: SpaceNode | undefined,
  orderedIds: string[],
  movedId: string
): Promise<void> {
  if (!space) return Promise.resolve();
  const updates = planSpaceReorder(orderedIds, getSpaceChildOrders(space), movedId);
  return saveSpaceChildOrders(client, space.spaceId, updates);
}

/**
 * Puts `childId` at position `to` among `siblingIds` (the children as the user sees them) and
 * rewrites the `order` of the children that need it, the way the room list does for a drag.
 */
export async function placeSpaceChild(
  client: WizardClient,
  space: SpaceNode | undefined,
  siblingIds: string[],
  childId: string,
  to: number
): Promise<void> {
  const from = siblingIds.indexOf(childId);
  if (!space || from === -1 || from === to || to < 0 || to >= siblingIds.length) return;
  const next = [...siblingIds];
  next.splice(from, 1);
  next.splice(to, 0, childId);
  await saveSpaceChildrenOrder(client, space, next, childId);
}

/** Moves `childId` one place within `siblingIds`. */
export function moveSpaceChild(
  client: WizardClient,
  space: SpaceNode | undefined,
  siblingIds: string[],
  childId: string,
  delta: -1 | 1
): Promise<void> {
  return placeSpaceChild(client, space, siblingIds, childId, siblingIds.indexOf(childId) + delta);
}

/** The rooms whose members a restricted join rule lets in. */
function allowedSpaces(settings: RoomSettings | undefined): string[] {
  return settings?.joinRule === 'restricted' || settings?.joinRule === 'knock_restricted'
    ? settings.joinAllowedSpaces
    : [];
}

/**
 * Whether putting a room that follows `from` under `to` would let in people who could not get in
 * before. Moving a room never does that by itself: a room out of a private category stays as
 * private as it was.
 */
function widensAccess(from: RoomSettings | undefined, to: RoomSettings | undefined): boolean {
  if (!from || !to) return true;
  if (to.joinRule === 'invite') return false;
  if (from.joinRule === 'public') return false;
  if (to.joinRule === 'public') return true;
  const before = new Set([from.roomId, ...allowedSpaces(from)]);
  return !allowedSpaces(to).every((id) => before.has(id));
}

/**
 * Moves a room from one category (a sub-space, or the space itself) to another, the way Matrix
 * expresses space membership: listed in the target, naming the target as its parent, and removed
 * from the source. A room that is restricted to its old category follows the move so the new
 * category's members can join it, unless that would open it to more people than before.
 *
 * The target is added to before the source is taken away from, so a failure never loses the room,
 * and the room's own state is only touched where the user has the power for it.
 */
export async function moveRoomToCategory(
  client: WizardClient,
  graph: SpaceNode[],
  roomId: string,
  fromSpaceId: string,
  toSpaceId: string
): Promise<void> {
  if (fromSpaceId === toSpaceId) return;
  const link = graph
    .find((s) => s.spaceId === fromSpaceId)
    ?.children.find((c) => c.roomId === roomId);
  await client.addToSpace(toSpaceId, roomId, link?.suggested ?? false);
  // Right away, so the room doesn't sit in both categories while its own state is updated.
  await client.removeFromSpace(fromSpaceId, roomId);

  const [room, from, to] = await Promise.all([
    client.roomSettings(roomId).catch(() => undefined),
    client.roomSettings(fromSpaceId).catch(() => undefined),
    client.roomSettings(toSpaceId).catch(() => undefined),
  ]);
  if (!room || !allowedSpaces(room).includes(fromSpaceId)) return;
  if (!canSendState(room, client.userId() ?? '', 'm.room.join_rules') || widensAccess(from, to))
    return;
  // Best effort: the room stays joinable by its old category when this fails.
  const allow = [
    ...room.joinAllowedSpaces.filter((id) => id !== fromSpaceId && id !== toSpaceId),
    toSpaceId,
  ];
  await client.setJoinRule(roomId, room.joinRule, allow).catch(() => undefined);
}
