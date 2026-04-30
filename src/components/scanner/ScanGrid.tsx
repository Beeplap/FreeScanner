"use client";

import React, { useLayoutEffect, useRef } from "react";
import { CameraIcon, EditIcon, HandIcon, TrashIcon, UploadIcon } from "./icons";
import type { MergeMode, ScanItem } from "./types";

type Props = {
  items: ScanItem[];
  displayItems: ScanItem[];
  pdfOrderIds: string[];
  mergeMode: MergeMode;
  draggingPdfId: string | null;
  dragOverPdfId: string | null;
  onReorderHandlePointerDown: (id: string, e: React.PointerEvent<HTMLElement>) => void;
  onReorderHandlePointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onReorderHandlePointerEnd: (e: React.PointerEvent<HTMLElement>) => void;
  startCropForOne: (id: string) => void;
  removeItem: (id: string) => void;
  onImportScans: () => void;
  onOpenCamera: () => void;
  isProcessing: boolean;
};

export default function ScanGrid({
  items,
  displayItems,
  pdfOrderIds,
  mergeMode,
  draggingPdfId,
  dragOverPdfId,
  onReorderHandlePointerDown,
  onReorderHandlePointerMove,
  onReorderHandlePointerEnd,
  startCropForOne,
  removeItem,
  onImportScans,
  onOpenCamera,
  isProcessing,
}: Props) {
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const previousRectsRef = useRef(new Map<string, DOMRect>());
  const wasDraggingRef = useRef(false);
  const orderKey = displayItems.map((item) => item.id).join("|");

  useLayoutEffect(() => {
    const previousRects = previousRectsRef.current;
    const nextRects = new Map<string, DOMRect>();
    const isDragging = draggingPdfId !== null;
    const shouldAnimate = !isDragging && wasDraggingRef.current;

    cardRefs.current.forEach((element, id) => {
      const nextRect = element.getBoundingClientRect();
      nextRects.set(id, nextRect);

      const previousRect = previousRects.get(id);
      if (!previousRect) return;
      if (!shouldAnimate) return;

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
      const travelDistance = Math.hypot(deltaX, deltaY);
      if (travelDistance > 260) return;

      element.getAnimations().forEach((animation) => animation.cancel());
      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          duration: Math.max(120, Math.min(220, travelDistance * 1.1)),
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        }
      );
    });

    previousRectsRef.current = nextRects;
    wasDraggingRef.current = isDragging;
  }, [orderKey, draggingPdfId]);

  function setCardRef(id: string, element: HTMLElement | null) {
    if (element) {
      cardRefs.current.set(id, element);
    } else {
      cardRefs.current.delete(id);
    }
  }

  function handleDesktopCardPointerDown(itemId: string, selected: boolean, e: React.PointerEvent<HTMLElement>) {
    if (!selected) return;
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;

    onReorderHandlePointerDown(itemId, e);
  }

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Scan pages</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Organize editable pages</h2>
            <p className="mt-1 text-sm text-slate-500">Page tray and edit controls.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-center sm:min-w-44">
              <div className="border-r border-slate-200 px-3 py-2">
                <p className="text-base font-semibold text-slate-950">{items.length}</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Added</p>
              </div>
              <div className="px-3 py-2">
                <p className="text-base font-semibold text-slate-950">{pdfOrderIds.length}</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">In PDF</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onImportScans}
                disabled={isProcessing}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UploadIcon />
                Import
              </button>
              <button
                type="button"
                onClick={onOpenCamera}
                disabled={isProcessing}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CameraIcon />
                Camera
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`grid gap-4 p-4 sm:p-5 ${mergeMode === "twoUp" ? "grid-cols-2" : "grid-cols-1"} sm:grid-cols-2 2xl:grid-cols-3`}>
        {items.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200">
              <CameraIcon />
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-950">No pages yet</h3>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onImportScans}
                disabled={isProcessing}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <UploadIcon />
                Import files
              </button>
              <button
                type="button"
                onClick={onOpenCamera}
                disabled={isProcessing}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CameraIcon />
                Open camera
              </button>
            </div>
          </div>
        ) : (
          displayItems.map((item) => {
            const selected = pdfOrderIds.includes(item.id);
            const pdfIndex = pdfOrderIds.indexOf(item.id);
            return (
              <article
                key={item.id}
                ref={(element) => setCardRef(item.id, element)}
                onPointerDown={(e) => handleDesktopCardPointerDown(item.id, selected, e)}
                onPointerMove={onReorderHandlePointerMove}
                onPointerUp={onReorderHandlePointerEnd}
                onPointerCancel={onReorderHandlePointerEnd}
                className={`relative overflow-hidden rounded-lg border bg-white shadow-sm transition-colors duration-150 ${
                  selected
                    ? mergeMode === "twoUp"
                      ? pdfIndex % 2 === 0
                        ? "border-emerald-300 shadow-emerald-100"
                        : "border-sky-300 shadow-sky-100"
                      : "border-emerald-300 shadow-emerald-100"
                    : "border-white"
                } ${selected ? "sm:cursor-grab sm:active:cursor-grabbing" : ""} ${
                  draggingPdfId === item.id ? "z-10 opacity-80 shadow-lg ring-2 ring-slate-300" : "opacity-100"
                } ${dragOverPdfId === item.id ? "ring-2 ring-emerald-300" : ""}`}
                style={selected && mergeMode === "twoUp" ? { boxShadow: "none" } : undefined}
                data-pdf-card="true"
                data-pdf-id={item.id}
                data-selected={selected ? "true" : "false"}
              >
                <div className="absolute left-3 top-3 z-30">
                  {selected ? (
                    <button
                      type="button"
                      aria-label="Drag to reorder image"
                      title="Drag to reorder"
                      className="grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-slate-950/90 text-white shadow-lg sm:hidden"
                      style={{
                        cursor: draggingPdfId === item.id ? "grabbing" : "grab",
                        opacity: draggingPdfId === item.id ? 0.95 : 0.9,
                        transform: draggingPdfId === item.id ? "scale(1.03)" : undefined,
                        touchAction: "none",
                      }}
                      onPointerDown={(e) => onReorderHandlePointerDown(item.id, e)}
                      onPointerMove={onReorderHandlePointerMove}
                      onPointerUp={onReorderHandlePointerEnd}
                      onPointerCancel={onReorderHandlePointerEnd}
                    >
                      <HandIcon />
                    </button>
                  ) : null}
                </div>
                <div className="block w-full">
                  <img src={item.previewUrl} alt={item.name} className="aspect-4/3 w-full object-cover" />
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <h3 className="truncate font-semibold text-slate-900">{item.name}</h3>
                    {selected && mergeMode === "twoUp" ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            pdfIndex % 2 === 0
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border border-sky-200 bg-sky-50 text-sky-800"
                          }`}
                        >
                          {pdfIndex % 2 === 0 ? "Front" : "Back"}
                        </span>
                      </div>
                    ) : null}
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                      {item.kind === "camera" ? "Camera Scan" : item.kind === "pdf-page" ? "PDF Page" : "Imported Image"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startCropForOne(item.id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 transition hover:bg-emerald-100"
                      aria-label={`Edit ${item.name}`}
                      title="Edit image"
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                      aria-label={`Delete ${item.name}`}
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
