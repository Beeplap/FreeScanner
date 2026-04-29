"use client";

import React, { useEffect, useState } from "react";
import { useDocumentStore } from "../store/documentStore";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableItem({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const page = useDocumentStore((state) => state.pages.find((p) => p.id === id));
  const [url, setUrl] = useState<string | null>(null);
  const removePage = useDocumentStore((s) => s.removePage);

  useEffect(() => {
    if (!page) {
      setUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(page.originalBlob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [page]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    border: "1px solid #ddd",
    padding: 4,
    margin: 4,
    width: 100,
    height: 140,
    position: "relative",
    background: "#fafafa",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {url ? (
        <img src={url} alt="page" style={{ width: "100%", height: "calc(100% - 24px)", objectFit: "cover" }} />
      ) : null}
      <button
        onClick={() => removePage(id)}
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          background: "red",
          color: "white",
          border: "none",
          borderRadius: "50%",
          width: 20,
          height: 20,
          cursor: "pointer",
        }}
        aria-label="Delete"
      >
        ×
      </button>
    </div>
  );
}

export const PageSorter: React.FC = () => {
  const pages = useDocumentStore((state) => state.pages);
  const reorderPages = useDocumentStore((s) => s.reorderPages);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: undefined })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = pages.findIndex((p) => p.id === String(active.id));
      const newIndex = pages.findIndex((p) => p.id === String(over?.id));
      const newOrder = arrayMove(pages, oldIndex, newIndex);
      reorderPages(newOrder);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 100px)", gap: 8 }}>
          {pages.map((page) => (
            <SortableItem key={page.id} id={page.id} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
