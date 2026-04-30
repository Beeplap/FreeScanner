"use client";

import { HandIcon, TrashIcon } from "./icons";
import type { PdfMergeItem } from "./types";

type Props = {
  pdfFiles: PdfMergeItem[];
  isProcessing: boolean;
  onAddPdfs: () => void;
  onMergePdfs: () => void | Promise<void>;
  onRemovePdf: (id: string) => void;
  onMovePdf: (id: string, direction: -1 | 1) => void;
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
}: Props) {
  const totalPages = pdfFiles.reduce((sum, item) => sum + (item.pageCount ?? 0), 0);

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
            <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {pdfFiles.map((item, index) => (
                <div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">
                    {index + 1}
                  </div>
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
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Move ${item.name} up`}
                      title="Move up"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      onClick={() => onMovePdf(item.id, 1)}
                      disabled={index === pdfFiles.length - 1}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Move ${item.name} down`}
                      title="Move down"
                    >
                      Down
                    </button>
                    <span className="hidden h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 sm:inline-flex" title="Order controls">
                      <HandIcon />
                    </span>
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
