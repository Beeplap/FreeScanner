"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type CropAspectPreset = {
  id: string;
  label: string;
  ratio: number; // width / height
};

type CropModalProps = {
  open: boolean;
  imageUrl: string | null;
  title?: string;
  aspectPresets: CropAspectPreset[];
  initialAspectId: string;
  onCancel: () => void;
  onApply: (croppedBlob: Blob) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

async function cropImageToBlob(params: {
  imageUrl: string;
  crop: { x: number; y: number; w: number; h: number };
  natural: { w: number; h: number };
  display: { w: number; h: number };
}) {
  const { imageUrl, crop, natural, display } = params;
  const img = new Image();
  img.src = imageUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image failed to load for cropping"));
  });

  const scaleX = natural.w / display.w;
  const scaleY = natural.h / display.h;

  const sx = Math.round(crop.x * scaleX);
  const sy = Math.round(crop.y * scaleY);
  const sw = Math.round(crop.w * scaleX);
  const sh = Math.round(crop.h * scaleY);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) reject(new Error("Failed to create cropped blob"));
      else resolve(b);
    }, "image/jpeg", 0.95);
  });

  return blob;
}

export default function CropModal({
  open,
  imageUrl,
  title,
  aspectPresets,
  initialAspectId,
  onCancel,
  onApply,
}: CropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [display, setDisplay] = useState<{ w: number; h: number } | null>(null);
  const [aspectId, setAspectId] = useState(initialAspectId);
  const [sizeFraction, setSizeFraction] = useState(0.78); // crop size relative to available dims
  const [centerN, setCenterN] = useState({ x: 0.5, y: 0.5 });
  const [isApplying, setIsApplying] = useState(false);

  const aspect = useMemo(() => {
    return aspectPresets.find((p) => p.id === aspectId) ?? aspectPresets[0];
  }, [aspectId, aspectPresets]);

  // Load natural size when modal opens
  useEffect(() => {
    if (!open || !imageUrl) return;
    setNatural(null);
    setDisplay(null);
    setCenterN({ x: 0.5, y: 0.5 });

    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    };
  }, [open, imageUrl]);

  // Fit into container
  useEffect(() => {
    if (!open || !natural) return;
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const maxW = Math.max(1, rect.width);
      const maxH = Math.max(1, rect.height);
      const scale = Math.min(maxW / natural.w, maxH / natural.h);
      setDisplay({ w: natural.w * scale, h: natural.h * scale });
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, natural]);

  // Keep aspect in sync when opening a new image queue
  useEffect(() => {
    if (!open) return;
    setAspectId(initialAspectId);
    setSizeFraction(0.78);
  }, [open, initialAspectId]);

  const crop = useMemo(() => {
    if (!display) return null;
    const W = display.w;
    const H = display.h;
    const a = aspect.ratio; // w/h

    let cropW: number;
    let cropH: number;

    if (a >= 1) {
      cropW = W * sizeFraction;
      cropH = cropW / a;
      if (cropH > H) {
        cropH = H * sizeFraction;
        cropW = cropH * a;
      }
    } else {
      cropH = H * sizeFraction;
      cropW = cropH * a;
      if (cropW > W) {
        cropW = W * sizeFraction;
        cropH = cropW / a;
      }
    }

    const xMax = Math.max(0, W - cropW);
    const yMax = Math.max(0, H - cropH);
    const cx = clamp(centerN.x, 0, 1) * W;
    const cy = clamp(centerN.y, 0, 1) * H;
    const x = clamp(cx - cropW / 2, 0, xMax);
    const y = clamp(cy - cropH / 2, 0, yMax);

    return { x, y, w: cropW, h: cropH };
  }, [display, aspect.ratio, centerN.x, centerN.y, sizeFraction]);

  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startCenterX: number; startCenterY: number } | null>(
    null
  );

  function onPointerDown(e: React.PointerEvent) {
    if (!open || !display || !crop) return;
    // Only drag when interacting with the frame
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startCenterX: centerN.x,
      startCenterY: centerN.y,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !display || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nextCenterX = dragRef.current.startCenterX + dx / display.w;
    const nextCenterY = dragRef.current.startCenterY + dy / display.h;
    setCenterN({ x: clamp(nextCenterX, 0, 1), y: clamp(nextCenterY, 0, 1) });
  }

  function onPointerUp() {
    setDragging(false);
    dragRef.current = null;
  }

  async function handleApply() {
    if (!imageUrl || !natural || !display || !crop) return;
    try {
      setIsApplying(true);
      const blob = await cropImageToBlob({
        imageUrl,
        crop,
        natural,
        display,
      });
      onApply(blob);
    } finally {
      setIsApplying(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-3 sm:items-center">
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
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="To crop"
                    style={
                      display
                        ? {
                            width: display.w,
                            height: display.h,
                            objectFit: "contain",
                          }
                        : { maxWidth: "100%", maxHeight: "100%" }
                    }
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
                    draggable={false}
                  />
                ) : null}

                {crop ? (
                  <>
                    <div
                      role="slider"
                      aria-label="Crop frame"
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                      className="absolute"
                      style={{
                        left: crop.x,
                        top: crop.y,
                        width: crop.w,
                        height: crop.h,
                        border: "2px solid rgba(17, 159, 130, 0.95)",
                        borderRadius: 18,
                        boxShadow: "0 0 0 6px rgba(32,197,160,0.12)",
                        touchAction: "none",
                      }}
                    />
                    {/* Subtle grid */}
                    <div
                      className="absolute"
                      style={{
                        left: crop.x,
                        top: crop.y,
                        width: crop.w,
                        height: crop.h,
                        borderRadius: 18,
                        pointerEvents: "none",
                        backgroundImage:
                          "linear-gradient(to right, rgba(17, 159, 130, 0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(17, 159, 130, 0.22) 1px, transparent 1px)",
                        backgroundSize: `${Math.max(8, crop.w / 3)}px ${Math.max(8, crop.h / 3)}px`,
                        mixBlendMode: "multiply",
                        opacity: 0.45,
                      }}
                    />
                  </>
                ) : null}
              </div>
            </div>

            <div className="w-full sm:w-72">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">Aspect ratio</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {aspectPresets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setAspectId(p.id)}
                      className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                        aspectId === p.id ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">Zoom</div>
                    <div className="text-xs font-semibold text-slate-500">{Math.round(sizeFraction * 100)}%</div>
                  </div>
                  <input
                    type="range"
                    min={0.45}
                    max={0.95}
                    step={0.01}
                    value={sizeFraction}
                    onChange={(e) => setSizeFraction(Number(e.target.value))}
                    className="mt-3 w-full accent-emerald-500"
                  />
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setCenterN({ x: 0.5, y: 0.5 })}
                    className="w-full rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                  >
                    Center crop
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
                    disabled={isApplying || !crop}
                  >
                    {isApplying ? "Cropping..." : "Apply"}
                  </button>
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Drag the frame to reposition. Use Zoom and Aspect ratio to crop.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

