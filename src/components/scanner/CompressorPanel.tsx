"use client";

import React from "react";
import Slider from "../Slider";
import Upload from "../Upload";
import { compressImageFile } from "../../utils/compressImage";
import { compressPdfFile } from "../../utils/compressPDF";

const MIN_TARGET_KB = 10;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extensionFromMime(type: string) {
  if (type === "application/pdf") return "pdf";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function toDownloadName(file: File, outputType: string) {
  const name = file.name.replace(/\.[^/.]+$/, "");
  const extension = extensionFromMime(outputType);
  return `${name}-compressed.${extension}`;
}

export default function CompressorPanel() {
  const [file, setFile] = React.useState<File | null>(null);
  const [targetKb, setTargetKb] = React.useState<number>(MIN_TARGET_KB);
  const [estimatedBytes, setEstimatedBytes] = React.useState<number | null>(null);
  const [isCompressing, setIsCompressing] = React.useState(false);
  const [resultBytes, setResultBytes] = React.useState<number | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("Upload a file to begin.");

  const originalBytes = file?.size ?? 0;
  const maxTargetKb = Math.max(MIN_TARGET_KB, Math.floor(originalBytes / 1024));
  const isPdf = file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf");

  React.useEffect(() => {
    if (!file) {
      setEstimatedBytes(null);
      setResultBytes(null);
      setWarning(null);
      return;
    }
    const nextEstimated = Math.min(file.size, targetKb * 1024);
    setEstimatedBytes(nextEstimated);
  }, [file, targetKb]);

  function handleSelectFile(nextFile: File) {
    setFile(nextFile);
    setResultBytes(null);
    setWarning(null);
    setStatus("Adjust target size, then compress.");
    const initialTarget = Math.min(Math.max(MIN_TARGET_KB, Math.floor(nextFile.size / 2048)), Math.floor(nextFile.size / 1024));
    setTargetKb(initialTarget);
  }

  async function compressAndDownload() {
    if (!file) return;

    const targetBytes = targetKb * 1024;
    const tooSmallThreshold = Math.max(10 * 1024, Math.floor(file.size * 0.08));
    if (targetBytes < tooSmallThreshold) {
      setWarning("Target size is very small for this file. Result quality may be heavily reduced.");
    } else {
      setWarning(null);
    }

    setIsCompressing(true);
    setStatus("Compressing file...");

    try {
      let output: Blob;
      let outputType = file.type;
      let localWarning: string | undefined;

      if (isPdf) {
        const result = await compressPdfFile(file, { targetBytes, maxIterations: 7, minQuality: 0.2 });
        output = result.blob;
        outputType = result.outputType;
        localWarning = result.warning;
      } else {
        const result = await compressImageFile(file, {
          targetBytes,
          maxIterations: 10,
          minQuality: 0.1,
          preserveFormat: true,
        });
        output = result.blob;
        outputType = result.outputType;
        localWarning = result.warning;
      }

      setResultBytes(output.size);
      if (localWarning) setWarning(localWarning);

      const blobUrl = URL.createObjectURL(output);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = toDownloadName(file, outputType);
      anchor.click();
      URL.revokeObjectURL(blobUrl);
      setStatus("Compressed file downloaded.");
    } catch {
      setStatus("Compression failed. Try a different target or file.");
    } finally {
      setIsCompressing(false);
    }
  }

  return (
    <section className="panel p-5">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">File Compressor</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Compress image or PDF</h2>
        <p className="mt-1 text-sm text-slate-500">Runs entirely in your browser with no upload to server.</p>
      </div>

      <div className="mt-4 space-y-4">
        <Upload onFileSelected={handleSelectFile} disabled={isCompressing} />

        {file ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-900">{file.name}</p>
            <p className="mt-1 text-slate-600">Original size: {formatBytes(file.size)}</p>
            <p className="mt-1 text-slate-500">Type: {isPdf ? "PDF" : file.type || "Image"}</p>
          </div>
        ) : null}

        {file ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <Slider
              min={MIN_TARGET_KB}
              max={maxTargetKb}
              value={Math.min(targetKb, maxTargetKb)}
              onChange={setTargetKb}
              label="Target max size"
            />
            <p className="mt-3 text-sm text-slate-600">
              Estimated output size: {estimatedBytes ? formatBytes(estimatedBytes) : "-"}
            </p>
            {warning ? <p className="mt-2 text-sm font-medium text-amber-700">{warning}</p> : null}
            {resultBytes !== null ? (
              <p className="mt-2 text-sm text-emerald-700">Last output size: {formatBytes(resultBytes)}</p>
            ) : null}

            <button
              type="button"
              onClick={() => void compressAndDownload()}
              disabled={isCompressing}
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isCompressing ? "Compressing..." : "Compress & Download"}
            </button>
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Status</p>
          <p className="mt-1">{status}</p>
        </div>
      </div>
    </section>
  );
}
