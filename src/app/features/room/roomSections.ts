import { useCallback, useState } from 'react';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { useMatrixEvent } from '@/app/hooks/useMatrixEvent';

const WEB_SETTINGS_EVENT = 'im.vector.web.settings';
const SECTION_DATA_KEY = 'RoomList.CustomSectionData';
const SECTION_ORDER_KEY = 'RoomList.OrderedCustomSections';
export const SECTION_TAG_PREFIX = 'element.io.section.';
const CHATS_TAG = 'chats';
const PEOPLE_TAG = 'im.vector.fake.direct';
export const HOME_SPACE = 'home-space';
const EXCLUSIVE_TAGS = ['m.favourite', 'm.lowpriority'];

type AccountDataKey = Parameters<MatrixClient['getAccountData']>[0];
type WritableAccountDataKey = Parameters<MatrixClient['setAccountData']>[0];

export interface RoomSection {
  tag: string;
  name: string;
  spaceId: string;
  aboveRooms: boolean;
}

interface StoredSection {
  tag: string;
  name: string;
  spaceId?: string;
}

export function isSectionTag(tag: string): boolean {
  return tag.startsWith(SECTION_TAG_PREFIX);
}

function readSettings(client: MatrixClient): Record<string, unknown> {
  const content = client.getAccountData(WEB_SETTINGS_EVENT as AccountDataKey)?.getContent();
  return content && typeof content === 'object' ? { ...content } : {};
}

function readData(settings: Record<string, unknown>): Record<string, StoredSection> {
  const raw = settings[SECTION_DATA_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const data: Record<string, StoredSection> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = value as Partial<StoredSection> | null;
    if (v && v.tag === key && isSectionTag(key) && typeof v.name === 'string') {
      data[key] = {
        tag: key,
        name: v.name,
        spaceId: typeof v.spaceId === 'string' ? v.spaceId : undefined,
      };
    }
  }
  return data;
}

function readOrder(
  settings: Record<string, unknown>,
  data: Record<string, StoredSection>
): string[] {
  const raw = settings[SECTION_ORDER_KEY];
  const order = (Array.isArray(raw) ? raw : []).filter(
    (tag): tag is string =>
      typeof tag === 'string' && (tag === CHATS_TAG || tag === PEOPLE_TAG || tag in data)
  );
  for (const tag of Object.keys(data)) {
    if (!order.includes(tag))
      order.splice(order.includes(CHATS_TAG) ? order.indexOf(CHATS_TAG) : order.length, 0, tag);
  }
  if (!order.includes(CHATS_TAG)) order.push(CHATS_TAG);
  if (!order.includes(PEOPLE_TAG)) order.unshift(PEOPLE_TAG);
  return order;
}

export function readSections(client: MatrixClient): RoomSection[] {
  const settings = readSettings(client);
  const data = readData(settings);
  const order = readOrder(settings, data);
  const chatsIndex = order.indexOf(CHATS_TAG);
  return order
    .filter((tag) => tag in data)
    .map((tag) => ({
      tag,
      name: data[tag].name,
      spaceId: data[tag].spaceId ?? HOME_SPACE,
      aboveRooms: order.indexOf(tag) < chatsIndex,
    }));
}

async function writeSections(
  client: MatrixClient,
  mutate: (data: Record<string, StoredSection>, order: string[]) => void
): Promise<void> {
  const settings = readSettings(client);
  const data = readData(settings);
  const order = readOrder(settings, data);
  mutate(data, order);
  await client.setAccountData(
    WEB_SETTINGS_EVENT as WritableAccountDataKey,
    {
      ...settings,
      [SECTION_DATA_KEY]: data,
      [SECTION_ORDER_KEY]: order,
    } as never
  );
}

export function getRoomSectionTag(
  room: Room | null | undefined,
  sections: RoomSection[]
): string | null {
  if (!room) return null;
  const known = new Set(sections.map((s) => s.tag));
  return Object.keys(room.tags ?? {}).find((tag) => known.has(tag)) ?? null;
}

export async function createSection(
  client: MatrixClient,
  name: string,
  spaceId: string
): Promise<string> {
  const tag = `${SECTION_TAG_PREFIX}${crypto.randomUUID()}`;
  await writeSections(client, (data, order) => {
    data[tag] = { tag, name, spaceId };
    order.splice(order.indexOf(CHATS_TAG), 0, tag);
  });
  return tag;
}

export async function renameSection(
  client: MatrixClient,
  tag: string,
  name: string
): Promise<void> {
  await writeSections(client, (data) => {
    if (data[tag]) data[tag].name = name;
  });
}

export const ROOMS_ANCHOR = CHATS_TAG;

export async function setSectionOrder(client: MatrixClient, visible: string[]): Promise<void> {
  await writeSections(client, (_data, order) => {
    const moved = new Set(visible);
    const slots = order.flatMap((t, i) => (moved.has(t) ? [i] : []));
    if (slots.length !== visible.length) return;
    slots.forEach((slot, i) => {
      order[slot] = visible[i];
    });
  });
}

export async function deleteSection(client: MatrixClient, tag: string): Promise<void> {
  await writeSections(client, (data, order) => {
    delete data[tag];
    order.splice(order.indexOf(tag), 1);
  });
  await Promise.allSettled(
    client
      .getRooms()
      .filter((room) => room.tags?.[tag])
      .map((room) => client.deleteRoomTag(room.roomId, tag))
  );
}

export async function setRoomSection(
  client: MatrixClient,
  roomId: string,
  tag: string | null
): Promise<void> {
  const room = client.getRoom(roomId);
  const current = Object.keys(room?.tags ?? {}).filter(
    (t) => t !== tag && (isSectionTag(t) || EXCLUSIVE_TAGS.includes(t))
  );
  await Promise.all(current.map((t) => client.deleteRoomTag(roomId, t)));
  if (tag && !room?.tags?.[tag]) await client.setRoomTag(roomId, tag, {});
}

export function useRoomSections(client: MatrixClient | null): RoomSection[] {
  const [sections, setSections] = useState<RoomSection[]>(() =>
    client ? readSections(client) : []
  );
  const onAccountData = useCallback(
    (event: MatrixEvent) => {
      if (client && event.getType() === WEB_SETTINGS_EVENT) setSections(readSections(client));
    },
    [client]
  );
  useMatrixEvent(client, 'accountData', onAccountData);
  return sections;
}
