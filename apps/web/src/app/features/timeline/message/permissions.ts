import type { RoomDetails, RoomSettings } from '@wizardchat/core';
import { canSendEvent } from '@/app/data';
import type { EventEntry } from './entry';

export interface MessagePermissions {
  canEdit: boolean;
  canRedact: boolean;
  canPin: boolean;
}

export interface RoomPermissions {
  canPin: boolean;
  canSendMessage: boolean;
  canRedactOthers: boolean;
}

export function computeRoomPermissions(
  details: RoomDetails | null,
  settings: RoomSettings | undefined,
  myId: string
): RoomPermissions {
  if (!details) {
    return { canPin: false, canSendMessage: false, canRedactOthers: false };
  }
  return {
    canPin: details.permissions.pin,
    canSendMessage: settings ? canSendEvent(settings, myId, 'm.room.message') : true,
    canRedactOthers: details.permissions.redactOthers,
  };
}

function getCanRedact(event: EventEntry, perms: RoomPermissions): boolean {
  return event.isOwn || perms.canRedactOthers;
}

export function computeMessagePermissions(
  event: EventEntry,
  perms: RoomPermissions
): MessagePermissions {
  if (!perms.canPin && !perms.canSendMessage) {
    return {
      canEdit: false,
      canRedact: getCanRedact(event, perms),
      canPin: false,
    };
  }
  return {
    canEdit: event.isOwn && perms.canSendMessage,
    canRedact: getCanRedact(event, perms),
    canPin: perms.canPin && event.eventId !== null,
  };
}
