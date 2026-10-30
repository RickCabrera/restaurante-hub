import type { ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { GripVertical } from 'lucide-react';

/** Lista reordenable con arrastrar y soltar (mouse, touch y teclado). */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  render,
  grid,
  className,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  render: (item: T, handle: ReactNode) => ReactNode;
  grid?: boolean;
  className?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over!.id);
    onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
        <div className={className}>
          {items.map((it) => (
            <SortableRow key={it.id} id={it.id}>
              {(handle) => render(it, handle)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button type="button" className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-ink-mute hover:bg-surface-sunken active:cursor-grabbing" aria-label="Arrastrar para reordenar" {...attributes} {...listeners}>
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={clsx(isDragging && 'relative z-10 opacity-90 shadow-lift')}>
      {children(handle)}
    </div>
  );
}
