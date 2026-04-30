import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

export type CompressPdfResult = {
  blob: Blob;
  iterations: number;
  outputType: "application/pdf";
  warning?: string;
};

type CompressPdfOptions = {
  targetBytes: number;
  maxIterations?: number;
  minQuality?: number;
};

const pdfWorkerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

function ensurePdfWorker() {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
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
      quality
    );
  });
}

async function rasterizePdfPages(file: File, scale: number, quality: number) {
  ensurePdfWorker();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isOffscreenCanvasSupported: false,
  });
  const pdf = await loadingTask.promise;

  try {
    const pages: { blob: Blob; widthPt: number; heightPt: number }[] = [];

    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob = await canvasToBlob(canvas, quality);
      canvas.remove();

      const unit = viewport.scale / 72;
      const widthPt = viewport.width / unit;
      const heightPt = viewport.height / unit;
      pages.push({ blob, widthPt, heightPt });
    }

    return pages;
  } finally {
    await pdf.destroy?.();
  }
}

async function buildPdfFromRasterizedPages(
  pages: { blob: Blob; widthPt: number; heightPt: number }[]
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();

  for (const page of pages) {
    const bytes = await page.blob.arrayBuffer();
    const image = await pdfDoc.embedJpg(bytes);
    const pdfPage = pdfDoc.addPage([page.widthPt, page.heightPt]);
    pdfPage.drawImage(image, { x: 0, y: 0, width: page.widthPt, height: page.heightPt });
  }

  const outputBytes = await pdfDoc.save();
  return new Blob([outputBytes], { type: "application/pdf" });
}

export async function compressPdfFile(file: File, options: CompressPdfOptions): Promise<CompressPdfResult> {
  const maxIterations = options.maxIterations ?? 7;
  const minQuality = options.minQuality ?? 0.2;

  let bestBlob: Blob = file;
  let bestDelta = Math.abs(file.size - options.targetBytes);
  let warning: string | undefined;

  for (let i = 0; i < maxIterations; i += 1) {
    const ratio = i / Math.max(1, maxIterations - 1);
    const quality = Math.max(minQuality, 0.92 - ratio * 0.72);
    const scale = Math.max(0.55, 1 - ratio * 0.4);
    const rasterizedPages = await rasterizePdfPages(file, scale, quality);
    const compressedBlob = await buildPdfFromRasterizedPages(rasterizedPages);
    const delta = Math.abs(compressedBlob.size - options.targetBytes);

    if (delta < bestDelta || compressedBlob.size <= options.targetBytes) {
      bestBlob = compressedBlob;
      bestDelta = delta;
    }

    if (compressedBlob.size <= options.targetBytes) {
      return { blob: compressedBlob, iterations: i + 1, outputType: "application/pdf" };
    }
  }

  if (bestBlob.size > options.targetBytes) {
    warning = "Target is very small for this PDF. Downloading closest smaller-quality result.";
  }

  return { blob: bestBlob, iterations: maxIterations, outputType: "application/pdf", warning };
}
