import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import type { RoomSummary } from '@wizardchat/core';
import { favouriteRoomsAtom, lowPriorityRoomsAtom } from '@/app/store/atoms';
import { useAllRooms } from '@/app/data';

export const FAVOURITE_ROOM_TAG = 'm.favourite';
export const LOW_PRIORITY_ROOM_TAG = 'm.lowpriority';

export function roomIsFavourite(room: RoomSummary | null | undefined): boolean {
  return !!room?.isFavourite;
}

export function roomIsLowPriority(room: RoomSummary | null | undefined): boolean {
  return !!room?.isLowPriority && !room.isFavourite;
}

const idsOf = (rooms: RoomSummary[], test: (room: RoomSummary) => boolean): string =>
  rooms
    .filter(test)
    .map((r) => r.id)
    .sort()
    .join('|');

/** Keeps the favourite and low priority room ids in sync with the rooms' tags */
export function useBindFavouriteRooms(): void {
  const setFavourites = useSetAtom(favouriteRoomsAtom);
  const setLowPriority = useSetAtom(lowPriorityRoomsAtom);
  const rooms = useAllRooms();
  const favourites = idsOf(rooms, roomIsFavourite);
  const lowPriority = idsOf(rooms, roomIsLowPriority);
  useEffect(() => {
    setFavourites(new Set(favourites ? favourites.split('|') : []));
  }, [favourites, setFavourites]);
  useEffect(() => {
    setLowPriority(new Set(lowPriority ? lowPriority.split('|') : []));
  }, [lowPriority, setLowPriority]);
}
