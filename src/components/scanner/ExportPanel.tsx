"use client";

import { EditIcon } from "./icons";
import type { MergeMode, ScanItem } from "./types";

type Props = {
  mergeMode: MergeMode;
  setMergeMode: (mode: MergeMode) => void;
  pdfOrderItems: ScanItem[];
  previewOrderedItems: ScanItem[];
  mergePreviewUrls: string[];
  isGeneratingPreview: boolean;
  isProcessing: boolean;
  statusMessage: string;
  exportPdf: () => void | Promise<void>;
  openPdfPageEditor: (pageIndex: number) => void;
};

export default function ExportPanel({
  mergeMode,
  setMergeMode,
  pdfOrderItems,
  previewOrderedItems,
  mergePreviewUrls,
  isGeneratingPreview,
  isProcessing,
  statusMessage,
  exportPdf,
  openPdfPageEditor,
}: Props) {
  return (
    <div className="glass-panel rounded-[32px] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Export PDF</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Crop + merge</h2>
        </div>
        <div className="rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">{pdfOrderItems.length} pages</div>
      </div>

      <div className="mt-4 rounded-[28px] border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Merge to PDF</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">A4 PDF from selected scans</h3>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setMergeMode("single")}
                className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                  mergeMode === "single"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                1 per A4 page
              </button>
              <button
                type="button"
                onClick={() => setMergeMode("twoUp")}
                className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                  mergeMode === "twoUp"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                2-up (front/back)
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">
            {pdfOrderItems.length} selected
          </div>
        </div>

        <button
          onClick={() => void exportPdf()}
          disabled={pdfOrderItems.length === 0}
          className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Merge Selected to PDF
        </button>

        <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-800">Preview (first {mergeMode === "twoUp" ? "2-up pages" : "pages"})</p>
          {pdfOrderItems.length > 0 ? (
            <p className="mt-2 text-sm text-slate-500">Open a preview page to adjust image placement, crop, rotation, and scanner filters on the A4 sheet.</p>
          ) : null}
          {pdfOrderItems.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Select images to preview merged A4 output.</p>
          ) : isGeneratingPreview ? (
            <p className="mt-2 text-sm text-slate-500">Rendering preview...</p>
          ) : (
            <div className="mt-3 grid gap-3">
              {Array.from({
                length:
                  mergeMode === "twoUp"
                    ? Math.min(Math.ceil(pdfOrderItems.length / 2), 3)
                    : Math.min(pdfOrderItems.length, 3),
              }).map((_, pageIdx) => {
                const pageNumber = pageIdx + 1;
                const mergedUrl = mergePreviewUrls[pageIdx] ?? null;
                const topItem = mergeMode === "twoUp" ? previewOrderedItems[pageIdx * 2] : previewOrderedItems[pageIdx];
                const bottomItem = mergeMode === "twoUp" ? previewOrderedItems[pageIdx * 2 + 1] : null;

                return (
                  <div key={pageNumber} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
                    <div className="absolute left-2 top-2 z-10 rounded-full bg-slate-950 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {pageNumber}
                    </div>
                    <button
                      type="button"
                      onClick={() => openPdfPageEditor(pageIdx)}
                      className="absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-emerald-50 hover:text-emerald-700"
                      aria-label={`Edit PDF page ${pageNumber}`}
                      title="Edit A4 page"
                    >
                      <EditIcon />
                    </button>

                    <div className="sm:hidden">
                      {mergeMode === "twoUp" ? (
                        <div className="flex gap-2">
                          <div className="flex-1">
                            {topItem ? (
                              <img src={topItem.previewUrl} alt={`Front ${pageNumber}`} className="aspect-3/4 w-full rounded-lg border border-slate-200 bg-white object-cover" />
                            ) : (
                              <div className="aspect-3/4 w-full rounded-lg border border-slate-200 bg-slate-50" />
                            )}
                          </div>
                          <div className="flex-1">
                            {bottomItem ? (
                              <img src={bottomItem.previewUrl} alt={`Back ${pageNumber}`} className="aspect-3/4 w-full rounded-lg border border-slate-200 bg-white object-cover" />
                            ) : (
                              <div className="aspect-3/4 w-full rounded-lg border border-slate-200 bg-slate-50" />
                            )}
                          </div>
                        </div>
                      ) : topItem ? (
                        <img src={topItem.previewUrl} alt={`Page ${pageNumber}`} className="aspect-3/4 w-full rounded-lg border border-slate-200 bg-white object-cover" />
                      ) : (
                        <div className="aspect-3/4 w-full rounded-lg border border-slate-200 bg-slate-50" />
                      )}
                    </div>

                    <div className="hidden sm:block">
                      {mergedUrl ? (
                        <img src={mergedUrl} alt={`Merged preview page ${pageNumber}`} className="aspect-3/4 w-full rounded-lg border border-slate-200 bg-white object-cover" />
                      ) : (
                        <div className="aspect-3/4 w-full rounded-lg border border-slate-200 bg-slate-50" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">{isProcessing ? "Working..." : "Status"}</p>
        <p className="mt-1 leading-6">{isProcessing ? "Processing files..." : statusMessage}</p>
      </div>
    </div>
  );
}
