"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getPdfFirstPagePreview, getPdfPageCount, imagesToFullPageA4PDF, mergePdfFiles, pdfToImages } from "../src/utils/pdfUtils";
import CropModal from "../src/components/CropModal";
import { supabase, SUPABASE_SCANS_BUCKET, SUPABASE_SCAN_PAGES_TABLE } from "../src/lib/supabaseClient";
import CameraModal from "../src/components/scanner/CameraModal";
import ExportPanel from "../src/components/scanner/ExportPanel";
import PdfMergePanel from "../src/components/scanner/PdfMergePanel";
import PdfEditorModal from "../src/components/scanner/PdfEditorModal";
import ScanGrid from "../src/components/scanner/ScanGrid";
import { A4_RATIO, defaultPageEdit } from "../src/components/scanner/types";
import type { EditorBox, EditorFrame, ImageSize, MergeMode, PageEdit, PageFilter, PdfMergeItem, ScanItem, TransformHandle } from "../src/components/scanner/types";

type WorkspaceMode = "scan" | "pdf";

export default function Home() {
  const [isClient, setIsClient] = useState(false);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("scan");
  const [pdfFiles, setPdfFiles] = useState<PdfMergeItem[]>([]);
  const [pdfOrderIds, setPdfOrderIds] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Ready.");
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [mergePreviewUrls, setMergePreviewUrls] = useState<string[]>([]);
  const SESSION_TTL_MS = 1000 * 60 * 30; // 30 minutes
  const isSupabaseConfigured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const [mergeMode, setMergeMode] = useState<MergeMode>("single");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropQueue, setCropQueue] = useState<string[]>([]);
  const [cropCursor, setCropCursor] = useState(0);
  const [pdfEditorPageIndex, setPdfEditorPageIndex] = useState<number | null>(null);
  const [pdfEditorActiveId, setPdfEditorActiveId] = useState<string | null>(null);
  const [pdfEditorPreviewUrl, setPdfEditorPreviewUrl] = useState<string | null>(null);
  const [isRenderingPdfEditor, setIsRenderingPdfEditor] = useState(false);
  const [pdfEditorImageSizes, setPdfEditorImageSizes] = useState<Record<string, ImageSize>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const pdfEditorPageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const itemsRef = useRef<ScanItem[]>([]);
  const pdfFilesRef = useRef<PdfMergeItem[]>([]);
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
    pdfFilesRef.current = pdfFiles;
  }, [pdfFiles]);

  useEffect(() => {
    const missingPreview = pdfFiles.find((item) => !item.previewUrl && !item.previewFailed);
    if (!missingPreview) return;

    let cancelled = false;
    void getPdfFirstPagePreview(missingPreview.file)
      .then((blob) => {
        if (cancelled) return;
        const previewUrl = URL.createObjectURL(blob);
        setPdfFiles((current) =>
          current.map((item) => (item.id === missingPreview.id ? { ...item, previewUrl, previewFailed: false } : item))
        );
      })
      .catch(() => {
        if (cancelled) return;
        setPdfFiles((current) =>
          current.map((item) => (item.id === missingPreview.id ? { ...item, previewFailed: true } : item))
        );
      });

    return () => {
      cancelled = true;
    };
  }, [pdfFiles]);

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
      pdfFilesRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
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

  async function handlePickedPdfFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    const files = Array.from(fileList).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (files.length === 0) {
      setStatusMessage("Choose PDF files to merge.");
      return;
    }

    setWorkspaceMode("pdf");
    setIsProcessing(true);
    setStatusMessage("Reading PDF details...");

    try {
      const nextItems = await Promise.all(
        files.map(async (file) => {
          const [pageCount, previewBlob] = await Promise.all([
            getPdfPageCount(file).catch(() => null),
            getPdfFirstPagePreview(file).catch(() => null),
          ]);

          return {
            id: crypto.randomUUID(),
            file,
            name: file.name,
            size: file.size,
            pageCount,
            previewUrl: previewBlob ? URL.createObjectURL(previewBlob) : null,
            previewFailed: false,
            createdAt: Date.now(),
          };
        })
      );

      setPdfFiles((current) => [...current, ...nextItems]);
      setStatusMessage(`${nextItems.length} PDF${nextItems.length === 1 ? "" : "s"} added to merge queue.`);
    } catch {
      setStatusMessage("Could not read one of the PDFs. Try a standard, unlocked PDF.");
    } finally {
      setIsProcessing(false);
    }
  }

  function removePdfFile(id: string) {
    setPdfFiles((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  function reorderPdfFile(id: string, overId: string) {
    setPdfFiles((current) => {
      const from = current.findIndex((item) => item.id === id);
      const to = current.findIndex((item) => item.id === overId);
      if (from === -1 || to === -1 || from === to) return current;

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function movePdfFile(id: string, direction: -1 | 1) {
    setPdfFiles((current) => {
      const from = current.findIndex((item) => item.id === id);
      if (from === -1) return current;
      const to = from + direction;
      if (to < 0 || to >= current.length) return current;

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function exportMergedPdfs() {
    if (pdfFiles.length < 2) {
      setStatusMessage("Add at least two PDFs to merge.");
      return;
    }

    setIsProcessing(true);
    setStatusMessage("Merging PDFs...");

    try {
      const pdfBytes = await mergePdfFiles(pdfFiles.map((item) => item.file));
      const pdfBlob = new Blob([Uint8Array.from(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "merged-documents.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
      setStatusMessage("Merged PDF downloaded successfully.");
    } catch {
      setStatusMessage("Could not merge the PDFs. Try unlocked PDF files.");
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
          width: { ideal: 1440 },
          height: { ideal: 2048 },
          aspectRatio: { ideal: A4_RATIO },
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
    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const sourceRatio = sourceWidth / sourceHeight;
    const cropWidth = sourceRatio > A4_RATIO ? Math.round(sourceHeight * A4_RATIO) : sourceWidth;
    const cropHeight = sourceRatio > A4_RATIO ? sourceHeight : Math.round(sourceWidth / A4_RATIO);
    const cropX = Math.max(0, Math.floor((sourceWidth - cropWidth) / 2));
    const cropY = Math.max(0, Math.floor((sourceHeight - cropHeight) / 2));

    canvas.width = 1400;
    canvas.height = Math.round(canvas.width / A4_RATIO);

    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);

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

  function onReorderHandlePointerDown(id: string, e: React.PointerEvent<HTMLElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!pdfOrderIds.includes(id)) return;

    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    handlePdfDragStart(id);
  }

  function onReorderHandlePointerMove(e: React.PointerEvent<HTMLElement>) {
    if (!dragPdfIdRef.current) return;

    e.preventDefault();
    e.stopPropagation();

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const overCard = target?.closest<HTMLElement>("[data-pdf-card='true'][data-selected='true']");
    const overId = overCard?.dataset.pdfId;

    if (!overId) return;
    setDragOverPdfId(overId);
    handlePdfDragOver(overId);
  }

  function onReorderHandlePointerEnd(e: React.PointerEvent<HTMLElement>) {
    if (!dragPdfIdRef.current) return;

    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    handlePdfDragEnd();
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
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          void handlePickedPdfFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div className="mx-auto max-w-7xl">
        <main className="space-y-5">
          <header className="panel overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-white p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Document Workspace</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">FreeScanner</h1>
                <p className="mt-1 text-sm text-slate-500">Ready for the next document.</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="inline-grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setWorkspaceMode("scan")}
                    className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                      workspaceMode === "scan" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
                    }`}
                  >
                    Scan to PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkspaceMode("pdf")}
                    className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                      workspaceMode === "pdf" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-950"
                    }`}
                  >
                    Merge PDFs
                  </button>
                </div>

              </div>
            </div>
            <div className="grid gap-3 bg-slate-50/70 p-4 text-sm sm:grid-cols-3 sm:p-5">
              <div>
                <p className="font-semibold text-slate-950">{workspaceMode === "scan" ? "Scan workspace" : "PDF merge workspace"}</p>
                <p className="mt-1 text-slate-500">{workspaceMode === "scan" ? `${items.length} pages loaded` : `${pdfFiles.length} PDFs loaded`}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-950">Selection</p>
                <p className="mt-1 text-slate-500">{workspaceMode === "scan" ? `${pdfOrderIds.length} pages in PDF` : `${pdfFiles.length} files in order`}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-950">Status</p>
                <p className="mt-1 truncate text-slate-500">{isProcessing ? "Working..." : statusMessage}</p>
              </div>
            </div>
          </header>

          {workspaceMode === "scan" ? (
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <ScanGrid
                items={items}
                displayItems={displayItems}
                pdfOrderIds={pdfOrderIds}
                mergeMode={mergeMode}
                draggingPdfId={draggingPdfId}
                dragOverPdfId={dragOverPdfId}
                onReorderHandlePointerDown={onReorderHandlePointerDown}
                onReorderHandlePointerMove={onReorderHandlePointerMove}
                onReorderHandlePointerEnd={onReorderHandlePointerEnd}
                startCropForOne={startCropForOne}
                removeItem={removeItem}
                onImportScans={() => fileInputRef.current?.click()}
                onOpenCamera={() => void handleCameraOpen()}
                isProcessing={isProcessing}
              />
              <ExportPanel
                mergeMode={mergeMode}
                setMergeMode={setMergeMode}
                pdfOrderItems={pdfOrderItems}
                previewOrderedItems={previewOrderedItems}
                mergePreviewUrls={mergePreviewUrls}
                isGeneratingPreview={isGeneratingPreview}
                isProcessing={isProcessing}
                statusMessage={statusMessage}
                exportPdf={exportPdf}
                openPdfPageEditor={openPdfPageEditor}
              />
            </section>
          ) : (
            <PdfMergePanel
              pdfFiles={pdfFiles}
              isProcessing={isProcessing}
              onAddPdfs={() => pdfInputRef.current?.click()}
              onMergePdfs={exportMergedPdfs}
              onRemovePdf={removePdfFile}
              onMovePdf={movePdfFile}
              onReorderPdf={reorderPdfFile}
            />
          )}
        </main>
      </div>

      <CropModal
        open={cropOpen}
        imageUrl={cropTarget?.previewUrl ?? null}
        title={cropTarget ? `Crop: ${cropTarget.name}` : "Crop selected image"}
        onCancel={cancelCrop}
        onApply={handleCropApply}
      />

      <PdfEditorModal
        open={pdfEditorPageIndex !== null}
        pageIndex={pdfEditorPageIndex}
        mergeMode={mergeMode}
        pdfEditorPageRef={pdfEditorPageRef}
        pdfEditorPreviewUrl={pdfEditorPreviewUrl}
        isRenderingPdfEditor={isRenderingPdfEditor}
        pdfEditorBox={pdfEditorBox}
        pdfEditorItems={pdfEditorItems}
        pdfEditorActiveId={pdfEditorActiveId}
        pdfEditorActiveItem={pdfEditorActiveItem}
        closePdfPageEditor={closePdfPageEditor}
        setPdfEditorActiveId={setPdfEditorActiveId}
        resetPageEdit={resetPageEdit}
        updatePageEdit={updatePageEdit}
        beginTransform={beginTransform}
        handleTransformMove={handleTransformMove}
        endTransform={endTransform}
      />

      <CameraModal
        open={isCameraOpen}
        videoRef={videoRef}
        cameraError={cameraError}
        cameraReady={cameraReady}
        captureFrame={captureFrame}
        closeCamera={closeCamera}
      />
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

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = src;
  });
}
