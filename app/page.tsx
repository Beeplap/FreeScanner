"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { imagesToPDF, pdfToImages } from "../src/utils/pdfUtils";

type ScanItem = {
  id: string;
  name: string;
  kind: "upload" | "camera" | "pdf-page";
  file: Blob;
  previewUrl: string;
  createdAt: number;
};

type CollageLayout = "grid" | "story" | "strip";

const collageOptions: { id: CollageLayout; label: string; detail: string }[] = [
  { id: "grid", label: "Photo Grid", detail: "Best for notes and receipts" },
  { id: "story", label: "Story Stack", detail: "Editorial vertical layout" },
  { id: "strip", label: "Film Strip", detail: "Compact horizontal preview" },
];

const quickActions = [
  { title: "Smart Scan", detail: "Use camera permission to capture fresh document shots." },
  { title: "Photo Collage", detail: "Select multiple images and export a polished collage." },
  { title: "PDF Export", detail: "Turn scanned pages into a single downloadable PDF." },
];

const tools = [
  "ID cards",
  "Homework sheets",
  "Contracts",
  "Whiteboards",
  "Travel docs",
  "Invoices",
];

function iconWrap(icon: string, tint: string) {
  return (
    <span
      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-xl shadow-sm"
      style={{ background: tint }}
    >
      {icon}
    </span>
  );
}

export default function Home() {
  const [items, setItems] = useState<ScanItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [collageLayout, setCollageLayout] = useState<CollageLayout>("grid");
  const [statusMessage, setStatusMessage] = useState("Ready to scan, upload, and organize.");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const itemsRef = useRef<ScanItem[]>([]);

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeId) ?? null,
    [activeId, items]
  );

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds]
  );

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }

  async function addBlobItems(blobs: { blob: Blob; name: string; kind: ScanItem["kind"] }[]) {
    if (blobs.length === 0) return;

    const nextItems = blobs.map(({ blob, name, kind }) => ({
      id: crypto.randomUUID(),
      name,
      kind,
      file: blob,
      previewUrl: URL.createObjectURL(blob),
      createdAt: Date.now(),
    }));

    setItems((current) => [...nextItems, ...current]);
    setActiveId((current) => current ?? nextItems[0].id);
    setSelectedIds((current) => {
      const ids = nextItems.map((item) => item.id);
      return Array.from(new Set([...ids, ...current]));
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
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]
    );
  }

  function removeItem(id: string) {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });

    setSelectedIds((current) => current.filter((itemId) => itemId !== id));
    setActiveId((current) => {
      if (current !== id) return current;
      const next = items.find((item) => item.id !== id);
      return next?.id ?? null;
    });
  }

  async function exportPdf() {
    if (items.length === 0) return;

    setStatusMessage("Building your PDF...");
    const pdfBytes = await imagesToPDF(items.map((item) => item.file));
    const pdfBlob = new Blob([Uint8Array.from(pdfBytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(pdfBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "freescanner-export.pdf";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("PDF downloaded successfully.");
  }

  async function exportCollage() {
    if (selectedItems.length === 0) {
      setStatusMessage("Pick at least one image for the collage.");
      return;
    }

    setStatusMessage("Rendering collage...");
    const canvas = await renderCollage(selectedItems, collageLayout);
    const url = canvas.toDataURL("image/jpeg", 0.94);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `freescanner-collage-${collageLayout}.jpg`;
    anchor.click();
    setStatusMessage("Collage exported.");
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handlePickedFiles(event.dataTransfer.files);
  }

  const storageLabel =
    items.length === 0
      ? "No files yet"
      : `${items.length} page${items.length > 1 ? "s" : ""} in workspace`;

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
      <input
        ref={mobileCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          void handlePickedFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="glass-panel soft-scrollbar flex flex-col gap-6 rounded-[28px] p-5 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:overflow-auto">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-400 via-teal-400 to-sky-500 text-lg font-semibold text-white">
              FS
            </div>
            <div>
              <div className="display-font text-2xl font-semibold">FreeScanner</div>
              <p className="text-sm text-slate-500">Scan, organize, export</p>
            </div>
          </div>

          <nav className="space-y-2 text-sm">
            {[
              ["Workspace", "Active tray and previews"],
              ["Camera", "Use mobile or laptop lens"],
              ["Collages", "Compose selected images"],
              ["Exports", "PDF and image downloads"],
            ].map(([label, detail], index) => (
              <div
                key={label}
                className={`rounded-2xl border px-4 py-3 ${
                  index === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-transparent bg-white/60 text-slate-700"
                }`}
              >
                <div className="font-semibold">{label}</div>
                <div className="mt-1 text-xs text-slate-500">{detail}</div>
              </div>
            ))}
          </nav>

          <div className="rounded-[24px] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-900/20">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Smart Capture</p>
            <h2 className="mt-3 display-font text-3xl leading-tight">
              Built for quick document cleanup on phones and laptops.
            </h2>
            <p className="mt-3 text-sm text-slate-300">
              Grant camera permission to scan documents live, or upload existing images and PDFs.
            </p>
            <button
              onClick={() => void handleCameraOpen()}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              Open Camera
            </button>
          </div>

          <div className="rounded-[24px] bg-white/80 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Scan Tray</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{storageLabel}</span>
            </div>
            <div className="mt-4 grid gap-3">
              {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                  Your captured pages will appear here.
                </div>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveId(item.id)}
                    className={`flex items-center gap-3 rounded-2xl border p-2 text-left transition ${
                      activeId === item.id
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-white bg-white hover:border-slate-200"
                    }`}
                  >
                    <img src={item.previewUrl} alt={item.name} className="h-16 w-12 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{item.name}</div>
                      <div className="mt-1 text-xs capitalize text-slate-500">{item.kind.replace("-", " ")}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <main className="space-y-4">
          <header className="glass-panel rounded-[28px] px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-sky-700">Document Workflow</p>
                <h1 className="display-font mt-2 text-4xl leading-none text-slate-900 sm:text-5xl">
                  CamScanner-inspired, redesigned for FreeScanner.
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
                  Upload receipts, notes, IDs, homework, or open your camera on mobile and desktop to create a modern scan workspace with collage export built in.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:flex">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800"
                >
                  Import Files
                </button>
                <button
                  onClick={() => mobileCameraInputRef.current?.click()}
                  className="rounded-2xl bg-white px-5 py-3 font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                >
                  Mobile Capture
                </button>
              </div>
            </div>
          </header>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_380px]">
            <div className="glass-panel rounded-[32px] p-4 sm:p-6">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`relative overflow-hidden rounded-[28px] border border-dashed px-5 py-10 text-center transition sm:px-8 ${
                  isDragging ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white/70"
                }`}
              >
                <div className="absolute inset-x-10 top-0 h-32 rounded-full bg-linear-to-r from-sky-200/50 via-white to-emerald-200/50 blur-3xl" />
                <div className="relative">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[28px] bg-linear-to-br from-sky-500 via-cyan-400 to-emerald-400 text-4xl text-white shadow-lg shadow-cyan-200/60">
                    +
                  </div>
                  <h2 className="mt-5 text-2xl font-semibold text-slate-900">Drag files here or choose a scan flow</h2>
                  <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                    Inspired by the reference layout, but tailored for a cleaner FreeScanner workflow with responsive controls and camera access.
                  </p>
                  <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                    <button
                      onClick={() => void handleCameraOpen()}
                      className="rounded-2xl bg-emerald-500 px-5 py-3 font-semibold text-white transition hover:bg-emerald-600"
                    >
                      Scan with Camera
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-2xl bg-white px-5 py-3 font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                    >
                      Import Images or PDF
                    </button>
                    <button
                      onClick={() => mobileCameraInputRef.current?.click()}
                      className="rounded-2xl bg-white px-5 py-3 font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                    >
                      Use Phone Camera
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {quickActions.map((action, index) => (
                  <div key={action.title} className="rounded-[24px] bg-white/80 p-4 shadow-sm ring-1 ring-slate-100">
                    {iconWrap(index === 0 ? "📷" : index === 1 ? "🖼️" : "📄", index === 0 ? "#dcfce7" : index === 1 ? "#dbeafe" : "#fef3c7")}
                    <h3 className="mt-4 font-semibold text-slate-900">{action.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{action.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-[32px] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Live Preview</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">
                    {activeItem ? activeItem.name : "No page selected"}
                  </h2>
                </div>
                <button
                  onClick={exportPdf}
                  disabled={items.length === 0}
                  className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Export PDF
                </button>
              </div>

              <div className="mt-5 overflow-hidden rounded-[28px] bg-slate-950/95 p-3">
                {activeItem ? (
                  <img src={activeItem.previewUrl} alt={activeItem.name} className="aspect-4/5 w-full rounded-[22px] object-cover" />
                ) : (
                  <div className="flex aspect-4/5 items-center justify-center rounded-[22px] border border-white/10 text-sm text-slate-300">
                    Preview your latest upload or captured document here.
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {tools.map((tool) => (
                  <span key={tool} className="rounded-full bg-white px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="glass-panel rounded-[32px] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Your Pages</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">Select scans for preview, export, or collage</h2>
                </div>
                <div className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200">
                  {selectedIds.length} selected
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {items.length === 0 ? (
                  <div className="col-span-full rounded-[28px] border border-dashed border-slate-200 bg-white/70 px-6 py-14 text-center text-slate-500">
                    Start with the camera, mobile capture, or drag-and-drop to build your workspace.
                  </div>
                ) : (
                  items.map((item) => {
                    const selected = selectedIds.includes(item.id);
                    return (
                      <article
                        key={item.id}
                        className={`overflow-hidden rounded-[28px] border bg-white shadow-sm transition ${
                          selected ? "border-emerald-300 shadow-emerald-100" : "border-white"
                        }`}
                      >
                        <button onClick={() => setActiveId(item.id)} className="block w-full">
                          <img src={item.previewUrl} alt={item.name} className="aspect-4/3 w-full object-cover" />
                        </button>
                        <div className="space-y-3 p-4">
                          <div>
                            <h3 className="truncate font-semibold text-slate-900">{item.name}</h3>
                            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                              {item.kind === "camera" ? "Camera Scan" : item.kind === "pdf-page" ? "PDF Page" : "Imported Image"}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => toggleSelected(item.id)}
                              className={`flex-1 rounded-2xl px-3 py-2 text-sm font-medium transition ${
                                selected
                                  ? "bg-emerald-500 text-white hover:bg-emerald-600"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              }`}
                            >
                              {selected ? "Selected" : "Select"}
                            </button>
                            <button
                              onClick={() => removeItem(item.id)}
                              className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-100"
                            >
                              Remove
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
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Photo Collage</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Turn selected scans into one shareable image</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Choose a layout, pick the pages you want, and export a ready-to-share collage for WhatsApp, email, or quick review.
              </p>

              <div className="mt-5 grid gap-3">
                {collageOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setCollageLayout(option.id)}
                    className={`rounded-[24px] border p-4 text-left transition ${
                      collageLayout === option.id
                        ? "border-sky-300 bg-sky-50"
                        : "border-white bg-white hover:border-slate-200"
                    }`}
                  >
                    <div className="font-semibold text-slate-900">{option.label}</div>
                    <div className="mt-1 text-sm text-slate-500">{option.detail}</div>
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-[28px] bg-slate-950 p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-300">Selected pages</div>
                    <div className="mt-1 text-3xl font-semibold">{selectedItems.length}</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-slate-200">
                    Layout: {collageLayout}
                  </div>
                </div>
                <button
                  onClick={() => void exportCollage()}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 font-semibold text-slate-950 transition hover:bg-slate-100"
                >
                  Export Collage
                </button>
              </div>

              <div className="mt-4 rounded-[24px] bg-white/80 p-4 text-sm text-slate-500">
                <p className="font-semibold text-slate-800">Status</p>
                <p className="mt-2 leading-6">{isProcessing ? "Processing files..." : statusMessage}</p>
              </div>
            </div>
          </section>
        </main>
      </div>

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

  const images = await Promise.all(items.slice(0, 4).map((item) => loadImage(item.previewUrl)));

  if (layout === "strip") {
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

  if (layout === "story") {
    canvas.width = 1080;
    canvas.height = 1600;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const heights = [620, 400, 400];
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
  canvas.height = 1400;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const gap = 28;
  const cell = (canvas.width - gap * 3) / 2;
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
