"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type CropModalProps = {
  open: boolean;
  imageUrl: string | null;
  title?: string;
  onCancel: () => void;
  onApply: (croppedBlob: Blob) => void | Promise<void>;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image failed to load for cropping"));
  });
  return img;
}

async function cropImageToBlob(params: {
  imageUrl: string;
  cropRender: { x: number; y: number; w: number; h: number }; // coordinates inside rendered (scaled) image area
  render: { scale: number; offsetX: number; offsetY: number; rotatedW: number; rotatedH: number };
  natural: { w: number; h: number };
  rotationDeg: number; // 0/90/180/270
}) {
  const { imageUrl, cropRender, render, natural, rotationDeg } = params;
  const img = await loadImage(imageUrl);

  const rad = (rotationDeg * Math.PI) / 180;
  const rotatedW = render.rotatedW;
  const rotatedH = render.rotatedH;

  // Create a temp canvas containing the rotated image at natural resolution.
  const temp = document.createElement("canvas");
  temp.width = rotatedW;
  temp.height = rotatedH;
  const tempCtx = temp.getContext("2d");
  if (!tempCtx) throw new Error("Canvas 2D context not available");

  tempCtx.save();
  tempCtx.translate(rotatedW / 2, rotatedH / 2);
  tempCtx.rotate(rad);
  tempCtx.drawImage(img, -natural.w / 2, -natural.h / 2);
  tempCtx.restore();

  // Convert crop from rendered coords -> rotated natural coords.
  const sx = Math.round(cropRender.x / render.scale);
  const sy = Math.round(cropRender.y / render.scale);
  const sw = Math.round(cropRender.w / render.scale);
  const sh = Math.round(cropRender.h / render.scale);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  ctx.drawImage(temp, sx, sy, sw, sh, 0, 0, sw, sh);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error("Failed to create cropped blob"));
        else resolve(b);
      },
      "image/jpeg",
      0.95
    );
  });

  return blob;
}

type Handle =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

type CropBox = { x: number; y: number; w: number; h: number };

export default function CropModal({
  open,
  imageUrl,
  title,
  onCancel,
  onApply,
}: CropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [container, setContainer] = useState<{ w: number; h: number } | null>(null);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isApplying, setIsApplying] = useState(false);

  const rotationBucket = useMemo(() => {
    const r = ((rotationDeg % 360) + 360) % 360;
    if (r === 90 || r === 180 || r === 270) return r;
    return 0;
  }, [rotationDeg]);

  const render = useMemo(() => {
    if (!natural || !container) return null;
    const rotatedW = rotationBucket === 0 || rotationBucket === 180 ? natural.w : natural.h;
    const rotatedH = rotationBucket === 0 || rotationBucket === 180 ? natural.h : natural.w;

    const scale = Math.min(container.w / rotatedW, container.h / rotatedH);
    const renderW = rotatedW * scale;
    const renderH = rotatedH * scale;
    const offsetX = (container.w - renderW) / 2;
    const offsetY = (container.h - renderH) / 2;

    return { scale, offsetX, offsetY, rotatedW, rotatedH, renderW, renderH };
  }, [natural, container, rotationBucket]);

  const bounds = useMemo(() => {
    if (!render) return null;
    return {
      minX: render.offsetX,
      minY: render.offsetY,
      maxX: render.offsetX + render.renderW,
      maxY: render.offsetY + render.renderH,
    };
  }, [render]);

  // Load natural size when modal opens
  useEffect(() => {
    if (!open || !imageUrl) return;
    setNatural(null);
    setRotationDeg(0);
    setCropBox(null);

    void (async () => {
      const img = await loadImage(imageUrl);
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    })().catch(() => {});
  }, [open, imageUrl]);

  // Render a rotated preview to a canvas so crop coordinates match exactly.
  useEffect(() => {
    if (!open || !imageUrl || !natural || !render) return;
    let cancelled = false;

    (async () => {
      const img = await loadImage(imageUrl);
      if (cancelled) return;

      const canvas = previewCanvasRef.current;
      if (!canvas) return;

      const nextW = Math.max(1, Math.round(render.renderW));
      const nextH = Math.max(1, Math.round(render.renderH));
      canvas.width = nextW;
      canvas.height = nextH;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, nextW, nextH);

      const rad = (rotationBucket * Math.PI) / 180;
      ctx.save();
      ctx.translate(nextW / 2, nextH / 2);
      ctx.rotate(rad);

      const drawW = natural.w * render.scale;
      const drawH = natural.h * render.scale;

      ctx.drawImage(
        img,
        -drawW / 2,
        -drawH / 2,
        drawW,
        drawH
      );

      ctx.restore();
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [open, imageUrl, natural, render, rotationBucket]);

  // Track container size
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainer({
        w: Math.max(1, rect.width),
        h: Math.max(1, rect.height),
      });
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Initialize crop box to an A4-sized rectangle (ratio only), but allow free resizing later.
  useEffect(() => {
    if (!open || !render || !bounds || !natural) return;
    if (cropBox) return;

    const A4_RATIO = 210 / 297;
    const maxW = render.renderW * 0.92;
    const maxH = render.renderH * 0.92;

    let targetW = maxW;
    let targetH = targetW / A4_RATIO;
    if (targetH > maxH) {
      targetH = maxH;
      targetW = targetH * A4_RATIO;
    }

    const x = bounds.minX + (bounds.maxX - bounds.minX - targetW) / 2;
    const y = bounds.minY + (bounds.maxY - bounds.minY - targetH) / 2;
    setCropBox({ x, y, w: targetW, h: targetH });
  }, [open, render, bounds, natural, cropBox]);

  useEffect(() => {
    if (!cropBox || !bounds) return;
    const MIN = 60;

    const nextW = clamp(cropBox.w, MIN, bounds.maxX - bounds.minX);
    const nextH = clamp(cropBox.h, MIN, bounds.maxY - bounds.minY);

    const nextX = clamp(cropBox.x, bounds.minX, bounds.maxX - nextW);
    const nextY = clamp(cropBox.y, bounds.minY, bounds.maxY - nextH);

    if (nextX !== cropBox.x || nextY !== cropBox.y || nextW !== cropBox.w || nextH !== cropBox.h) {
      setCropBox({ x: nextX, y: nextY, w: nextW, h: nextH });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds]);

  const interactionRef = useRef<
    | null
    | {
        mode: "move" | "resize";
        handle: Handle | null;
        startPointer: { x: number; y: number };
        startBox: CropBox;
      }
  >(null);

  function getLocalPoint(e: React.PointerEvent) {
    const el = containerRef.current;
    if (!el) return { x: e.clientX, y: e.clientY };
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onCropPointerDown(e: React.PointerEvent) {
    if (!open || !bounds || !cropBox) return;
    // Avoid stealing events from resize handles.
    if ((e.target as HTMLElement).dataset?.handle) return;
    const pt = getLocalPoint(e);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    interactionRef.current = {
      mode: "move",
      handle: null,
      startPointer: pt,
      startBox: cropBox,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const inter = interactionRef.current;
    if (!inter || !bounds) return;
    if (!cropBox && inter.mode === "move") return;

    const pt = getLocalPoint(e);
    const dx = pt.x - inter.startPointer.x;
    const dy = pt.y - inter.startPointer.y;

    const MIN = 60;
    const start = inter.startBox;
    let next: CropBox = { ...start };

    if (inter.mode === "move") {
      next.x = start.x + dx;
      next.y = start.y + dy;
    } else if (inter.mode === "resize" && inter.handle) {
      const h = inter.handle;
      if (h.includes("w")) {
        next.x = start.x + dx;
        next.w = start.w - dx;
      }
      if (h.includes("e")) {
        next.w = start.w + dx;
      }
      if (h.includes("n")) {
        next.y = start.y + dy;
        next.h = start.h - dy;
      }
      if (h.includes("s")) {
        next.h = start.h + dy;
      }

      // Normalize if dragging past edges.
      if (next.w < 0) {
        next.x = next.x + next.w;
        next.w = Math.abs(next.w);
      }
      if (next.h < 0) {
        next.y = next.y + next.h;
        next.h = Math.abs(next.h);
      }
    }

    // Clamp size and position within image bounds.
    next.w = clamp(next.w, MIN, bounds.maxX - bounds.minX);
    next.h = clamp(next.h, MIN, bounds.maxY - bounds.minY);
    next.x = clamp(next.x, bounds.minX, bounds.maxX - next.w);
    next.y = clamp(next.y, bounds.minY, bounds.maxY - next.h);

    setCropBox(next);
  }

  function onPointerUp() {
    interactionRef.current = null;
  }

  async function handleApply() {
    if (!imageUrl || !natural || !render || !bounds || !cropBox) return;
    try {
      setIsApplying(true);
      const cropRender = {
        x: cropBox.x - render.offsetX,
        y: cropBox.y - render.offsetY,
        w: cropBox.w,
        h: cropBox.h,
      };

      const blob = await cropImageToBlob({
        imageUrl,
        cropRender,
        natural,
        render,
        rotationDeg: rotationBucket,
      });

      await onApply(blob);
    } finally {
      setIsApplying(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-end justify-center bg-slate-950/60 p-3 sm:items-center">
      <div className="w-full max-w-3xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Crop</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{title ?? "Adjust your crop"}</div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            type="button"
            aria-label="Close crop modal"
          >
            Close
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="w-full sm:flex-1">
              <div
                ref={containerRef}
                className="relative h-[52vh] min-h-[340px] w-full overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50"
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {imageUrl && render ? (
                  <canvas
                    ref={previewCanvasRef}
                    className="absolute"
                    style={{
                      left: render.offsetX,
                      top: render.offsetY,
                      width: render.renderW,
                      height: render.renderH,
                      pointerEvents: "none",
                    }}
                  />
                ) : null}

                {cropBox && bounds ? (
                  <>
                    {/* Dim outside crop area */}
                    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                      <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: cropBox.y, background: "rgba(2,6,23,0.28)" }} />
                      <div style={{ position: "absolute", left: 0, top: cropBox.y + cropBox.h, width: "100%", height: Math.max(0, (container?.h ?? 0) - (cropBox.y + cropBox.h)), background: "rgba(2,6,23,0.28)" }} />
                      <div style={{ position: "absolute", left: 0, top: cropBox.y, width: cropBox.x, height: cropBox.h, background: "rgba(2,6,23,0.28)" }} />
                      <div style={{ position: "absolute", left: cropBox.x + cropBox.w, top: cropBox.y, width: Math.max(0, (container?.w ?? 0) - (cropBox.x + cropBox.w)), height: cropBox.h, background: "rgba(2,6,23,0.28)" }} />
                    </div>

                    <div
                      role="application"
                      aria-label="Crop frame"
                      onPointerDown={onCropPointerDown}
                      className="absolute"
                      style={{
                        left: cropBox.x,
                        top: cropBox.y,
                        width: cropBox.w,
                        height: cropBox.h,
                        border: "2px dashed rgba(17, 159, 130, 0.95)",
                        borderRadius: 16,
                        touchAction: "none",
                        background: "rgba(255,255,255,0.06)",
                      }}
                    />

                    {/* Handles */}
                    {(
                      [
                        ["nw", cropBox.x, cropBox.y],
                        ["n", cropBox.x + cropBox.w / 2, cropBox.y],
                        ["ne", cropBox.x + cropBox.w, cropBox.y],
                        ["e", cropBox.x + cropBox.w, cropBox.y + cropBox.h / 2],
                        ["se", cropBox.x + cropBox.w, cropBox.y + cropBox.h],
                        ["s", cropBox.x + cropBox.w / 2, cropBox.y + cropBox.h],
                        ["sw", cropBox.x, cropBox.y + cropBox.h],
                        ["w", cropBox.x, cropBox.y + cropBox.h / 2],
                      ] as [Handle, number, number][]
                    ).map(([handle, hx, hy]) => (
                      <div
                        key={handle}
                        data-handle={handle}
                        onPointerDown={(e) => {
                          if (!bounds || !cropBox) return;
                          e.stopPropagation();
                          const pt = getLocalPoint(e);
                          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                          interactionRef.current = {
                            mode: "resize",
                            handle,
                            startPointer: pt,
                            startBox: cropBox,
                          };
                        }}
                        style={{
                          position: "absolute",
                          left: hx - 7,
                          top: hy - 7,
                          width: 14,
                          height: 14,
                          borderRadius: 4,
                          background: "rgba(17, 159, 130, 0.98)",
                          boxShadow: "0 0 0 3px rgba(32,197,160,0.14)",
                          touchAction: "none",
                        }}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            </div>

            <div className="w-full sm:w-72">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Rotate</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRotationDeg((d) => d - 90)}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Rotate Left
                  </button>
                  <button
                    type="button"
                    onClick={() => setRotationDeg((d) => d + 90)}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Rotate Right
                  </button>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      // Reset to default A4 crop.
                      if (!bounds || !render) return;
                      const A4_RATIO = 210 / 297;
                      const maxW = render.renderW * 0.92;
                      const maxH = render.renderH * 0.92;
                      let targetW = maxW;
                      let targetH = targetW / A4_RATIO;
                      if (targetH > maxH) {
                        targetH = maxH;
                        targetW = targetH * A4_RATIO;
                      }
                      setCropBox({
                        x: bounds.minX + (bounds.maxX - bounds.minX - targetW) / 2,
                        y: bounds.minY + (bounds.maxY - bounds.minY - targetH) / 2,
                        w: targetW,
                        h: targetH,
                      });
                      setRotationDeg(0);
                    }}
                    className="w-full rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Default A4
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    disabled={isApplying}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApply()}
                    className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={isApplying || !cropBox}
                  >
                    {isApplying ? "Cropping..." : "Apply"}
                  </button>
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Drag the frame to move. Resize with handles. Rotate the image if needed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

