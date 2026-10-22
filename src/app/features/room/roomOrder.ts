import { EventType, type MatrixClient, type Room } from 'matrix-js-sdk';
import { roomState, getSpaceChildEvents } from '@/util/matrix';

const ORDER_MIN = 0x20;
const ORDER_MAX = 0x7e;
const ORDER_BASE = ORDER_MAX - ORDER_MIN + 1;
const ORDER_MAX_LENGTH = 50;

export function isValidSpaceOrder(order: unknown): order is string {
  if (typeof order !== 'string' || order.length === 0 || order.length > ORDER_MAX_LENGTH) {
    return false;
  }
  for (let i = 0; i < order.length; i++) {
    const c = order.charCodeAt(i);
    if (c < ORDER_MIN || c > ORDER_MAX) return false;
  }
  return true;
}

export interface SpaceChildSortKey {
  roomId: string;
  order?: string;
  ts: number;
}

export function compareSpaceChildren(a: SpaceChildSortKey, b: SpaceChildSortKey): number {
  const ao = isValidSpaceOrder(a.order) ? a.order : undefined;
  const bo = isValidSpaceOrder(b.order) ? b.order : undefined;
  if (ao !== undefined && bo !== undefined && ao !== bo) return ao < bo ? -1 : 1;
  if (ao !== undefined && bo === undefined) return -1;
  if (ao === undefined && bo !== undefined) return 1;
  if (a.ts !== b.ts) return a.ts - b.ts;
  return a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0;
}

const toDigits = (s: string): number[] => [...s].map((c) => c.charCodeAt(0) - ORDER_MIN);
const fromDigits = (d: number[]): string => String.fromCharCode(...d.map((x) => x + ORDER_MIN));

export function orderBetween(a: string | undefined, b: string | undefined): string | null {
  const da = a ? toDigits(a) : [];
  let db: number[] | null = b ? toDigits(b) : null;
  const result: number[] = [];
  for (let i = 0; i < ORDER_MAX_LENGTH; i++) {
    const lo = i < da.length ? da[i] : 0;
    const hi = db ? (i < db.length ? db[i] : 0) : ORDER_BASE;
    if (hi - lo > 1) {
      result.push(Math.floor((lo + hi) / 2));
      return fromDigits(result);
    }
    result.push(lo);
    if (hi > lo) db = null;
  }
  return null;
}

function spreadOrders(count: number): string[] {
  const orders: string[] = [];
  let prev: string | undefined;
  for (let i = 0; i < count; i++) {
    // Leave room after each key for later insertions
    const next = orderBetween(prev, undefined) ?? `${prev ?? ''}~`;
    orders.push(next);
    prev = next;
  }
  return orders;
}

export function planSpaceReorder(
  orderedIds: string[],
  currentOrders: ReadonlyMap<string, string | undefined>,
  movedId: string
): Map<string, string> {
  const index = orderedIds.indexOf(movedId);
  const prevOrder = index > 0 ? currentOrders.get(orderedIds[index - 1]) : undefined;
  const nextOrder =
    index < orderedIds.length - 1 ? currentOrders.get(orderedIds[index + 1]) : undefined;
  const neighboursOrdered =
    (index === 0 || isValidSpaceOrder(prevOrder)) &&
    (index === orderedIds.length - 1 || isValidSpaceOrder(nextOrder));
  if (neighboursOrdered) {
    const between = orderBetween(prevOrder, nextOrder);
    if (between) return new Map([[movedId, between]]);
  }
  const fresh = spreadOrders(orderedIds.length);
  const updates = new Map<string, string>();
  orderedIds.forEach((id, i) => {
    if (currentOrders.get(id) !== fresh[i]) updates.set(id, fresh[i]);
  });
  return updates;
}

export function getSpaceChildOrders(space: Room): Map<string, string | undefined> {
  const orders = new Map<string, string | undefined>();
  for (const event of getSpaceChildEvents(space)) {
    const id = event.getStateKey();
    if (!id) continue;
    const order = event.getContent()?.order;
    orders.set(id, isValidSpaceOrder(order) ? order : undefined);
  }
  return orders;
}

export async function saveSpaceChildOrders(
  client: MatrixClient,
  spaceId: string,
  updates: ReadonlyMap<string, string>
): Promise<void> {
  const space = client.getRoom(spaceId);
  if (!space) return;
  for (const [childId, order] of updates) {
    const event = roomState(space).getStateEvents(EventType.SpaceChild, childId);
    const content = (Array.isArray(event) ? event[0] : event)?.getContent() ?? {};
    // An empty content would remove the child from the space
    if (!Array.isArray(content.via) || content.via.length === 0) continue;
    await client.sendStateEvent(spaceId, EventType.SpaceChild, { ...content, order }, childId);
  }
}

export const HOME_ORDER_EVENT = 'org.wizardchat.home_order';

export function getHomeOrder(client: MatrixClient): string[] {
  const rooms = client
    .getAccountData(HOME_ORDER_EVENT as Parameters<MatrixClient['getAccountData']>[0])
    ?.getContent()?.rooms;
  return Array.isArray(rooms) ? rooms.filter((id): id is string => typeof id === 'string') : [];
}

export async function saveHomeOrder(client: MatrixClient, roomIds: string[]): Promise<void> {
  await client.setAccountData(
    HOME_ORDER_EVENT as Parameters<MatrixClient['setAccountData']>[0],
    { rooms: roomIds } as never
  );
}

export function sortByHomeOrder<T>(
  items: T[],
  order: string[],
  idOf: (item: T) => string,
  nameOf: (item: T) => string
): T[] {
  const position = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const pa = position.get(idOf(a));
    const pb = position.get(idOf(b));
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return nameOf(a).localeCompare(nameOf(b));
  });
}

const FAVOURITE_TAG = 'm.favourite';

export function getFavouriteOrder(room: Room | null | undefined): number | undefined {
  const order = room?.tags?.[FAVOURITE_TAG]?.order;
  return typeof order === 'number' && Number.isFinite(order) ? order : undefined;
}

export function sortFavourites<T>(
  items: T[],
  roomOf: (item: T) => Room | null | undefined,
  nameOf: (item: T) => string
): T[] {
  return [...items].sort((a, b) => {
    const oa = getFavouriteOrder(roomOf(a));
    const ob = getFavouriteOrder(roomOf(b));
    if (oa !== undefined && ob !== undefined && oa !== ob) return oa - ob;
    if (oa !== undefined && ob === undefined) return -1;
    if (oa === undefined && ob !== undefined) return 1;
    return nameOf(a).localeCompare(nameOf(b));
  });
}

export async function saveFavouriteOrder(client: MatrixClient, roomIds: string[]): Promise<void> {
  const count = roomIds.length;
  for (let i = 0; i < count; i++) {
    const order = (i + 1) / (count + 1);
    const room = client.getRoom(roomIds[i]);
    if (getFavouriteOrder(room) === order) continue;
    await client.setRoomTag(roomIds[i], FAVOURITE_TAG, { order });
  }
}

export const SPACE_ORDER_EVENT = 'org.matrix.msc3230.space_order';

export function getSpaceBarOrder(space: Room | null | undefined): string | undefined {
  const order = space?.getAccountData(SPACE_ORDER_EVENT)?.getContent()?.order;
  return isValidSpaceOrder(order) ? order : undefined;
}

export function sortSpaceBar<T>(items: T[], roomOf: (item: T) => Room | null | undefined): T[] {
  return items
    .map((item, index) => ({ item, index, order: getSpaceBarOrder(roomOf(item)) }))
    .sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
        return a.order < b.order ? -1 : 1;
      }
      if (a.order !== undefined && b.order === undefined) return -1;
      if (a.order === undefined && b.order !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export async function saveSpaceBarOrders(
  client: MatrixClient,
  updates: ReadonlyMap<string, string>
): Promise<void> {
  for (const [spaceId, order] of updates) {
    await client.setRoomAccountData(
      spaceId,
      SPACE_ORDER_EVENT as Parameters<MatrixClient['setRoomAccountData']>[1],
      { order } as never
    );
  }
}

export function applyPendingOrder<T>(
  items: T[],
  sectionIds: ReadonlySet<string>,
  pendingIds: string[] | null,
  roomIdOf: (item: T) => string | null
): T[] {
  if (!pendingIds) return items;
  const positions: number[] = [];
  const byId = new Map<string, T>();
  items.forEach((item, i) => {
    const id = roomIdOf(item);
    if (id && sectionIds.has(id)) {
      positions.push(i);
      byId.set(id, item);
    }
  });
  if (positions.length !== pendingIds.length || !pendingIds.every((id) => byId.has(id))) {
    return items;
  }
  const out = [...items];
  positions.forEach((pos, k) => {
    out[pos] = byId.get(pendingIds[k])!;
  });
  return out;
}
