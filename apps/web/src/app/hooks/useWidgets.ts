import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Widget, WizardClient } from '@wizardchat/core';
import { useAccountData } from '@/app/data';

export const WIDGET_TYPES = {
  STICKER_PICKER: 'm.stickerpicker',
} as const;

export interface RoomWidget {
  stateKey: string;
  type: string;
  url: string;
  name: string;
  data: Record<string, unknown>;
  creatorUserId: string;
}

const USER_WIDGETS_EVENT = 'm.widgets';

type UserWidgetsContent = Record<string, { content?: Record<string, unknown>; sender?: string }>;

function readUserStickerWidget(
  client: WizardClient | null,
  content: UserWidgetsContent | null
): RoomWidget | undefined {
  for (const [id, entry] of Object.entries(content ?? {})) {
    const widget = entry?.content;
    const url = typeof widget?.url === 'string' ? widget.url : '';
    if (widget?.type !== WIDGET_TYPES.STICKER_PICKER || !url.startsWith('https://')) continue;
    return {
      stateKey: id,
      type: WIDGET_TYPES.STICKER_PICKER,
      url,
      name: typeof widget.name === 'string' ? widget.name : '',
      data: (widget.data as Record<string, unknown>) ?? {},
      creatorUserId: entry.sender ?? client?.userId() ?? '',
    };
  }
  return undefined;
}

function toRoomWidget(widget: Widget): RoomWidget {
  return {
    stateKey: widget.id,
    type: widget.kind,
    url: widget.url ?? '',
    name: widget.name ?? '',
    data: widget.data ?? {},
    creatorUserId: widget.creator ?? '',
  };
}

export function useWidgets(client: WizardClient | null, roomId: string | null) {
  const [roomWidgets, setRoomWidgets] = useState<Widget[]>([]);

  useEffect(() => {
    setRoomWidgets([]);
    if (!client || !roomId) return;
    const subscription = client.watchWidgets(roomId, setRoomWidgets);
    return () => subscription.cancel();
  }, [client, roomId]);

  const widgets = useMemo(
    () => roomWidgets.filter((w) => !!w.kind).map(toRoomWidget),
    [roomWidgets]
  );

  const userWidgets = useAccountData<UserWidgetsContent>(USER_WIDGETS_EVENT);
  const stickerWidget = useMemo(
    () => readUserStickerWidget(client, userWidgets),
    [client, userWidgets]
  );
  const hasSticker = !!stickerWidget;

  const removeWidget = useCallback(
    async (stateKey: string) => {
      if (!client || !roomId) return;
      await client.removeWidget(roomId, stateKey);
    },
    [client, roomId]
  );

  const updateWidget = useCallback(
    async (
      stateKey: string,
      changes: { url?: string; data?: Record<string, unknown>; name?: string }
    ) => {
      if (!client || !roomId) return;
      const existing = widgets.find((w) => w.stateKey === stateKey);
      if (!existing) throw new Error(`Widget not found: ${stateKey}`);
      await client.setStateEvent(roomId, 'm.room.widget', stateKey, {
        type: existing.type,
        url: changes.url ?? existing.url,
        name: changes.name ?? existing.name,
        creatorUserId: existing.creatorUserId,
        data: changes.data ?? existing.data,
      });
    },
    [client, roomId, widgets]
  );

  return {
    widgets,
    stickerWidget,
    hasSticker,
    removeWidget,
    updateWidget,
  };
}
