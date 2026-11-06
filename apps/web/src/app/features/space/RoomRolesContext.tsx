import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { RoomSettings } from '@wizardchat/core';
import { useRoomSettings } from '@/app/data';
import { NO_ROLES, useRoomRoles, type SpaceRoles } from './spaceRoles';

/**
 * The cosmetic roles in effect for the open room, read once around the timeline so each message
 * only has to look them up (a message row must never load anything itself).
 */
export interface RoomRolesValue {
  roles: SpaceRoles;
  settings: RoomSettings | undefined;
}

const RoomRolesContext = createContext<RoomRolesValue>({
  roles: NO_ROLES,
  settings: undefined,
});

export const useRoomRolesContext = (): RoomRolesValue => useContext(RoomRolesContext);

export function RoomRolesProvider({ roomId, children }: { roomId: string; children: ReactNode }) {
  const roles = useRoomRoles(roomId);
  const { data: settings } = useRoomSettings(roomId);
  const value = useMemo(() => ({ roles, settings }), [roles, settings]);
  return <RoomRolesContext.Provider value={value}>{children}</RoomRolesContext.Provider>;
}
