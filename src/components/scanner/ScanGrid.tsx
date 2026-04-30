"use client";

import { EditIcon, HandIcon, TrashIcon } from "./icons";
import type { MergeMode, ScanItem } from "./types";

type Props = {
  items: ScanItem[];
  displayItems: ScanItem[];
  pdfOrderIds: string[];
  mergeMode: MergeMode;
  draggingPdfId: string | null;
  dragOverPdfId: string | null;
  onReorderHandlePointerDown: (id: string, e: React.PointerEvent<HTMLButtonElement>) => void;
  onReorderHandlePointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onReorderHandlePointerEnd: (e: React.PointerEvent<HTMLButtonElement>) => void;
  startCropForOne: (id: string) => void;
  removeItem: (id: string) => void;
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
}: Props) {
  return (
    <div className="panel p-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Scan pages</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Organize editable pages</h2>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">{pdfOrderIds.length} pages in PDF</div>
      </div>

      <div className={`mt-5 grid gap-4 ${mergeMode === "twoUp" ? "grid-cols-2" : "grid-cols-1"} sm:grid-cols-2 2xl:grid-cols-3`}>
        {items.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center text-slate-500">
            Start by importing images/PDF or opening the camera.
          </div>
        ) : (
          displayItems.map((item) => {
            const selected = pdfOrderIds.includes(item.id);
            const pdfIndex = pdfOrderIds.indexOf(item.id);
            return (
              <article
                key={item.id}
                className={`relative overflow-hidden rounded-lg border bg-white shadow-sm transition ${
                  selected
                    ? mergeMode === "twoUp"
                      ? pdfIndex % 2 === 0
                        ? "border-emerald-300 shadow-emerald-100"
                        : "border-sky-300 shadow-sky-100"
                      : "border-emerald-300 shadow-emerald-100"
                    : "border-white"
                } ${draggingPdfId === item.id ? "opacity-80" : "opacity-100"} ${dragOverPdfId === item.id ? "ring-2 ring-emerald-300" : ""}`}
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
                      className="grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-slate-950/90 text-white shadow-lg"
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
