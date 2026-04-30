"use client";

export type PageFilter = "none" | "grayscale" | "bw" | "enhanced";

export type PageEdit = {
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

export type ScanItem = {
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

export type PdfMergeItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number | null;
  previewUrl: string | null;
  previewFailed?: boolean;
  createdAt: number;
};

export type ImageSize = { w: number; h: number };
export type EditorFrame = { x: number; y: number; w: number; h: number };
export type EditorBox = EditorFrame & { rotation: number };
export type TransformHandle = "nw" | "ne" | "se" | "sw";
export type MergeMode = "single" | "twoUp";
export type CollageLayout = "grid" | "story" | "strip";

export const A4_RATIO = 595.28 / 841.89;

export const defaultPageEdit: PageEdit = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
  rotation: 0,
  crop: { top: 0, right: 0, bottom: 0, left: 0 },
  filter: "none",
};

export const filterOptions: { id: PageFilter; label: string }[] = [
  { id: "none", label: "Original" },
  { id: "grayscale", label: "Grayscale" },
  { id: "bw", label: "Black & white" },
  { id: "enhanced", label: "Enhanced B/W" },
];
