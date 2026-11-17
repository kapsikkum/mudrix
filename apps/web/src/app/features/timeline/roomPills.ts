import type { useStore } from 'jotai';
import { allJoinedSpacesAtom, roomsAtom } from '@/app/data';
import { parseMatrixToUrl } from '@/util/matrixTo';

type Store = ReturnType<typeof useStore>;

export function knownRoomName(url: string, store: Store): string | null {
  const target = parseMatrixToUrl(url);
  if (target?.kind !== 'room') return null;
  const id = target.roomIdOrAlias;
  const room = store.get(roomsAtom).find((r) => r.id === id || r.canonicalAlias === id);
  if (room?.name) return room.name;
  return store.get(allJoinedSpacesAtom).find((s) => s.id === id)?.name || null;
}

function nameRoomPills(root: ParentNode, store: Store): void {
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a.room-pill:not([data-named])')) {
    const name = knownRoomName(a.getAttribute('href') ?? '', store);
    if (!name) continue;
    a.dataset.named = 'true';
    a.title = a.textContent ?? '';
    a.textContent = `#${name}`;
  }
}

export function watchRoomPills(root: ParentNode, store: Store): () => void {
  nameRoomPills(root, store);
  if (!root.querySelector('a.room-pill:not([data-named])')) return () => {};
  const update = () => nameRoomPills(root, store);
  const unsubRooms = store.sub(roomsAtom, update);
  const unsubSpaces = store.sub(allJoinedSpacesAtom, update);
  return () => {
    unsubRooms();
    unsubSpaces();
  };
}
