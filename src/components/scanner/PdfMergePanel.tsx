"use client";

import React from "react";
import { HandIcon, TrashIcon } from "./icons";
import type { PdfMergeItem } from "./types";

type Props = {
  pdfFiles: PdfMergeItem[];
  isProcessing: boolean;
  onAddPdfs: () => void;
  onMergePdfs: () => void | Promise<void>;
  onRemovePdf: (id: string) => void;
  onMovePdf: (id: string, direction: -1 | 1) => void;
  onReorderPdf: (id: string, overId: string) => void;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PdfMergePanel({
  pdfFiles,
  isProcessing,
  onAddPdfs,
  onMergePdfs,
  onRemovePdf,
  onMovePdf,
  onReorderPdf,
}: Props) {
  const totalPages = pdfFiles.reduce((sum, item) => sum + (item.pageCount ?? 0), 0);
  const dragPdfIdRef = React.useRef<string | null>(null);
  const [draggingPdfId, setDraggingPdfId] = React.useState<string | null>(null);
  const [dragOverPdfId, setDragOverPdfId] = React.useState<string | null>(null);

  function startDrag(id: string, e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragPdfIdRef.current = id;
    setDraggingPdfId(id);
    setDragOverPdfId(id);
  }

  function moveDrag(e: React.PointerEvent<HTMLButtonElement>) {
    const draggedId = dragPdfIdRef.current;
    if (!draggedId) return;

    e.preventDefault();
    e.stopPropagation();

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const overCard = target?.closest<HTMLElement>("[data-merge-pdf-card='true']");
    const overId = overCard?.dataset.mergePdfId;
    if (!overId || overId === draggedId) return;

    setDragOverPdfId(overId);
    onReorderPdf(draggedId, overId);
  }

  function endDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragPdfIdRef.current) return;

    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragPdfIdRef.current = null;
    setDraggingPdfId(null);
    setDragOverPdfId(null);
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="panel p-5">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Merge PDFs</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Combine PDF documents</h2>
          </div>
          <button
            type="button"
            onClick={onAddPdfs}
            className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Add PDFs
          </button>
        </div>

        <div className="mt-4">
          {pdfFiles.length === 0 ? (
            <button
              type="button"
              onClick={onAddPdfs}
              className="flex min-h-72 w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition hover:border-slate-400 hover:bg-white"
            >
              <span className="text-base font-semibold text-slate-950">Select two or more PDFs</span>
              <span className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                Files are merged locally in your browser, preserving original PDF pages and order.
              </span>
            </button>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {pdfFiles.map((item, index) => (
                <article
                  key={item.id}
                  data-merge-pdf-card="true"
                  data-merge-pdf-id={item.id}
                  className={`overflow-hidden rounded-lg border bg-white shadow-sm transition ${
                    dragOverPdfId === item.id ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"
                  } ${draggingPdfId === item.id ? "opacity-75" : ""}`}
                >
                  <div className="relative bg-slate-100">
                    <div className="absolute left-2 top-2 z-10 rounded-md bg-slate-950 px-2 py-1 text-xs font-semibold text-white">
                      PDF {index + 1}
                    </div>
                    <button
                      type="button"
                      onPointerDown={(e) => startDrag(item.id, e)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm ring-1 ring-slate-200"
                      style={{ cursor: draggingPdfId === item.id ? "grabbing" : "grab", touchAction: "none" }}
                      aria-label={`Drag ${item.name} to reorder`}
                      title="Drag to reorder"
                    >
                      <HandIcon />
                    </button>
                    {item.previewUrl ? (
                      <img src={item.previewUrl} alt={`First page preview of ${item.name}`} className="aspect-[4/5] w-full bg-white object-contain p-3" />
                    ) : item.previewFailed ? (
                      <div className="grid aspect-[4/5] w-full place-items-center p-6 text-center text-sm text-slate-500">
                        Preview unavailable
                      </div>
                    ) : (
                      <div className="grid aspect-[4/5] w-full place-items-center p-6 text-center text-sm text-slate-500">
                        Rendering preview...
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-950">{item.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.pageCount === null ? "Reading pages" : `${item.pageCount} page${item.pageCount === 1 ? "" : "s"}`} / {formatFileSize(item.size)}
                    </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onMovePdf(item.id, -1)}
                        disabled={index === 0}
                        className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => onMovePdf(item.id, 1)}
                        disabled={index === pdfFiles.length - 1}
                        className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemovePdf(item.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-700 transition hover:bg-rose-100"
                        aria-label={`Remove ${item.name}`}
                        title="Remove"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className="panel h-fit p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Output</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-slate-500">Files</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{pdfFiles.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-slate-500">Pages</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{totalPages || "-"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onMergePdfs()}
          disabled={pdfFiles.length < 2 || isProcessing}
          className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Merge PDFs
        </button>
        <p className="mt-3 text-sm leading-6 text-slate-500">Use the order controls before exporting. The final PDF keeps each source document's original page size.</p>
      </aside>
    </section>
  );
}
