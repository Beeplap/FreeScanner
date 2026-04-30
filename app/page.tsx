"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { imagesToFullPageA4PDF, pdfToImages } from "../src/utils/pdfUtils";
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
  edit: PageEdit;
};

type CollageLayout = "grid" | "story" | "strip";
type PageFilter = "none" | "grayscale" | "bw" | "enhanced";

type PageEdit = {
  offsetX: number;
  offsetY: number;
  zoom: number;
  rotation: number;
  crop: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  filter: PageFilter;
};

type ImageSize = { w: number; h: number };
type EditorFrame = { x: number; y: number; w: number; h: number };
type EditorBox = EditorFrame & { rotation: number };
type TransformHandle = "nw" | "ne" | "se" | "sw";

const defaultPageEdit: PageEdit = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
  rotation: 0,
  crop: { top: 0, right: 0, bottom: 0, left: 0 },
  filter: "none",
};

const A4_RATIO = 595.28 / 841.89;

const filterOptions: { id: PageFilter; label: string }[] = [
  { id: "none", label: "Original" },
  { id: "grayscale", label: "Grayscale" },
  { id: "bw", label: "Black & white" },
  { id: "enhanced", label: "Enhanced B/W" },
];

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v6h6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function RotateLeftIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7v6h6" />
      <path d="M20 17a8 8 0 0 0-13.7-5.7L4 13" />
    </svg>
  );
}

function RotateRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 7v6h-6" />
      <path d="M4 17a8 8 0 0 1 13.7-5.7L20 13" />
    </svg>
  );
}

const collageOptions: { id: CollageLayout; label: string; detail: string }[] = [
  { id: "grid", label: "Photo Grid", detail: "Best for notes and receipts" },
  { id: "story", label: "Story Stack", detail: "Editorial vertical layout" },
  { id: "strip", label: "Film Strip", detail: "Compact horizontal preview" },
];

export default function Home() {
  const [isClient, setIsClient] = useState(false);
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
  const [pdfEditorPageIndex, setPdfEditorPageIndex] = useState<number | null>(null);
  const [pdfEditorActiveId, setPdfEditorActiveId] = useState<string | null>(null);
  const [pdfEditorPreviewUrl, setPdfEditorPreviewUrl] = useState<string | null>(null);
  const [isRenderingPdfEditor, setIsRenderingPdfEditor] = useState(false);
  const [pdfEditorImageSizes, setPdfEditorImageSizes] = useState<Record<string, ImageSize>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfEditorPageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const itemsRef = useRef<ScanItem[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const supabaseUserIdRef = useRef<string | null>(null);
  const dragPdfIdRef = useRef<string | null>(null);
  const previewTokenRef = useRef<symbol | null>(null);
  const pdfEditorTokenRef = useRef<symbol | null>(null);
  const transformRef = useRef<{
    mode: "move" | "resize";
    handle?: TransformHandle;
    pointerId: number;
    startPointer: { x: number; y: number };
    startEdit: PageEdit;
    startBox: EditorBox;
    frame: EditorFrame;
  } | null>(null);
  const [draggingPdfId, setDraggingPdfId] = useState<string | null>(null);
  const [dragOverPdfId, setDragOverPdfId] = useState<string | null>(null);

  const pdfOrderItems = useMemo(() => {
    const byId = new Map(items.map((it) => [it.id, it]));
    return pdfOrderIds.map((id) => byId.get(id)).filter(Boolean) as ScanItem[];
  }, [items, pdfOrderIds]);

  const previewOrderedItems = pdfOrderItems;

  const displayItems = useMemo(() => {
    const selectedSet = new Set(pdfOrderIds);
    const unselected = items.filter((item) => !selectedSet.has(item.id));
    return [...pdfOrderItems, ...unselected];
  }, [items, pdfOrderIds, pdfOrderItems]);

  const cropTargetId = cropQueue[cropCursor] ?? null;
  const cropTarget = useMemo(
    () => (cropTargetId ? items.find((item) => item.id === cropTargetId) ?? null : null),
    [cropTargetId, items]
  );
  const pdfEditorItems = useMemo(() => {
    if (pdfEditorPageIndex === null) return [];
    if (mergeMode === "twoUp") {
      return pdfOrderItems.slice(pdfEditorPageIndex * 2, pdfEditorPageIndex * 2 + 2);
    }
    return pdfOrderItems.slice(pdfEditorPageIndex, pdfEditorPageIndex + 1);
  }, [mergeMode, pdfEditorPageIndex, pdfOrderItems]);

  const pdfEditorActiveItem = useMemo(
    () => (pdfEditorActiveId ? pdfEditorItems.find((item) => item.id === pdfEditorActiveId) ?? null : null),
    [pdfEditorActiveId, pdfEditorItems]
  );
  const pdfEditorActiveIndex = useMemo(
    () => (pdfEditorActiveId ? pdfEditorItems.findIndex((item) => item.id === pdfEditorActiveId) : -1),
    [pdfEditorActiveId, pdfEditorItems]
  );
  const pdfEditorActiveSize = pdfEditorActiveItem ? pdfEditorImageSizes[pdfEditorActiveItem.id] ?? null : null;
  const pdfEditorBox = useMemo(() => {
    if (!pdfEditorActiveItem || !pdfEditorActiveSize || pdfEditorActiveIndex < 0) return null;
    return getEditorBox(pdfEditorActiveItem, pdfEditorActiveSize, mergeMode, pdfEditorActiveIndex);
  }, [mergeMode, pdfEditorActiveIndex, pdfEditorActiveItem, pdfEditorActiveSize]);

  useEffect(() => {
    setIsClient(true);
  }, []);

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

  useEffect(() => {
    if (pdfOrderIds.length === 0) {
      const timeout = window.setTimeout(() => setMergePreviewUrls([]), 0);
      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => {
      void generateMergePreview();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [items, pdfOrderIds, mergeMode]);

  useEffect(() => {
    if (pdfEditorPageIndex === null || pdfEditorItems.length === 0) {
      setPdfEditorPreviewUrl(null);
      return;
    }

    const runToken = Symbol("pdf-editor");
    pdfEditorTokenRef.current = runToken;
    let nextUrl: string | null = null;
    setIsRenderingPdfEditor(true);

    void renderEditedPdfPages(pdfEditorItems, mergeMode, 900)
      .then(async (pages) => {
        if (pdfEditorTokenRef.current !== runToken) return;
        if (!pages[0]) return;
        nextUrl = await blobToDataUrl(pages[0]);
        if (pdfEditorTokenRef.current !== runToken) return;
        setPdfEditorPreviewUrl((current) => {
          return nextUrl ?? current;
        });
      })
      .finally(() => {
        if (pdfEditorTokenRef.current === runToken) {
          setIsRenderingPdfEditor(false);
        }
      });
  }, [pdfEditorItems, mergeMode, pdfEditorPageIndex]);

  useEffect(() => {
    if (pdfEditorPageIndex === null) return;
    if (pdfEditorItems.length === 0) {
      setPdfEditorPageIndex(null);
      setPdfEditorActiveId(null);
      return;
    }
    if (!pdfEditorActiveId || !pdfEditorItems.some((item) => item.id === pdfEditorActiveId)) {
      setPdfEditorActiveId(pdfEditorItems[0].id);
    }
  }, [pdfEditorActiveId, pdfEditorItems, pdfEditorPageIndex]);

  useEffect(() => {
    if (!pdfEditorActiveItem) return;
    if (pdfEditorImageSizes[pdfEditorActiveItem.id]) return;

    let cancelled = false;
    void loadImage(pdfEditorActiveItem.previewUrl)
      .then((image) => {
        if (cancelled) return;
        setPdfEditorImageSizes((current) => ({
          ...current,
          [pdfEditorActiveItem.id]: {
            w: image.naturalWidth || image.width,
            h: image.naturalHeight || image.height,
          },
        }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pdfEditorActiveItem, pdfEditorImageSizes]);

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
      edit: { ...defaultPageEdit, crop: { ...defaultPageEdit.crop } },
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
    if (!pdfOrderIds.includes(id)) return;
    dragPdfIdRef.current = id;
    setDraggingPdfId(id);
    setDragOverPdfId(id);
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
  }

  function handlePdfDragEnd() {
    dragPdfIdRef.current = null;
    setDraggingPdfId(null);
    setDragOverPdfId(null);
  }

  function onCardDragStart(id: string, e: React.DragEvent<HTMLElement>) {
    handlePdfDragStart(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function onCardDragOver(overId: string, e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragOverPdfId(overId);
    handlePdfDragOver(overId);
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
          edit: { ...defaultPageEdit, crop: { ...defaultPageEdit.crop } },
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
    setPdfEditorActiveId((current) => (current === id ? null : current));

    if (target) {
      void deleteItemFromSupabase(target);
    }
  }

  function openPdfPageEditor(pageIndex: number) {
    const pageItems =
      mergeMode === "twoUp"
        ? pdfOrderItems.slice(pageIndex * 2, pageIndex * 2 + 2)
        : pdfOrderItems.slice(pageIndex, pageIndex + 1);
    if (pageItems.length === 0) return;
    setPdfEditorPageIndex(pageIndex);
    setPdfEditorActiveId(pageItems[0].id);
    setStatusMessage("Adjust the A4 PDF page before downloading.");
  }

  function closePdfPageEditor() {
    setPdfEditorPageIndex(null);
    setPdfEditorActiveId(null);
    setPdfEditorPreviewUrl(null);
  }

  function updatePageEdit(
    id: string,
    patch: Partial<Omit<PageEdit, "crop">> & { crop?: Partial<PageEdit["crop"]> }
  ) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          edit: {
            ...item.edit,
            ...patch,
            crop: patch.crop ? { ...item.edit.crop, ...patch.crop } : item.edit.crop,
          },
        };
      })
    );
    setMergePreviewUrls([]);
  }

  function resetPageEdit(id: string) {
    updatePageEdit(id, { ...defaultPageEdit, crop: { ...defaultPageEdit.crop } });
  }

  function getEditorPointer(e: React.PointerEvent) {
    const el = pdfEditorPageRef.current;
    if (!el) return { x: e.clientX, y: e.clientY };
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function beginTransform(e: React.PointerEvent<HTMLDivElement>, mode: "move" | "resize", handle?: TransformHandle) {
    if (!pdfEditorActiveItem || !pdfEditorBox || !pdfEditorActiveSize || pdfEditorActiveIndex < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const frame = getEditorFrame(mergeMode, pdfEditorActiveIndex);
    transformRef.current = {
      mode,
      handle,
      pointerId: e.pointerId,
      startPointer: getEditorPointer(e),
      startEdit: pdfEditorActiveItem.edit,
      startBox: pdfEditorBox,
      frame,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleTransformMove(e: React.PointerEvent<HTMLDivElement>) {
    const transform = transformRef.current;
    if (!transform || !pdfEditorActiveItem) return;
    const rect = pdfEditorPageRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pointer = getEditorPointer(e);
    const dx = pointer.x - transform.startPointer.x;
    const dy = pointer.y - transform.startPointer.y;
    const frameW = transform.frame.w * rect.width;
    const frameH = transform.frame.h * rect.height;

    if (transform.mode === "move") {
      updatePageEdit(pdfEditorActiveItem.id, {
        offsetX: clamp(transform.startEdit.offsetX + dx / frameW, -1.2, 1.2),
        offsetY: clamp(transform.startEdit.offsetY + dy / frameH, -1.2, 1.2),
      });
      return;
    }

    const boxCenter = {
      x: (transform.startBox.x + transform.startBox.w / 2) * rect.width,
      y: (transform.startBox.y + transform.startBox.h / 2) * rect.height,
    };
    const startCorner = getBoxCorner(transform.startBox, transform.handle ?? "se", rect);
    const startDistance = Math.max(16, Math.hypot(startCorner.x - boxCenter.x, startCorner.y - boxCenter.y));
    const nextDistance = Math.max(16, Math.hypot(pointer.x - boxCenter.x, pointer.y - boxCenter.y));
    updatePageEdit(pdfEditorActiveItem.id, {
      zoom: clamp(transform.startEdit.zoom * (nextDistance / startDistance), 0.25, 4),
    });
  }

  function endTransform(e?: React.PointerEvent<HTMLDivElement>) {
    if (e && transformRef.current?.pointerId === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
    transformRef.current = null;
  }

  async function exportPdf() {
    if (pdfOrderItems.length === 0) {
      setStatusMessage("Select pages to merge.");
      return;
    }

    setStatusMessage("Building your PDF...");
    const renderedPages = await renderEditedPdfPages(pdfOrderItems, mergeMode, 1800);
    const pdfBytes = await imagesToFullPageA4PDF(renderedPages);
    const pdfBlob = new Blob([Uint8Array.from(pdfBytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(pdfBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = mergeMode === "twoUp" ? "freescanner-2up.pdf" : "freescanner-export.pdf";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("PDF downloaded successfully.");
  }


  async function generateMergePreview() {
    if (pdfOrderItems.length === 0) {
      setMergePreviewUrls([]);
      return;
    }

    const runToken = Symbol("preview");
    previewTokenRef.current = runToken;

    setIsGeneratingPreview(true);
    try {
      const previewItems =
        mergeMode === "single"
          ? pdfOrderItems.slice(0, 4)
          : pdfOrderItems.slice(0, Math.min(pdfOrderItems.length, 8));
      const renderedPages = await renderEditedPdfPages(previewItems, mergeMode, 900);
      if (previewTokenRef.current !== runToken) return;
      const previews = await Promise.all(renderedPages.map((page) => blobToDataUrl(page)));

      setMergePreviewUrls(previews);
    } catch {
      setMergePreviewUrls([]);
    } finally {
      setIsGeneratingPreview(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-4 text-slate-900 sm:px-6 lg:px-8">
      {!isClient ? (
        <div className="mx-auto max-w-7xl rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          Loading FreeScanner...
        </div>
      ) : null}
      {isClient ? (
        <>
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
                  displayItems.map((item) => {
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
                        data-selected={selected ? "true" : "false"}
                        draggable={selected}
                        onDragStart={(e) => onCardDragStart(item.id, e)}
                        onDragOver={(e) => onCardDragOver(item.id, e)}
                        onDragEnd={handlePdfDragEnd}
                      >
                        <div className="absolute left-3 top-3 z-30">
                          {selected ? (
                            <button
                              type="button"
                              aria-label="Drag to reorder"
                              className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-slate-950/90 text-white shadow-lg"
                              style={{
                                cursor: "grab",
                                opacity: draggingPdfId === item.id ? 0.95 : 0.9,
                                transform: draggingPdfId === item.id ? "scale(1.03)" : undefined,
                                touchAction: "none",
                              }}
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
                            <button
                              type="button"
                              onClick={() => startCropForOne(item.id)}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800 transition hover:bg-emerald-100"
                              aria-label={`Edit ${item.name}`}
                              title="Edit image"
                            >
                              <EditIcon />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 transition hover:bg-rose-100"
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
                  {pdfOrderItems.length > 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      Open a preview page to adjust image placement, crop, rotation, and scanner filters on the A4 sheet.
                    </p>
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

      {pdfEditorPageIndex !== null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center">
          <div className="max-h-[96vh] w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">A4 PDF editor</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  Page {pdfEditorPageIndex + 1}
                </h2>
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
                    className="relative aspect-[595/842] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200"
                    onPointerMove={handleTransformMove}
                    onPointerUp={endTransform}
                    onPointerCancel={endTransform}
                  >
                    {pdfEditorPreviewUrl ? (
                      <img
                        src={pdfEditorPreviewUrl}
                        alt={`PDF page ${pdfEditorPageIndex + 1} preview`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-slate-500">
                        Rendering A4 page...
                      </div>
                    )}
                    {isRenderingPdfEditor ? (
                      <div className="absolute right-3 top-3 rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                        Updating
                      </div>
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
                        <h3 className="mt-1 truncate text-base font-semibold text-slate-900">
                          {pdfEditorActiveItem.name}
                        </h3>
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
                          onChange={(e) =>
                            updatePageEdit(pdfEditorActiveItem.id, { filter: e.target.value as PageFilter })
                          }
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
      ) : null}

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
        </>
      ) : null}
    </div>
  );
}

async function renderEditedPdfPages(
  items: ScanItem[],
  mergeMode: "single" | "twoUp",
  width: number
) {
  const height = Math.round(width / A4_RATIO);
  const pages: Blob[] = [];

  if (mergeMode === "single") {
    for (const item of items) {
      const canvas = createA4Canvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      drawPageBackground(ctx, width, height);
      await drawEditedItem(ctx, item, {
        x: width * 0.08,
        y: height * 0.065,
        w: width * 0.84,
        h: height * 0.87,
      });

      pages.push(await canvasToBlob(canvas));
    }
    return pages;
  }

  for (let i = 0; i < items.length; i += 2) {
    const canvas = createA4Canvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    drawPageBackground(ctx, width, height);

    const marginX = width * 0.07;
    const marginY = height * 0.055;
    const gap = height * 0.035;
    const frameW = width - marginX * 2;
    const frameH = (height - marginY * 2 - gap) / 2;

    if (items[i]) {
      await drawEditedItem(ctx, items[i], { x: marginX, y: marginY, w: frameW, h: frameH });
    }

    if (items[i + 1]) {
      await drawEditedItem(ctx, items[i + 1], {
        x: marginX,
        y: marginY + frameH + gap,
        w: frameW,
        h: frameH,
      });
    }

    pages.push(await canvasToBlob(canvas));
  }

  return pages;
}

function createA4Canvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function getEditorFrame(mergeMode: "single" | "twoUp", slotIndex: number): EditorFrame {
  if (mergeMode === "single") {
    return { x: 0.08, y: 0.065, w: 0.84, h: 0.87 };
  }

  const marginX = 0.07;
  const marginY = 0.055;
  const gap = 0.035;
  const frameH = (1 - marginY * 2 - gap) / 2;

  return {
    x: marginX,
    y: slotIndex === 0 ? marginY : marginY + frameH + gap,
    w: 1 - marginX * 2,
    h: frameH,
  };
}

function getEditorBox(
  item: ScanItem,
  imageSize: ImageSize,
  mergeMode: "single" | "twoUp",
  slotIndex: number
): EditorBox {
  const frame = getEditorFrame(mergeMode, slotIndex);
  const crop = item.edit.crop;
  const cropLeft = clamp(crop.left, 0, 0.48);
  const cropTop = clamp(crop.top, 0, 0.48);
  const cropRight = clamp(crop.right, 0, 0.48);
  const cropBottom = clamp(crop.bottom, 0, 0.48);
  const sourceW = Math.max(1, imageSize.w * (1 - cropLeft - cropRight));
  const sourceH = Math.max(1, imageSize.h * (1 - cropTop - cropBottom));
  const pageHeightForWidthOne = 1 / A4_RATIO;
  const sourceRatio = sourceW / sourceH;
  const frameRatio = frame.w / (frame.h * pageHeightForWidthOne);
  const fitByWidth = sourceRatio > frameRatio;

  const baseW = fitByWidth ? frame.w : frame.h * pageHeightForWidthOne * sourceRatio;
  const baseH = fitByWidth ? frame.w / sourceRatio / pageHeightForWidthOne : frame.h;
  const w = baseW * item.edit.zoom;
  const h = baseH * item.edit.zoom;
  const centerX = frame.x + frame.w / 2 + item.edit.offsetX * frame.w;
  const centerY = frame.y + frame.h / 2 + item.edit.offsetY * frame.h;

  return {
    x: centerX - w / 2,
    y: centerY - h / 2,
    w,
    h,
    rotation: item.edit.rotation,
  };
}

function getBoxCorner(box: EditorBox, handle: TransformHandle, rect: DOMRect) {
  const x = handle.includes("w") ? box.x : box.x + box.w;
  const y = handle.includes("n") ? box.y : box.y + box.h;
  return { x: x * rect.width, y: y * rect.height };
}

function drawPageBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

async function drawEditedItem(
  ctx: CanvasRenderingContext2D,
  item: ScanItem,
  frame: { x: number; y: number; w: number; h: number }
) {
  const image = await loadImage(item.previewUrl);
  const crop = item.edit.crop;
  const cropLeft = clamp(crop.left, 0, 0.48);
  const cropTop = clamp(crop.top, 0, 0.48);
  const cropRight = clamp(crop.right, 0, 0.48);
  const cropBottom = clamp(crop.bottom, 0, 0.48);

  const naturalW = image.naturalWidth || image.width;
  const naturalH = image.naturalHeight || image.height;
  const sx = naturalW * cropLeft;
  const sy = naturalH * cropTop;
  const sw = Math.max(1, naturalW * (1 - cropLeft - cropRight));
  const sh = Math.max(1, naturalH * (1 - cropTop - cropBottom));

  const fitScale = Math.min(frame.w / sw, frame.h / sh);
  const drawW = sw * fitScale * item.edit.zoom;
  const drawH = sh * fitScale * item.edit.zoom;
  const centerX = frame.x + frame.w / 2 + item.edit.offsetX * frame.w;
  const centerY = frame.y + frame.h / 2 + item.edit.offsetY * frame.h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.w, frame.h);
  ctx.clip();
  ctx.translate(centerX, centerY);
  ctx.rotate((item.edit.rotation * Math.PI) / 180);
  ctx.filter = getCanvasFilter(item.edit.filter);
  ctx.drawImage(image, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
  ctx.filter = "none";

  if (item.edit.filter === "bw" || item.edit.filter === "enhanced") {
    applyScannerThreshold(ctx, frame, item.edit.filter);
  }
}

function getCanvasFilter(filter: PageFilter) {
  if (filter === "grayscale") return "grayscale(1)";
  if (filter === "bw") return "grayscale(1) contrast(1.8)";
  if (filter === "enhanced") return "grayscale(1) contrast(2.4) brightness(1.08)";
  return "none";
}

function applyScannerThreshold(
  ctx: CanvasRenderingContext2D,
  frame: { x: number; y: number; w: number; h: number },
  filter: Extract<PageFilter, "bw" | "enhanced">
) {
  const x = Math.max(0, Math.round(frame.x));
  const y = Math.max(0, Math.round(frame.y));
  const w = Math.max(1, Math.round(frame.w));
  const h = Math.max(1, Math.round(frame.h));
  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;
  const threshold = filter === "enhanced" ? 185 : 150;

  for (let i = 0; i < data.length; i += 4) {
    const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const value = luminance > threshold ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctx.putImageData(imageData, x, y);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to render PDF page"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.94
    );
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read preview"));
    reader.readAsDataURL(blob);
  });
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
