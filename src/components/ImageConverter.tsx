"use client";

import React from "react";
import Upload from "./Upload";
import { convertImage, type OutputFormat } from "../utils/convertImage";

const outputOptions: { label: string; value: OutputFormat }[] = [
  { label: "JPG", value: "image/jpeg" },
  { label: "PNG", value: "image/png" },
  { label: "WEBP", value: "image/webp" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extensionFromMime(type: OutputFormat) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function mimeLabel(type: string) {
  if (type.includes("png")) return "PNG";
  if (type.includes("webp")) return "WEBP";
  if (type.includes("jpeg") || type.includes("jpg")) return "JPG";
  return type || "Unknown";
}

function estimateConvertedSize(file: File, outputFormat: OutputFormat, quality: number) {
  const inputType = file.type.toLowerCase();
  const inputSize = file.size;

  let baseRatio = 1;
  if (outputFormat === "image/jpeg") {
    if (inputType.includes("png")) baseRatio = 0.52;
    else if (inputType.includes("webp")) baseRatio = 1.18;
    else baseRatio = 0.88;
    return Math.max(1024, Math.round(inputSize * baseRatio * quality));
  }

  if (outputFormat === "image/webp") {
    if (inputType.includes("png")) baseRatio = 0.45;
    else if (inputType.includes("jpeg") || inputType.includes("jpg")) baseRatio = 0.78;
    else baseRatio = 0.8;
    return Math.max(1024, Math.round(inputSize * baseRatio * quality));
  }

  // PNG is lossless, so size can increase/decrease based on image complexity.
  if (inputType.includes("png")) return inputSize;
  if (inputType.includes("jpeg") || inputType.includes("jpg")) return Math.round(inputSize * 1.35);
  return Math.round(inputSize * 1.15);
}

export default function ImageConverter() {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [outputFormat, setOutputFormat] = React.useState<OutputFormat>("image/jpeg");
  const [quality, setQuality] = React.useState(0.85);
  const [isConverting, setIsConverting] = React.useState(false);
  const [outputSize, setOutputSize] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState("Upload an image to start conversion.");
  const estimatedOutputSize = React.useMemo(() => {
    if (!file) return null;
    return estimateConvertedSize(file, outputFormat, quality);
  }, [file, outputFormat, quality]);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onFileSelected(nextFile: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextPreview = URL.createObjectURL(nextFile);
    setFile(nextFile);
    setPreviewUrl(nextPreview);
    setOutputSize(null);
    setStatus("Ready to convert.");
  }

  async function handleConvert() {
    if (!file) return;

    setIsConverting(true);
    setStatus("Converting image...");

    try {
      const result = await convertImage({ file, outputFormat, quality });
      setOutputSize(result.blob.size);

      const downloadUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      anchor.href = downloadUrl;
      anchor.download = `${baseName}-converted.${extensionFromMime(result.outputFormat)}`;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
      setStatus("Converted image downloaded.");
    } catch {
      setStatus("Conversion failed. Try another format.");
    } finally {
      setIsConverting(false);
    }
  }

  return (
    <section className="panel p-5">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Image Converter</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Convert JPG, PNG, WEBP</h2>
        <p className="mt-1 text-sm text-slate-500">Client-side conversion preserving original resolution.</p>
      </div>

      <div className="mt-4 space-y-4">
        <Upload onFileSelected={onFileSelected} acceptedTypes="image/*,.heic,.heif" disabled={isConverting} />

        {file && previewUrl ? (
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <img src={previewUrl} alt={`Preview of ${file.name}`} className="aspect-square w-full object-cover" />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="font-semibold text-slate-900">{file.name}</p>
              <p className="mt-1 text-slate-600">Original format: {mimeLabel(file.type)}</p>
              <p className="mt-1 text-slate-600">Original size: {formatBytes(file.size)}</p>
              {estimatedOutputSize !== null ? (
                <p className="mt-1 text-indigo-700">Estimated size before conversion: {formatBytes(estimatedOutputSize)}</p>
              ) : null}
              {outputSize !== null ? <p className="mt-1 text-emerald-700">Output size: {formatBytes(outputSize)}</p> : null}
            </div>
          </div>
        ) : null}

        {file ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Output format</span>
              <select
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-emerald-200 focus:ring"
              >
                {outputOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {outputFormat !== "image/png" ? (
              <label className="mt-4 block">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-800">Quality</span>
                  <span className="text-slate-500">{quality.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </label>
            ) : null}

            <button
              type="button"
              onClick={() => void handleConvert()}
              disabled={isConverting}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isConverting ? "Converting..." : "Convert & Download"}
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
