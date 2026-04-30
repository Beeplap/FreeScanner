/**
 * Utility functions for converting between image blobs and PDF documents.
 */

import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

export async function imagesToPDF(images: Blob[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;
  for (const blob of images) {
    const arrayBuffer = await blob.arrayBuffer();
    const type = blob.type;
    const embedded = type === "image/png"
      ? await pdfDoc.embedPng(arrayBuffer)
      : await pdfDoc.embedJpg(arrayBuffer);
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    const { width, height } = embedded.scale(1);
    const maxW = A4_WIDTH * 0.9;
    const maxH = A4_HEIGHT * 0.9;
    const scale = Math.min(1, maxW / width, maxH / height);
    const w = width * scale;
    const h = height * scale;
    const x = (A4_WIDTH - w) / 2;
    const y = (A4_HEIGHT - h) / 2;
    page.drawImage(embedded, { x, y, width: w, height: h });
  }
  return pdfDoc.save();
}

export async function imagesToFullPageA4PDF(images: Blob[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;

  for (const blob of images) {
    const arrayBuffer = await blob.arrayBuffer();
    const embedded = blob.type === "image/png"
      ? await pdfDoc.embedPng(arrayBuffer)
      : await pdfDoc.embedJpg(arrayBuffer);
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawImage(embedded, { x: 0, y: 0, width: A4_WIDTH, height: A4_HEIGHT });
  }

  return pdfDoc.save();
}

export async function imagesToA4TwoUpPDF(images: Blob[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;

  const margin = 30;
  const gap = 12;
  const contentW = A4_WIDTH - margin * 2;
  const contentH = A4_HEIGHT - margin * 2;
  const halfH = (contentH - gap) / 2;

  for (let i = 0; i < images.length; i += 2) {
    const topBlob = images[i];
    const bottomBlob = images[i + 1];

    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

    if (topBlob) {
      const arrayBuffer = await topBlob.arrayBuffer();
      const type = topBlob.type;
      const embedded =
        type === "image/png" ? await pdfDoc.embedPng(arrayBuffer) : await pdfDoc.embedJpg(arrayBuffer);
      const { width, height } = embedded.scale(1);

      const scale = Math.min(1, contentW / width, halfH / height);
      const w = width * scale;
      const h = height * scale;
      const x = margin + (contentW - w) / 2;
      const y = margin + halfH + gap + (halfH - h) / 2; // PDF origin is bottom-left

      page.drawImage(embedded, { x, y, width: w, height: h });
    }

    if (bottomBlob) {
      const arrayBuffer = await bottomBlob.arrayBuffer();
      const type = bottomBlob.type;
      const embedded =
        type === "image/png" ? await pdfDoc.embedPng(arrayBuffer) : await pdfDoc.embedJpg(arrayBuffer);
      const { width, height } = embedded.scale(1);

      const scale = Math.min(1, contentW / width, halfH / height);
      const w = width * scale;
      const h = height * scale;
      const x = margin + (contentW - w) / 2;
      const y = margin + (halfH - h) / 2;

      page.drawImage(embedded, { x, y, width: w, height: h });
    }
  }

  return pdfDoc.save();
}

export async function pdfToImages(file: File): Promise<Blob[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const result: Blob[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => {
        if (!value) {
          reject(new Error("Failed to convert canvas to blob"));
          return;
        }
        resolve(value);
      }, "image/png")
    );
    result.push(blob);
    canvas.remove();
  }
  return result;
}
