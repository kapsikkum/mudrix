import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import * as css from './RoomReorder.css';

export interface ReorderRow {
  id: string;
  kind: 'room' | 'header';
  group: string | null;
  section: string | null;
  anchor?: string;
  /** A category header that can be moved among the categories of the same parent space */
  category?: { id: string; parent: string };
  /** What a screen reader calls the row while it is dragged; the id when absent. */
  label?: string;
  /** A voice channel: a person dragged out of another channel can be dropped on it */
  voice?: boolean;
}

interface InsertLine {
  id: string;
  position: 'before' | 'after';
}

/** A person being dragged out of a voice channel (the data their draggable carries) */
export interface DraggedParticipant {
  kind: 'participant';
  fromRoomId: string;
  userId: string;
  label: string;
}

const isParticipant = (data: unknown): data is DraggedParticipant =>
  !!data && (data as { kind?: unknown }).kind === 'participant';

const ReorderContext = createContext<{
  insertLine: InsertLine | null;
  /** The voice channel a dragged person would be sent to if dropped now */
  personTarget: string | null;
}>({ insertLine: null, personTarget: null });

interface RoomReorderProviderProps {
  rows: ReorderRow[];
  onReorder: (section: string, orderedIds: string[], movedId: string) => void;
  onMoveRoom?: (roomId: string, group: string) => void;
  onReorderSections?: (orderedAnchors: string[]) => void;
  onReorderCategories?: (parentId: string, orderedIds: string[], movedId: string) => void;
  onActiveChange?: (id: string | null) => void;
  /** Whether a person may be sent from one voice channel to another */
  canMoveParticipant?: (fromRoomId: string, toRoomId: string) => boolean;
  onMoveParticipant?: (userId: string, fromRoomId: string, toRoomId: string) => void;
  onDropGroupChange?: (group: string | null) => void;
  renderOverlay: (id: string) => ReactNode;
  children: ReactNode;
}

type Plan =
  | { kind: 'reorder'; section: string; ids: string[]; line: InsertLine }
  | { kind: 'move'; group: string }
  | { kind: 'sections'; anchors: string[]; line: InsertLine }
  | { kind: 'categories'; parent: string; ids: string[]; moved: string; line: InsertLine }
  | null;

export function RoomReorderProvider({
  rows,
  onReorder,
  onMoveRoom,
  onReorderSections,
  onReorderCategories,
  onActiveChange,
  canMoveParticipant,
  onMoveParticipant,
  onDropGroupChange,
  renderOverlay,
  children,
}: RoomReorderProviderProps) {
  const { t } = useTranslation();
  // A mouse drags after a few pixels; a finger needs a short hold, so a swipe still scrolls the list.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } })
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertLine, setInsertLine] = useState<InsertLine | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  const [person, setPerson] = useState<DraggedParticipant | null>(null);
  const [personTarget, setPersonTarget] = useState<string | null>(null);
  useEffect(() => onDropGroupChange?.(dropGroup), [dropGroup, onDropGroupChange]);

  const byId = useMemo(() => new Map(rows.map((r, i) => [r.id, { row: r, index: i }])), [rows]);

  const anchorOf = useCallback(
    (id: string): string | null => {
      const hit = byId.get(id);
      if (!hit) return null;
      for (let i = hit.index; i >= 0; i--) {
        const row = rows[i];
        if (row.kind !== 'header') continue;
        return row.anchor ?? null;
      }
      return null;
    },
    [byId, rows]
  );
  const anchorRow = useCallback(
    (anchor: string) => rows.find((r) => r.kind === 'header' && r.anchor === anchor)?.id ?? null,
    [rows]
  );
  const anchors = useMemo(() => {
    const list: string[] = [];
    for (const row of rows) {
      if (row.kind !== 'header') continue;
      if (row.anchor && !list.includes(row.anchor)) list.push(row.anchor);
    }
    return list;
  }, [rows]);

  const plan = useCallback(
    (active: string, over: string | null): Plan => {
      const from = byId.get(active)?.row;
      const to = over ? byId.get(over)?.row : undefined;
      if (!from || !to || active === over) return null;

      if (from.kind === 'header' && from.category) {
        const { id, parent } = from.category;
        // The category the pointer is over: a header, or the room under one
        let over: ReorderRow | undefined;
        for (let i = byId.get(to.id)!.index; i >= 0 && !over; i--) {
          if (rows[i].kind === 'header') over = rows[i];
        }
        const target = over?.category;
        if (!target || target.parent !== parent || target.id === id) return null;
        const siblings = rows
          .filter((r) => r.kind === 'header' && r.category?.parent === parent)
          .map((r) => r.category!.id);
        const a = siblings.indexOf(id);
        const b = siblings.indexOf(target.id);
        if (a === -1 || b === -1) return null;
        const headerOf = (categoryId: string) =>
          rows.find((r) => r.kind === 'header' && r.category?.id === categoryId)!.id;
        const following = siblings[b + 1];
        const line: InsertLine =
          a > b
            ? { id: headerOf(target.id), position: 'before' }
            : following
              ? { id: headerOf(following), position: 'before' }
              : { id: rows[rows.length - 1].id, position: 'after' };
        return { kind: 'categories', parent, ids: arrayMove(siblings, a, b), moved: id, line };
      }

      if (from.kind === 'header') {
        const source = from.anchor;
        const target = anchorOf(to.id);
        if (!source || !target || source === target) return null;
        const a = anchors.indexOf(source);
        const b = anchors.indexOf(target);
        const headerId = anchorRow(target);
        if (a === -1 || b === -1 || !headerId) return null;
        if (a > b) {
          return {
            kind: 'sections',
            anchors: arrayMove(anchors, a, b),
            line: { id: headerId, position: 'before' },
          };
        }
        let end = byId.get(headerId)!.index;
        while (end + 1 < rows.length && rows[end + 1].kind !== 'header') end++;
        return {
          kind: 'sections',
          anchors: arrayMove(anchors, a, b),
          line: { id: rows[end].id, position: 'after' },
        };
      }

      if (to.kind === 'room' && from.section && to.section === from.section) {
        const ids = rows.filter((r) => r.section === from.section).map((r) => r.id);
        const a = ids.indexOf(from.id);
        const b = ids.indexOf(to.id);
        if (a === -1 || b === -1 || a === b) return null;
        return {
          kind: 'reorder',
          section: from.section,
          ids: arrayMove(ids, a, b),
          line: { id: to.id, position: a < b ? 'after' : 'before' },
        };
      }
      if (to.group && to.group !== from.group) return { kind: 'move', group: to.group };
      return null;
    },
    [byId, rows, anchors, anchorOf, anchorRow]
  );

  // Screen readers get names, not the ids the rows are keyed by.
  const announcements = useMemo<Announcements>(() => {
    const label = (id: string | number, data?: unknown) =>
      (isParticipant(data) ? data.label : byId.get(String(id))?.row.label) ?? String(id);
    return {
      onDragStart: ({ active }) =>
        t('room.drag.pickedUp', { name: label(active.id, active.data.current) }),
      onDragOver: ({ over }) => (over ? t('room.drag.over', { name: label(over.id) }) : undefined),
      onDragEnd: ({ active, over }) =>
        over
          ? t('room.drag.dropped', {
              name: label(active.id, active.data.current),
              target: label(over.id),
            })
          : t('room.drag.cancelled', { name: label(active.id, active.data.current) }),
      onDragCancel: ({ active }) =>
        t('room.drag.cancelled', { name: label(active.id, active.data.current) }),
    };
  }, [byId, t]);

  const reset = () => {
    setActiveId(null);
    onActiveChange?.(null);
    setInsertLine(null);
    setDropGroup(null);
    setPerson(null);
    setPersonTarget(null);
  };

  /** The voice channel under the pointer when a person is dragged, if they may go there */
  const targetForPerson = (dragged: DraggedParticipant, over: string | null): string | null => {
    const row = over ? byId.get(over)?.row : undefined;
    if (!row?.voice || row.id === dragged.fromRoomId) return null;
    return canMoveParticipant?.(dragged.fromRoomId, row.id) ? row.id : null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    onActiveChange?.(String(event.active.id));
    setInsertLine(null);
    setDropGroup(null);
    const data = event.active.data.current;
    setPerson(isParticipant(data) ? data : null);
    setPersonTarget(null);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const data = active.data.current;
    if (isParticipant(data)) {
      setInsertLine(null);
      setDropGroup(null);
      setPersonTarget(targetForPerson(data, over ? String(over.id) : null));
      return;
    }
    const next = plan(String(active.id), over ? String(over.id) : null);
    setInsertLine(next && next.kind !== 'move' ? next.line : null);
    setDropGroup(next?.kind === 'move' ? next.group : null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const data = active.data.current;
    reset();
    if (isParticipant(data)) {
      const target = targetForPerson(data, over ? String(over.id) : null);
      if (target) onMoveParticipant?.(data.userId, data.fromRoomId, target);
      return;
    }
    const next = plan(String(active.id), over ? String(over.id) : null);
    if (!next) return;
    if (next.kind === 'reorder') onReorder(next.section, next.ids, String(active.id));
    else if (next.kind === 'move') onMoveRoom?.(String(active.id), next.group);
    else if (next.kind === 'categories') onReorderCategories?.(next.parent, next.ids, next.moved);
    else onReorderSections?.(next.anchors);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
      accessibility={{ announcements }}
    >
      <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <ReorderContext.Provider value={{ insertLine, personTarget }}>
          {children}
        </ReorderContext.Provider>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {person ? (
          <div className={css.personOverlay}>{person.label}</div>
        ) : (
          activeId && <div className={css.overlay}>{renderOverlay(activeId)}</div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export function SortableRoomRow({
  roomId,
  disabled,
  children,
}: {
  roomId: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const { listeners, setNodeRef, isDragging } = useSortable({ id: roomId, disabled });
  const { insertLine, personTarget } = useContext(ReorderContext);
  return (
    <div
      ref={setNodeRef}
      className={personTarget === roomId ? `${css.row} ${css.personDropTarget}` : css.row}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      {...(disabled ? {} : listeners)}
    >
      {insertLine?.id === roomId && (
        <div className={css.insertLine} data-position={insertLine.position} />
      )}
      {children}
    </div>
  );
}

export function SortableHeaderRow({
  id,
  draggable,
  droppable = false,
  children,
}: {
  id: string;
  draggable: boolean;
  /** Rooms can be dropped on it (a category that may be empty) */
  droppable?: boolean;
  children: ReactNode;
}) {
  const { listeners, setNodeRef, isDragging } = useSortable({
    id,
    disabled: { draggable: !draggable, droppable: !droppable },
  });
  const { insertLine } = useContext(ReorderContext);
  return (
    <div
      ref={setNodeRef}
      className={css.row}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      {...(draggable ? listeners : {})}
    >
      {insertLine?.id === id && (
        <div className={css.insertLine} data-position={insertLine.position} />
      )}
      {children}
    </div>
  );
}
