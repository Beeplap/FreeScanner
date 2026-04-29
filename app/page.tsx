"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { imagesToA4TwoUpPDF, imagesToPDF, pdfToImages } from "../src/utils/pdfUtils";
import CropModal from "../src/components/CropModal";
import { supabase, SUPABASE_SCANS_BUCKET, SUPABASE_SCAN_PAGES_TABLE } from "../src/lib/supabaseClient";

type ScanItem = {
  id: string;
  name: string;
  kind: "upload" | "camera" | "pdf-page";
  file: Blob;
  originalFile: Blob;
  previewUrl: string;
  originalPreviewUrl: string;
  createdAt: number;
  storagePath?: string | null;
  expiresAt?: number | null;
};

type CollageLayout = "grid" | "story" | "strip";

const collageOptions: { id: CollageLayout; label: string; detail: string }[] = [
  { id: "grid", label: "Photo Grid", detail: "Best for notes and receipts" },
  { id: "story", label: "Story Stack", detail: "Editorial vertical layout" },
  { id: "strip", label: "Film Strip", detail: "Compact horizontal preview" },
];

export default function Home() {
  const [items, setItems] = useState<ScanItem[]>([]);
  const [pdfOrderIds, setPdfOrderIds] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [collageLayout, setCollageLayout] = useState<CollageLayout>("grid");
  const [statusMessage, setStatusMessage] = useState("Ready.");
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [mergePreviewUrls, setMergePreviewUrls] = useState<string[]>([]);
  const SESSION_TTL_MS = 1000 * 60 * 30; // 30 minutes
  const isSupabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const [mergeMode, setMergeMode] = useState<"single" | "twoUp">("single");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropQueue, setCropQueue] = useState<string[]>([]);
  const [cropCursor, setCropCursor] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const itemsRef = useRef<ScanItem[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const supabaseUserIdRef = useRef<string | null>(null);
  const dragPdfIdRef = useRef<string | null>(null);
  const lastDragOverIdRef = useRef<string | null>(null);
  const [draggingPdfId, setDraggingPdfId] = useState<string | null>(null);
  const [dragOverPdfId, setDragOverPdfId] = useState<string | null>(null);

  const pdfOrderItems = useMemo(() => {
    const byId = new Map(items.map((it) => [it.id, it]));
    return pdfOrderIds.map((id) => byId.get(id)).filter(Boolean) as ScanItem[];
  }, [items, pdfOrderIds]);

  const previewOrderedItems = pdfOrderItems;

  const cropTargetId = cropQueue[cropCursor] ?? null;
  const cropTarget = useMemo(
    () => (cropTargetId ? items.find((item) => item.id === cropTargetId) ?? null : null),
    [cropTargetId, items]
  );

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    try {
      const existing = sessionStorage.getItem("freescanner_session_id");
      if (existing) {
        sessionIdRef.current = existing;
      } else {
        const id = crypto.randomUUID();
        sessionStorage.setItem("freescanner_session_id", id);
        sessionIdRef.current = id;
      }
    } catch {
      // sessionStorage may be blocked in some environments; fall back to a ref-only id.
      sessionIdRef.current = crypto.randomUUID();
    }

    (async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;

        if (userData.user) {
          supabaseUserIdRef.current = userData.user.id;
          setSupabaseReady(true);
          return;
        }

        const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) throw signInError;

        if (signInData.user) {
          supabaseUserIdRef.current = signInData.user.id;
          setSupabaseReady(true);
        }
      } catch {
        // If Supabase auth is blocked, we still keep the app fully functional in-memory.
        setSupabaseReady(false);
      }
    })();
  }, [isSupabaseConfigured]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        URL.revokeObjectURL(item.previewUrl);
        if (item.originalPreviewUrl !== item.previewUrl) {
          URL.revokeObjectURL(item.originalPreviewUrl);
        }
      });
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabaseReady) return;

    const handler = () => {
      void cleanupSessionBestEffort();
    };

    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [isSupabaseConfigured, supabaseReady]);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }

  function getExtFromBlobType(type: string) {
    if (type.includes("png")) return "png";
    if (type.includes("webp")) return "webp";
    return "jpg";
  }

  async function uploadItemToSupabase(params: {
    itemId: string;
    kind: ScanItem["kind"];
    name: string;
    blob: Blob;
  }) {
    const userId = supabaseUserIdRef.current;
    const sessionId = sessionIdRef.current;
    if (!isSupabaseConfigured || !supabaseReady || !userId || !sessionId) return null;

    const ext = getExtFromBlobType(params.blob.type || "");
    const storagePath = `${userId}/${sessionId}/${params.itemId}.${ext}`;
    const expiresAt = Date.now() + SESSION_TTL_MS;

    try {
      const contentType = params.blob.type || "image/jpeg";
      const { error: uploadError } = await supabase
        .storage
        .from(SUPABASE_SCANS_BUCKET)
        .upload(storagePath, params.blob, { contentType, upsert: false });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from(SUPABASE_SCAN_PAGES_TABLE).insert({
        id: params.itemId,
        user_id: userId,
        session_id: sessionId,
        storage_path: storagePath,
        kind: params.kind,
        name: params.name,
        created_at: new Date().toISOString(),
        expires_at: new Date(expiresAt).toISOString(),
      } as any);

      if (insertError) {
        // Avoid orphan objects if metadata insert fails.
        await supabase.storage.from(SUPABASE_SCANS_BUCKET).remove([storagePath]).catch(() => {});
        throw insertError;
      }

      return { storagePath, expiresAt };
    } catch {
      return null;
    }
  }

  async function updateCroppedItemInSupabase(item: ScanItem, croppedBlob: Blob) {
    const userId = supabaseUserIdRef.current;
    const sessionId = sessionIdRef.current;
    if (!isSupabaseConfigured || !supabaseReady || !userId || !sessionId) return null;
    if (!item.storagePath) return null;

    const ext = getExtFromBlobType(croppedBlob.type || "");
    const newStoragePath = `${userId}/${sessionId}/${item.id}.${ext}`;
    const expiresAt = Date.now() + SESSION_TTL_MS;

    try {
      const contentType = croppedBlob.type || "image/jpeg";
      await supabase.storage.from(SUPABASE_SCANS_BUCKET).upload(newStoragePath, croppedBlob, {
        contentType,
        upsert: true,
      });

      const { error: updateError } = await supabase
        .from(SUPABASE_SCAN_PAGES_TABLE)
        .update({
          storage_path: newStoragePath,
          name: item.name,
          kind: item.kind,
          expires_at: new Date(expiresAt).toISOString(),
        } as any)
        .eq("id", item.id)
        .eq("user_id", userId)
        .eq("session_id", sessionId);

      // If the row doesn't exist for some reason, fall back to insert.
      if (updateError) {
        const { error: insertError } = await supabase.from(SUPABASE_SCAN_PAGES_TABLE).insert({
          id: item.id,
          user_id: userId,
          session_id: sessionId,
          storage_path: newStoragePath,
          kind: item.kind,
          name: item.name,
          created_at: new Date().toISOString(),
          expires_at: new Date(expiresAt).toISOString(),
        } as any);

        if (insertError) throw insertError;
      }

      if (item.storagePath !== newStoragePath) {
        await supabase.storage.from(SUPABASE_SCANS_BUCKET).remove([item.storagePath]);
      }

      return { storagePath: newStoragePath, expiresAt };
    } catch {
      return null;
    }
  }

  async function deleteItemFromSupabase(item: ScanItem) {
    const userId = supabaseUserIdRef.current;
    const sessionId = sessionIdRef.current;
    if (!isSupabaseConfigured || !supabaseReady || !userId || !sessionId) return;
    if (!item.storagePath) return;

    const storagePath = item.storagePath;

    try {
      await supabase.storage.from(SUPABASE_SCANS_BUCKET).remove([storagePath]);
    } catch {
      // best-effort
    }

    try {
      await supabase
        .from(SUPABASE_SCAN_PAGES_TABLE)
        .delete()
        .eq("id", item.id)
        .eq("user_id", userId)
        .eq("session_id", sessionId);
    } catch {
      // best-effort
    }
  }

  async function cleanupSessionBestEffort() {
    const userId = supabaseUserIdRef.current;
    const sessionId = sessionIdRef.current;
    if (!isSupabaseConfigured || !supabaseReady || !userId || !sessionId) return;

    try {
      const { data: rows } = await supabase
        .from(SUPABASE_SCAN_PAGES_TABLE)
        .select("storage_path")
        .eq("user_id", userId)
        .eq("session_id", sessionId);

      const paths =
        rows
          ?.map((r: any) => r.storage_path)
          .filter((p: any) => typeof p === "string" && p.length > 0) ?? [];

      if (paths.length > 0) {
        await supabase.storage.from(SUPABASE_SCANS_BUCKET).remove(paths);
      }

      await supabase
        .from(SUPABASE_SCAN_PAGES_TABLE)
        .delete()
        .eq("user_id", userId)
        .eq("session_id", sessionId);
    } catch {
    }
  }

  async function addBlobItems(blobs: { blob: Blob; name: string; kind: ScanItem["kind"] }[]) {
    if (blobs.length === 0) return;

    const nextItems: ScanItem[] = blobs.map(({ blob, name, kind }) => ({
      id: crypto.randomUUID(),
      name,
      kind,
      file: blob,
      originalFile: blob,
      previewUrl: URL.createObjectURL(blob),
      originalPreviewUrl: URL.createObjectURL(blob),
      createdAt: Date.now(),
      storagePath: null,
      expiresAt: null,
    }));

    // Persist to Supabase (best-effort). If this fails, the app still works in-memory.
    if (isSupabaseConfigured && supabaseReady && nextItems.length > 0) {
      for (const item of nextItems) {
        const uploaded = await uploadItemToSupabase({
          itemId: item.id,
          kind: item.kind,
          name: item.name,
          blob: item.file,
        });
        if (uploaded) {
          item.storagePath = uploaded.storagePath;
          item.expiresAt = uploaded.expiresAt;
        }
      }
    }

    setItems((current) => [...nextItems, ...current]);
    setPdfOrderIds((current) => {
      const ids = nextItems.map((item) => item.id);
      return [...current, ...ids];
    });
  }

  async function handlePickedFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    setIsProcessing(true);
    setStatusMessage("Preparing your scans...");

    try {
      const nextBlobs: { blob: Blob; name: string; kind: ScanItem["kind"] }[] = [];

      for (const file of Array.from(fileList)) {
        if (file.type === "application/pdf") {
          const pdfPages = await pdfToImages(file);
          pdfPages.forEach((blob, index) => {
            nextBlobs.push({
              blob,
              name: `${file.name.replace(/\.pdf$/i, "")} page ${index + 1}`,
              kind: "pdf-page",
            });
          });
          continue;
        }

        nextBlobs.push({
          blob: file,
          name: file.name,
          kind: "upload",
        });
      }

      await addBlobItems(nextBlobs);
      setStatusMessage(`${nextBlobs.length} item${nextBlobs.length > 1 ? "s" : ""} added to your workspace.`);
    } catch {
      setStatusMessage("Could not process one of the files. Try images or a standard PDF.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleCameraOpen() {
    setCameraError(null);
    stopCamera();
    setIsCameraOpen(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraReady(true);
      setStatusMessage("Camera connected. Frame your document and capture.");
    } catch {
      setCameraError("Camera access was blocked. Allow permission in the browser and try again.");
      setStatusMessage("Camera permission is needed to scan with phone or laptop camera.");
    }
  }

  async function captureFrame() {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (!value) {
          reject(new Error("Failed to capture frame"));
          return;
        }
        resolve(value);
      }, "image/jpeg", 0.95);
    });

    await addBlobItems([
      {
        blob,
        name: `Camera scan ${new Date().toLocaleTimeString()}`,
        kind: "camera",
      },
    ]);

    setStatusMessage("Captured from camera and added to your scan tray.");
  }

  function closeCamera() {
    stopCamera();
    setIsCameraOpen(false);
  }

  function toggleSelected(id: string) {
    setPdfOrderIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]
    );
  }

  function movePdfOrder(id: string, delta: number) {
    setPdfOrderIds((current) => {
      const idx = current.indexOf(id);
      if (idx === -1) return current;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= current.length) return current;
      const copy = [...current];
      const tmp = copy[idx];
      copy[idx] = copy[nextIdx];
      copy[nextIdx] = tmp;
      return copy;
    });
  }

  function handlePdfDragStart(id: string) {
    dragPdfIdRef.current = id;
  }

  function handlePdfDragOver(overId: string) {
    const draggedId = dragPdfIdRef.current;
    if (!draggedId || draggedId === overId) return;

    setPdfOrderIds((current) => {
      const from = current.indexOf(draggedId);
      const to = current.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      return next;
    });

    dragPdfIdRef.current = overId;
  }

  function handlePdfDragEnd() {
    dragPdfIdRef.current = null;
  }

  function startHandleDrag(id: string, e: React.PointerEvent) {
    const isSelected = pdfOrderIds.includes(id);
    if (!isSelected) return;

    dragPdfIdRef.current = id;
    setDraggingPdfId(id);
    lastDragOverIdRef.current = id;

    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const card = el?.closest?.('[data-pdf-card="true"]') as HTMLElement | null;
      const overId = card?.getAttribute?.("data-pdf-id") ?? null;
      if (!overId) return;
      if (overId === dragPdfIdRef.current) return;
      if (lastDragOverIdRef.current === overId) return;

      handlePdfDragOver(overId);
      lastDragOverIdRef.current = overId;
      setDragOverPdfId(overId);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      dragPdfIdRef.current = null;
      lastDragOverIdRef.current = null;
      setDraggingPdfId(null);
      setDragOverPdfId(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function startCropForPdfOrder() {
    if (pdfOrderItems.length === 0) {
      setStatusMessage("Select images first to crop.");
      return;
    }
    setCropQueue(pdfOrderItems.map((item) => item.id));
    setCropCursor(0);
    setCropOpen(true);
    setStatusMessage(
      `Cropping ${pdfOrderItems.length} page${pdfOrderItems.length > 1 ? "s" : ""} for PDF...`
    );
  }

  function startCropForOne(itemId: string) {
    setCropQueue([itemId]);
    setCropCursor(0);
    setCropOpen(true);
    setStatusMessage("Editing selected image...");
  }

  function cancelCrop() {
    setCropOpen(false);
    setCropQueue([]);
    setCropCursor(0);
    setStatusMessage("Crop cancelled.");
  }

  async function handleCropApply(croppedBlob: Blob) {
    if (!cropTargetId) return;

    const targetId = cropTargetId;
    const queueLen = cropQueue.length;
    const nextCursor = cropCursor + 1;
    const newPreviewUrl = URL.createObjectURL(croppedBlob);

    const targetItem = itemsRef.current.find((item) => item.id === targetId) ?? null;

    setItems((current) =>
      current.map((item) => {
        if (item.id !== targetId) return item;

        // Treat the crop as the new "original" so subsequent crops revoke correctly.
        if (item.previewUrl !== newPreviewUrl) URL.revokeObjectURL(item.previewUrl);
        if (item.originalPreviewUrl !== newPreviewUrl) URL.revokeObjectURL(item.originalPreviewUrl);

        return {
          ...item,
          file: croppedBlob,
          originalFile: croppedBlob,
          previewUrl: newPreviewUrl,
          originalPreviewUrl: newPreviewUrl,
        };
      })
    );

    if (nextCursor >= queueLen) {
      setCropOpen(false);
      setCropQueue([]);
      setCropCursor(0);
      setStatusMessage("Cropping done.");
    } else {
      setCropCursor(nextCursor);
      setStatusMessage(`Cropped ${nextCursor} of ${queueLen}.`);
    }

    // Persist cropped version to Supabase best-effort.
    if (targetItem) {
      void updateCroppedItemInSupabase(targetItem, croppedBlob).then((updated) => {
        if (!updated) return;
        setItems((current) =>
          current.map((item) => {
            if (item.id !== targetId) return item;
            return { ...item, storagePath: updated.storagePath, expiresAt: updated.expiresAt };
          })
        );
      });
    }
  }

  function removeItem(id: string) {
    const target = itemsRef.current.find((item) => item.id === id) ?? null;
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        if (target.originalPreviewUrl !== target.previewUrl) URL.revokeObjectURL(target.originalPreviewUrl);
      }
      return current.filter((item) => item.id !== id);
    });

    setPdfOrderIds((current) => current.filter((itemId) => itemId !== id));

    if (target) {
      void deleteItemFromSupabase(target);
    }
  }

  async function exportPdf() {
    if (pdfOrderItems.length === 0) {
      setStatusMessage("Select pages to merge.");
      return;
    }

    setStatusMessage("Building your PDF...");
    const blobsInOrder = pdfOrderItems.map((item) => item.file);
    const blobsForExport = blobsInOrder;

    const pdfBytes =
      mergeMode === "twoUp"
        ? await imagesToA4TwoUpPDF(blobsForExport)
        : await imagesToPDF(blobsForExport);
    const pdfBlob = new Blob([Uint8Array.from(pdfBytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(pdfBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = mergeMode === "twoUp" ? "freescanner-2up.pdf" : "freescanner-export.pdf";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("PDF downloaded successfully.");
  }

  // Collage export removed (PDF-only).

  async function generateMergePreview() {
    if (pdfOrderItems.length === 0) {
      setMergePreviewUrls([]);
      return;
    }

    const runToken = Symbol("preview");
    (generateMergePreview as any)._token = runToken;

    setIsGeneratingPreview(true);
    try {
      const A4_WIDTH = 595.28;
      const A4_HEIGHT = 841.89;
      const W = 900;
      const H = Math.round((W * A4_HEIGHT) / A4_WIDTH);
      const margin = 44;
      const gap = 34;

      const orderedItems = pdfOrderItems;

      const previews: string[] = [];

      const drawContainImage = (
        ctx: CanvasRenderingContext2D,
        img: HTMLImageElement,
        x: number,
        y: number,
        w: number,
        h: number
      ) => {
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih) return;
        const scale = Math.min(w / iw, h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = x + (w - dw) / 2;
        const dy = y + (h - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
      };

      const limitProduced =
        mergeMode === "single" ? Math.min(orderedItems.length, 4) : Math.min(Math.ceil(orderedItems.length / 2), 4);

      if (mergeMode === "single") {
        for (let i = 0; i < limitProduced; i++) {
          const item = orderedItems[i];
          const img = await loadImage(item.previewUrl);

          const canvas = document.createElement("canvas");
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, W, H);

          drawContainImage(ctx, img, margin, margin, W - margin * 2, H - margin * 2);

          previews.push(canvas.toDataURL("image/jpeg", 0.9));

          if ((generateMergePreview as any)._token !== runToken) return;
        }
      } else {
        for (let pairIndex = 0; pairIndex < limitProduced; pairIndex++) {
          const topItem = orderedItems[pairIndex * 2];
          const bottomItem = orderedItems[pairIndex * 2 + 1];

          const canvas = document.createElement("canvas");
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, W, H);

          const contentH = H - margin * 2;
          const halfH = (contentH - gap) / 2;

          if (topItem) {
            const topImg = await loadImage(topItem.previewUrl);
            drawContainImage(ctx, topImg, margin, margin, W - margin * 2, halfH);
          }
          if (bottomItem) {
            const bottomImg = await loadImage(bottomItem.previewUrl);
            drawContainImage(ctx, bottomImg, margin, margin + halfH + gap, W - margin * 2, halfH);
          }

          previews.push(canvas.toDataURL("image/jpeg", 0.9));

          if ((generateMergePreview as any)._token !== runToken) return;
        }
      }

      setMergePreviewUrls(previews);
    } catch {
      setMergePreviewUrls([]);
    } finally {
      setIsGeneratingPreview(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-4 text-slate-900 sm:px-6 lg:px-8">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          void handlePickedFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div className="mx-auto max-w-7xl">
        <main className="space-y-4">
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-400 via-teal-400 to-sky-500 text-lg font-semibold text-white">
                FS
              </div>
              <div>
                <div className="display-font text-xl font-semibold">FreeScanner</div>
                <div className="text-sm text-slate-500">{items.length} page{items.length === 1 ? "" : "s"}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl bg-sky-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-900"
              >
                Import
              </button>
              <button
                onClick={() => void handleCameraOpen()}
                className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                Camera
              </button>
            </div>
          </header>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="glass-panel rounded-[32px] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Your Pages</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">Select scans</h2>
                </div>
                <div className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200">
                  {pdfOrderIds.length} pages in PDF
                </div>
              </div>

              <div
                className={`mt-5 grid gap-4 ${mergeMode === "twoUp" ? "grid-cols-2" : "grid-cols-1"} sm:grid-cols-2 2xl:grid-cols-3`}
              >
                {items.length === 0 ? (
                  <div className="col-span-full rounded-[28px] border border-dashed border-slate-200 bg-white px-6 py-14 text-center text-slate-500">
                    Start by importing images/PDF or opening the camera.
                  </div>
                ) : (
                  items.map((item) => {
                    const selected = pdfOrderIds.includes(item.id);
                    const pdfIndex = pdfOrderIds.indexOf(item.id);
                    return (
                      <article
                        key={item.id}
                        className={`relative overflow-hidden rounded-[28px] border bg-white shadow-sm transition ${
                          selected
                            ? mergeMode === "twoUp"
                              ? pdfIndex % 2 === 0
                                ? "border-emerald-300 shadow-emerald-100"
                                : "border-sky-300 shadow-sky-100"
                              : "border-emerald-300 shadow-emerald-100"
                            : "border-white"
                        } ${draggingPdfId === item.id ? "opacity-80" : "opacity-100"} ${
                          dragOverPdfId === item.id ? "ring-2 ring-emerald-300" : ""
                        }`}
                        style={selected && mergeMode === "twoUp" ? { boxShadow: "none" } : undefined}
                        data-pdf-card="true"
                        data-pdf-id={item.id}
                      >
                        <div className="absolute left-3 top-3 z-30">
                          {selected ? (
                            <button
                              type="button"
                              aria-label="Drag to reorder"
                              className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white shadow-sm"
                              style={{
                                cursor: "grab",
                                opacity: draggingPdfId === item.id ? 0.95 : 0.9,
                                transform: draggingPdfId === item.id ? "scale(1.03)" : undefined,
                              }}
                              onPointerDown={(e) => startHandleDrag(item.id, e)}
                            >
                              ⠿
                            </button>
                          ) : null}
                        </div>
                        <button onClick={() => toggleSelected(item.id)} className="block w-full" type="button">
                          <img src={item.previewUrl} alt={item.name} className="aspect-4/3 w-full object-cover" />
                        </button>
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
                            {selected ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startCropForOne(item.id)}
                                  className="flex-1 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleSelected(item.id)}
                                  className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                                >
                                  Unselect
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-100"
                                >
                                  Delete
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => toggleSelected(item.id)}
                                className="flex-1 rounded-2xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                              >
                                Select
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>

            <div className="glass-panel rounded-[32px] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Export PDF</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">Crop + merge</h2>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                  {pdfOrderItems.length} pages
                </div>
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

              {/* flip removed: front/back order is decided by drag order */}
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
                  <p className="text-sm font-semibold text-slate-800">
                    Preview (first {mergeMode === "twoUp" ? "2-up pages" : "pages"})
                  </p>
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

                      const topItem =
                        mergeMode === "twoUp" ? previewOrderedItems[pageIdx * 2] : previewOrderedItems[pageIdx];
                      const bottomItem =
                        mergeMode === "twoUp" ? previewOrderedItems[pageIdx * 2 + 1] : null;

                      return (
                        <div
                          key={pageNumber}
                          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-2"
                        >
                          <div className="absolute left-2 top-2 z-10 rounded-full bg-slate-950 px-2 py-0.5 text-[11px] font-semibold text-white">
                            {pageNumber}
                          </div>

                          <div className="sm:hidden">
                      {mergeMode === "twoUp" ? (
                              <div className="flex gap-2">
                                <div className="flex-1">
                            {topItem ? (
                                    <img
                                      src={topItem.previewUrl}
                                      alt={`Front ${pageNumber}`}
                                      className="aspect-[3/4] w-full rounded-lg border border-slate-200 bg-white object-cover"
                                    />
                                  ) : (
                                    <div className="aspect-[3/4] w-full rounded-lg border border-slate-200 bg-slate-50" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  {bottomItem ? (
                                    <img
                                      src={bottomItem.previewUrl}
                                      alt={`Back ${pageNumber}`}
                                      className="aspect-[3/4] w-full rounded-lg border border-slate-200 bg-white object-cover"
                                    />
                                  ) : (
                                    <div className="aspect-[3/4] w-full rounded-lg border border-slate-200 bg-slate-50" />
                                  )}
                                </div>
                              </div>
                            ) : topItem ? (
                              <img
                                src={topItem.previewUrl}
                                alt={`Page ${pageNumber}`}
                                className="aspect-[3/4] w-full rounded-lg border border-slate-200 bg-white object-cover"
                              />
                            ) : (
                              <div className="aspect-[3/4] w-full rounded-lg border border-slate-200 bg-slate-50" />
                            )}
                          </div>

                          <div className="hidden sm:block">
                            {mergedUrl ? (
                              <img
                                src={mergedUrl}
                                alt={`Merged preview page ${pageNumber}`}
                                className="aspect-[3/4] w-full rounded-lg border border-slate-200 bg-white object-cover"
                              />
                            ) : (
                              <div className="aspect-[3/4] w-full rounded-lg border border-slate-200 bg-slate-50" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                  <button
                    type="button"
                    onClick={() => void generateMergePreview()}
                    disabled={pdfOrderItems.length === 0 || isGeneratingPreview}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Generate Preview
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">{isProcessing ? "Working..." : "Status"}</p>
                <p className="mt-1 leading-6">{isProcessing ? "Processing files..." : statusMessage}</p>
              </div>
            </div>
          </section>
        </main>
      </div>

      <CropModal
        open={cropOpen}
        imageUrl={cropTarget?.previewUrl ?? null}
        title={cropTarget ? `Crop: ${cropTarget.name}` : "Crop selected image"}
        onCancel={cancelCrop}
        onApply={handleCropApply}
      />

      {isCameraOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl overflow-hidden rounded-[32px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Live Scanner</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Camera permission powered capture</h2>
              </div>
              <button onClick={closeCamera} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
                Close
              </button>
            </div>

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="bg-slate-950 p-4">
                <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-900">
                  <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
                  <div className="pointer-events-none absolute inset-0 m-8 rounded-[32px] border-2 border-dashed border-emerald-300/80" />
                </div>
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-[24px] bg-slate-50 p-4 text-sm text-slate-600">
                  {cameraError ? cameraError : "On mobile, this opens the rear camera when supported. On desktop, use your webcam to capture documents."}
                </div>
                <button
                  onClick={() => void captureFrame()}
                  disabled={!cameraReady}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Capture Document
                </button>
                <button
                  onClick={closeCamera}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                >
                  Finish
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function renderCollage(items: ScanItem[], layout: CollageLayout) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas not supported");
  }

  const effectiveLayout: CollageLayout = layout === "story" && items.length > 4 ? "grid" : layout;
  const images = await Promise.all(items.map((item) => loadImage(item.previewUrl)));

  if (effectiveLayout === "strip") {
    canvas.width = 1800;
    canvas.height = 600;
    context.fillStyle = "#f4f7fb";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const gap = 28;
    const width = (canvas.width - gap * (images.length + 1)) / images.length;
    images.forEach((image, index) => {
      const x = gap + index * (width + gap);
      drawCoverImage(context, image, x, 28, width, canvas.height - 56);
    });

    return canvas;
  }

  if (effectiveLayout === "story") {
    canvas.width = 1080;
    canvas.height = 1600;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const heights = [620, 400, 400];
    if (!images[0]) return canvas;
    drawCoverImage(context, images[0], 32, 32, canvas.width - 64, heights[0]);

    const lowerImages = images.slice(1, 3);
    lowerImages.forEach((image, index) => {
      drawCoverImage(context, image, 32 + index * 508, 684, 476, heights[1]);
    });

    if (images[3]) {
      drawCoverImage(context, images[3], 32, 1116, canvas.width - 64, heights[2]);
    }

    return canvas;
  }

  canvas.width = 1400;
  context.fillStyle = "#ffffff";

  const gap = 28;
  const cell = (canvas.width - gap * 3) / 2;
  const rows = Math.max(1, Math.ceil(images.length / 2));
  const height = gap + rows * cell + (rows - 1) * gap;
  canvas.height = height;
  context.fillRect(0, 0, canvas.width, canvas.height);

  images.forEach((image, index) => {
    const x = gap + (index % 2) * (cell + gap);
    const y = gap + Math.floor(index / 2) * (cell + gap);
    drawCoverImage(context, image, x, y, cell, cell);
  });

  return canvas;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = src;
  });
}

function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const imageRatio = image.width / image.height;
  const frameRatio = width / height;

  let drawWidth = width;
  let drawHeight = height;
  let offsetX = x;
  let offsetY = y;

  if (imageRatio > frameRatio) {
    drawWidth = height * imageRatio;
    offsetX = x - (drawWidth - width) / 2;
  } else {
    drawHeight = width / imageRatio;
    offsetY = y - (drawHeight - height) / 2;
  }

  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, 26);
  context.clip();
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  context.restore();
}
