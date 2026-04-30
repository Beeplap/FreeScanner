"use client";

import { CloseIcon, ResetIcon, RotateLeftIcon, RotateRightIcon } from "./icons";
import { filterOptions } from "./types";
import type { EditorBox, MergeMode, PageFilter, ScanItem, TransformHandle } from "./types";

type Props = {
  open: boolean;
  pageIndex: number | null;
  mergeMode: MergeMode;
  pdfEditorPageRef: React.RefObject<HTMLDivElement | null>;
  pdfEditorPreviewUrl: string | null;
  isRenderingPdfEditor: boolean;
  pdfEditorBox: EditorBox | null;
  pdfEditorItems: ScanItem[];
  pdfEditorActiveId: string | null;
  pdfEditorActiveItem: ScanItem | null;
  closePdfPageEditor: () => void;
  setPdfEditorActiveId: (id: string) => void;
  resetPageEdit: (id: string) => void;
  updatePageEdit: (
    id: string,
    patch: Partial<Omit<ScanItem["edit"], "crop">> & { crop?: Partial<ScanItem["edit"]["crop"]> }
  ) => void;
  beginTransform: (e: React.PointerEvent<HTMLDivElement>, mode: "move" | "resize", handle?: TransformHandle) => void;
  handleTransformMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  endTransform: (e?: React.PointerEvent<HTMLDivElement>) => void;
};

export default function PdfEditorModal({
  open,
  pageIndex,
  mergeMode,
  pdfEditorPageRef,
  pdfEditorPreviewUrl,
  isRenderingPdfEditor,
  pdfEditorBox,
  pdfEditorItems,
  pdfEditorActiveId,
  pdfEditorActiveItem,
  closePdfPageEditor,
  setPdfEditorActiveId,
  resetPageEdit,
  updatePageEdit,
  beginTransform,
  handleTransformMove,
  endTransform,
}: Props) {
  if (!open || pageIndex === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[96vh] w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">A4 PDF editor</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Page {pageIndex + 1}</h2>
          </div>
          <button
            type="button"
            onClick={closePdfPageEditor}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
            aria-label="Close PDF page editor"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="grid max-h-[calc(96vh-68px)] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="bg-slate-100 p-4 sm:p-6">
            <div className="mx-auto max-w-[520px]">
              <div
                ref={pdfEditorPageRef}
                className="relative aspect-595/842 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200"
                onPointerMove={handleTransformMove}
                onPointerUp={endTransform}
                onPointerCancel={endTransform}
              >
                {pdfEditorPreviewUrl ? (
                  <img src={pdfEditorPreviewUrl} alt={`PDF page ${pageIndex + 1} preview`} className="h-full w-full object-contain" />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-slate-500">Rendering A4 page...</div>
                )}
                {isRenderingPdfEditor ? (
                  <div className="absolute right-3 top-3 rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">Updating</div>
                ) : null}
                {pdfEditorBox ? (
                  <div
                    className="absolute z-20 cursor-move border-2 border-emerald-400 bg-emerald-300/10 shadow-[0_0_0_999px_rgba(15,23,42,0.06)]"
                    style={{
                      left: `${pdfEditorBox.x * 100}%`,
                      top: `${pdfEditorBox.y * 100}%`,
                      width: `${pdfEditorBox.w * 100}%`,
                      height: `${pdfEditorBox.h * 100}%`,
                      transform: `rotate(${pdfEditorBox.rotation}deg)`,
                      transformOrigin: "center",
                      touchAction: "none",
                    }}
                    onPointerDown={(e) => beginTransform(e, "move")}
                    role="application"
                    aria-label="Selected image transform frame"
                  >
                    {(["nw", "ne", "se", "sw"] as const).map((handle) => (
                      <div
                        key={handle}
                        className={`absolute h-5 w-5 rounded-md border-2 border-white bg-emerald-500 shadow-lg ${
                          handle === "nw"
                            ? "-left-2.5 -top-2.5 cursor-nwse-resize"
                            : handle === "ne"
                              ? "-right-2.5 -top-2.5 cursor-nesw-resize"
                              : handle === "se"
                                ? "-bottom-2.5 -right-2.5 cursor-nwse-resize"
                                : "-bottom-2.5 -left-2.5 cursor-nesw-resize"
                        }`}
                        onPointerDown={(e) => beginTransform(e, "resize", handle)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Image slot</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {pdfEditorItems.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPdfEditorActiveId(item.id)}
                    className={`rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition ${
                      pdfEditorActiveId === item.id
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="block text-xs uppercase tracking-[0.18em] text-slate-400">
                      {mergeMode === "twoUp" ? (index === 0 ? "Top" : "Bottom") : "Page"}
                    </span>
                    <span className="mt-1 block truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {pdfEditorActiveItem ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Adjust</p>
                    <h3 className="mt-1 truncate text-base font-semibold text-slate-900">{pdfEditorActiveItem.name}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => resetPageEdit(pdfEditorActiveItem.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                    aria-label="Reset selected image placement"
                    title="Reset"
                  >
                    <ResetIcon />
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Rotate</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updatePageEdit(pdfEditorActiveItem.id, {
                            rotation: pdfEditorActiveItem.edit.rotation - 90,
                          })
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <RotateLeftIcon />
                        Left
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updatePageEdit(pdfEditorActiveItem.id, {
                            rotation: pdfEditorActiveItem.edit.rotation + 90,
                          })
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <RotateRightIcon />
                        Right
                      </button>
                    </div>
                  </div>
                  <label className="grid gap-1 text-xs font-semibold text-slate-700">
                    Filter
                    <select
                      value={pdfEditorActiveItem.edit.filter}
                      onChange={(e) => updatePageEdit(pdfEditorActiveItem.id, { filter: e.target.value as PageFilter })}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {filterOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={closePdfPageEditor}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
