import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
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
  roomId: string;
  section: string | null;
}

interface InsertLine {
  id: string;
  position: 'before' | 'after';
}

const ReorderContext = createContext<{ insertLine: InsertLine | null }>({ insertLine: null });

interface RoomReorderProviderProps {
  rows: ReorderRow[];
  onReorder: (section: string, orderedIds: string[], movedId: string) => void;
  renderOverlay: (roomId: string) => ReactNode;
  children: ReactNode;
}

export function RoomReorderProvider({
  rows,
  onReorder,
  renderOverlay,
  children,
}: RoomReorderProviderProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertLine, setInsertLine] = useState<InsertLine | null>(null);

  const sectionOf = useMemo(() => new Map(rows.map((r) => [r.roomId, r.section])), [rows]);
  const idsInSection = useCallback(
    (section: string) => rows.filter((r) => r.section === section).map((r) => r.roomId),
    [rows]
  );

  const reset = () => {
    setActiveId(null);
    setInsertLine(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setInsertLine(null);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const section = sectionOf.get(String(active.id));
    if (!over || !section || sectionOf.get(String(over.id)) !== section) {
      setInsertLine(null);
      return;
    }
    const ids = idsInSection(section);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === to) {
      setInsertLine(null);
      return;
    }
    setInsertLine({ id: String(over.id), position: from < to ? 'after' : 'before' });
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    reset();
    const section = sectionOf.get(String(active.id));
    if (!over || !section || active.id === over.id) return;
    if (sectionOf.get(String(over.id)) !== section) return;
    const ids = idsInSection(section);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(section, arrayMove(ids, from, to), String(active.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      <SortableContext items={rows.map((r) => r.roomId)} strategy={verticalListSortingStrategy}>
        <ReorderContext.Provider value={{ insertLine }}>{children}</ReorderContext.Provider>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeId && <div className={css.overlay}>{renderOverlay(activeId)}</div>}
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
  const { insertLine } = useContext(ReorderContext);
  return (
    <div
      ref={setNodeRef}
      className={css.row}
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
