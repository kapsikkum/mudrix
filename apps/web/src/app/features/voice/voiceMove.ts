import type { SpaceNode, WizardClient } from '@wizardchat/core';
import { canSendState } from '@/app/data';
import { legacyTypeOf, mudrixKey } from '@/util/namespace';

/**
 * Matrix call membership belongs to the person who joined, so nobody else can move them. A person
 * who can manage a space asks instead: this event goes into the voice channel the person is in, and
 * their own client checks the request and joins the other channel.
 */
export const VOICE_MOVE_EVENT_TYPE = mudrixKey('voice_move');

export interface VoiceMoveContent {
  user_id: string;
  to_room_id: string;
  /**
   * Shared by the two events (current and legacy type) one move sends, so a client that reads both
   * acts once. Absent from moves sent by older versions, which send only the legacy type.
   */
  move_id?: string;
}

const asContent = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Whether `roomId` agrees that `spaceId` is its parent. A child link alone is one-sided: any admin of
 * a space can list somebody else's room, so the room has to name the space back with an
 * `m.space.parent`, which only people with power in the room can send. A room that predates that
 * (or was moved by someone without power in it) still counts when the sender could have set it.
 */
async function confirmsParent(
  client: WizardClient,
  roomId: string,
  spaceId: string,
  senderId: string
): Promise<boolean> {
  const parent = asContent(await client.stateEvent(roomId, 'm.space.parent', spaceId));
  if (Array.isArray(parent.via) && parent.via.length > 0) return true;
  return canSendState(await client.localRoomSettings(roomId), senderId, 'm.space.parent');
}

/**
 * The spaces above `roomId`, as far as we know them, following only links both sides agree on and
 * only through spaces we are in (the graph holds just those).
 */
export async function ancestorSpaces(
  client: WizardClient,
  graph: readonly SpaceNode[],
  roomId: string,
  senderId: string
): Promise<Set<string>> {
  const found = new Set<string>();
  const queue = [roomId];
  while (queue.length > 0) {
    const child = queue.pop()!;
    for (const space of graph) {
      if (found.has(space.spaceId) || !space.children.some((c) => c.roomId === child)) continue;
      if (await confirmsParent(client, child, space.spaceId, senderId).catch(() => false)) {
        found.add(space.spaceId);
        queue.push(space.spaceId);
      }
    }
  }
  return found;
}

/**
 * Whether `userId` is in, and manages (can edit the children of), a space that contains both
 * channels.
 */
export async function mayMoveBetween(
  client: WizardClient,
  graph: readonly SpaceNode[],
  userId: string,
  fromRoomId: string,
  toRoomId: string
): Promise<boolean> {
  if (fromRoomId === toRoomId) return false;
  const above = await ancestorSpaces(client, graph, toRoomId, userId);
  for (const spaceId of await ancestorSpaces(client, graph, fromRoomId, userId)) {
    if (!above.has(spaceId)) continue;
    const settings = await client.localRoomSettings(spaceId).catch(() => null);
    if (!canSendState(settings ?? undefined, userId, 'm.space.child')) continue;
    // Power levels outlive membership: someone who left the space no longer manages it.
    const members = await client.members(spaceId).catch(() => []);
    if (members.some((m) => m.userId === userId && !m.isInvite)) return true;
  }
  return false;
}

/**
 * The spaces above a channel that the signed in person can manage, from what is already known
 * (no requests): the channel can be a drop target for people dragged out of another channel in
 * the same space. `manageable` holds the spaces where they may edit the children.
 */
export function manageableAncestors(
  graph: readonly SpaceNode[],
  manageable: ReadonlySet<string>,
  roomId: string
): Set<string> {
  const found = new Set<string>();
  const queue = [roomId];
  while (queue.length > 0) {
    const child = queue.pop()!;
    for (const space of graph) {
      if (found.has(space.spaceId) || !space.children.some((c) => c.roomId === child)) continue;
      found.add(space.spaceId);
      queue.push(space.spaceId);
    }
  }
  return new Set([...found].filter((id) => manageable.has(id)));
}

export async function moveVoiceUser(
  client: WizardClient,
  fromRoomId: string,
  userId: string,
  toRoomId: string
): Promise<void> {
  const content: VoiceMoveContent = {
    user_id: userId,
    to_room_id: toRoomId,
    move_id: crypto.randomUUID(),
  };
  await client.sendEvent(fromRoomId, VOICE_MOVE_EVENT_TYPE, content as never);
  // Clients that have not updated only listen for the old name.
  await client
    .sendEvent(fromRoomId, legacyTypeOf(VOICE_MOVE_EVENT_TYPE), content as never)
    .catch(() => {});
}
